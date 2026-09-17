package edu.kit.cbc.editor.verifier;

import io.micronaut.context.annotation.Context;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.logging.Logger;
import java.util.stream.Collectors;

/**
 * Builds the Verifier Catalog once at application startup and serves it from an immutable
 * cache for the backend's lifetime — no refresh, no liveness checks per request. A Verifier
 * that comes back online is picked up only on backend restart.
 *
 * <p>The Catalog is assembled by iterating the {@link VerifierRegistry} in order, fetching each
 * Verifier's {@link SelfDescription} through the {@link VerifierClient} (by id — this service
 * never sees a URL), validating it with the {@link SelfDescriptionValidator}, and merging it
 * into a Catalog entry via {@link #merge(String, SelfDescription)}. The Functional Verifier is
 * prepended through the very same merge step from the constant
 * {@link #FUNCTIONAL_SELF_DESCRIPTION}; moving it behind the Verifier API later means deleting
 * the constant and adding a Registry entry, nothing else.
 *
 * <p>A Verifier that is <em>unreachable</em> — still, after the retries of the
 * {@link VerifierCatalogConfiguration} — or whose Self-Description is <em>invalid</em> (does
 * not parse, or violates the schema; never retried) is not dropped but <strong>locked
 * off</strong>: it keeps its place in Registry order as
 * {@link #lockedOff(String, VerifierRegistryEntry)}, so the user's Verifier Overrides for it
 * survive, and the backend log carries a warning with the detailed reason. The Catalog then
 * carries one {@code message} naming every unavailable Verifier and why, for the frontend
 * console.
 *
 * <p>Once a Self-Description is validated, the Registry entry's policy is applied over it —
 * {@code label}, {@code enabled}, {@code toggleable} and any {@code settings.<id>.default} — by
 * {@link #applyPolicy(Verifier, VerifierRegistryEntry)}. A policy naming a setting id the
 * Verifier does not declare is logged as a warning and otherwise ignored. A locked-off entry
 * only takes the policy's {@code label} (over the {@code "<id> (offline)"} fallback); its
 * {@code enabled}/{@code toggleable} stay locked regardless of policy, and it has no settings to
 * override.
 */
@Context
public class VerifierCatalogService {

    /** Id of the built-in Functional Verifier; always first in the Catalog, always enabled. */
    public static final String FUNCTIONAL_VERIFIER_ID = "func";

    /**
     * The Functional Verifier's Self-Description: locked on ({@code enabled: true},
     * {@code toggleable: false}), no settings, no variables, no status placeholder.
     */
    public static final SelfDescription FUNCTIONAL_SELF_DESCRIPTION = new SelfDescription(
        "Functional correctness",
        true,
        false,
        null,
        List.of(),
        List.of(),
        null
    );

    private static final Logger LOGGER = Logger.getGlobal();

    private final VerifierCatalog catalog;

    public VerifierCatalogService(
        VerifierRegistry registry,
        VerifierClient client,
        VerifierCatalogConfiguration configuration
    ) {
        this.catalog = build(registry, client, configuration);
    }

    /** The cached Verifier Catalog. The same instance on every call. */
    public VerifierCatalog catalog() {
        return catalog;
    }

    /**
     * The merge step every Catalog entry passes through: the Registry-assigned id joined with
     * the Verifier's Self-Description. Settings and variables the Verifier omitted become
     * empty lists, since the Catalog always carries the arrays. Registry policy is not applied
     * yet.
     *
     * @param id the id the Verifier Registry assigns to the Verifier
     * @param description what the Verifier declares about itself
     * @return the Catalog entry
     */
    static Verifier merge(String id, SelfDescription description) {
        return new Verifier(
            id,
            description.label(),
            description.enabled(),
            description.toggleable(),
            description.statusPlaceholder(),
            description.settings() == null ? List.of() : List.copyOf(description.settings()),
            description.variables() == null ? List.of() : List.copyOf(description.variables()),
            description.allowFunctionalVariables()
        );
    }

    /**
     * The locked-off entry of a Verifier that is unavailable at startup: {@code enabled: false},
     * {@code toggleable: false}, no settings, no variables, no status placeholder. The label is
     * the fallback {@code "<id> (offline)"}, unless {@code policy} overrides it — the one policy
     * field a locked-off entry still honours; {@code enabled}/{@code toggleable} stay locked
     * regardless of policy. Goes through the same merge step as every other entry, so it is
     * shaped exactly like one.
     *
     * @param id the Verifier's Registry id
     * @param policy the Registry entry, for its {@code label} override, or {@code null}
     * @return the Catalog entry
     */
    static Verifier lockedOff(String id, VerifierRegistryEntry policy) {
        String label = policy != null && policy.getLabel() != null ? policy.getLabel() : id + " (offline)";
        return merge(id, new SelfDescription(label, false, false, null, List.of(), List.of(), null));
    }

    /**
     * Applies a Registry entry's policy over an already-merged Catalog entry: {@code label},
     * {@code enabled} and {@code toggleable} are replaced where the policy sets them, and every
     * setting the policy names a {@code default} for is replaced accordingly. A policy field left
     * unset ({@code null}, or a setting id absent from {@code settings}) keeps the Verifier's own
     * value. Not used for locked-off entries — see {@link #lockedOff(String, VerifierRegistryEntry)}.
     *
     * @param verifier the plain merge of id and Self-Description
     * @param policy the Registry entry the Verifier is registered under
     * @return the Catalog entry with policy applied
     */
    static Verifier applyPolicy(Verifier verifier, VerifierRegistryEntry policy) {
        return new Verifier(
            verifier.id(),
            policy.getLabel() != null ? policy.getLabel() : verifier.label(),
            policy.getEnabled() != null ? policy.getEnabled() : verifier.enabled(),
            policy.getToggleable() != null ? policy.getToggleable() : verifier.toggleable(),
            verifier.statusPlaceholder(),
            applySettingDefaults(verifier.id(), verifier.settings(), policy),
            verifier.variables(),
            verifier.allowFunctionalVariables()
        );
    }

    /**
     * Replaces the {@code default} of every setting {@code policy} names one for; a policy
     * {@code settings.<id>.default} for a setting id the Verifier does not declare is logged as a
     * warning and ignored.
     */
    private static List<VerifierSetting> applySettingDefaults(
        String id, List<VerifierSetting> settings, VerifierRegistryEntry policy
    ) {
        if (policy.getSettings().isEmpty()) {
            return settings;
        }
        Set<String> knownSettingIds = settings.stream().map(VerifierSetting::id).collect(Collectors.toSet());
        for (String settingId : policy.policedSettingIds()) {
            if (!knownSettingIds.contains(settingId)) {
                LOGGER.warning(String.format(
                    "Verifier Registry policy for '%s' overrides unknown setting id '%s'; ignored", id, settingId));
            }
        }
        return settings.stream()
            .map(setting -> policy.settingDefault(setting.id()).map(setting::withDefault).orElse(setting))
            .toList();
    }

    /** Why a Verifier is unavailable, in the words of the Catalog {@code message}. */
    private enum Unavailability {
        UNREACHABLE("unreachable"),
        INVALID_DESCRIPTION("invalid description");

        private final String wording;

        Unavailability(String wording) {
            this.wording = wording;
        }
    }

    /** One locked-off Verifier and why. */
    private record Unavailable(String id, Unavailability why) {}

    private static VerifierCatalog build(
        VerifierRegistry registry,
        VerifierClient client,
        VerifierCatalogConfiguration configuration
    ) {
        List<Verifier> verifiers = new ArrayList<>();
        List<Unavailable> unavailable = new ArrayList<>();
        verifiers.add(merge(FUNCTIONAL_VERIFIER_ID, FUNCTIONAL_SELF_DESCRIPTION));
        for (VerifierRegistryEntry entry : registry.entries()) {
            String id = entry.getId();
            try {
                SelfDescription description = describeWithRetry(id, client, configuration);
                SelfDescriptionValidator.validate(id, description);
                verifiers.add(applyPolicy(merge(id, description), entry));
                LOGGER.info(String.format("Verifier '%s' described itself and joins the Verifier Catalog", id));
            } catch (VerifierUnreachableException e) {
                lockOff(verifiers, unavailable, id, Unavailability.UNREACHABLE, e, entry);
            } catch (InvalidSelfDescriptionException e) {
                lockOff(verifiers, unavailable, id, Unavailability.INVALID_DESCRIPTION, e, entry);
            }
        }
        LOGGER.info(String.format("Verifier Catalog built with %d entries, %d locked off",
            verifiers.size(), unavailable.size()));
        return new VerifierCatalog(verifiers, message(unavailable));
    }

    /**
     * Asks the Verifier for its Self-Description, retrying as configured while it is
     * <em>unreachable</em>. An <em>invalid</em> answer is returned to the caller immediately.
     */
    private static SelfDescription describeWithRetry(
        String id,
        VerifierClient client,
        VerifierCatalogConfiguration configuration
    ) throws VerifierUnreachableException, InvalidSelfDescriptionException {
        int attempts = configuration.getRetries() + 1;
        for (int attempt = 1; ; attempt++) {
            try {
                return client.describe(id);
            } catch (VerifierUnreachableException e) {
                if (attempt >= attempts) {
                    throw new VerifierUnreachableException(
                        "no answer in " + plural(attempts, "attempt") + ": " + e.getMessage(), e);
                }
                LOGGER.info(String.format("Verifier '%s' unreachable (attempt %d of %d), retrying in %d ms: %s",
                    id, attempt, attempts, configuration.getRetryDelay().toMillis(), e.getMessage()));
                if (!pause(configuration.getRetryDelay())) {
                    throw new VerifierUnreachableException(
                        "startup interrupted after " + plural(attempt, "attempt") + ": " + e.getMessage(), e);
                }
            }
        }
    }

    /** Sleeps for {@code delay}; {@code false} if interrupted meanwhile (the flag is restored). */
    private static boolean pause(Duration delay) {
        if (delay.isZero()) {
            return true;
        }
        try {
            Thread.sleep(delay.toMillis());
            return true;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private static String plural(int count, String noun) {
        return count + " " + noun + (count == 1 ? "" : "s");
    }

    private static void lockOff(
        List<Verifier> verifiers,
        List<Unavailable> unavailable,
        String id,
        Unavailability why,
        VerifierClientException cause,
        VerifierRegistryEntry entry
    ) {
        verifiers.add(lockedOff(id, entry));
        unavailable.add(new Unavailable(id, why));
        LOGGER.warning(String.format("Verifier '%s' is locked off in the Verifier Catalog (%s): %s",
            id, why.wording, cause.getMessage()));
    }

    /**
     * The console line for the frontend, e.g. {@code "2 verifiers unavailable: eebc (unreachable),
     * sec (invalid description)"}; {@code null} when every Verifier loaded.
     */
    private static String message(List<Unavailable> unavailable) {
        if (unavailable.isEmpty()) {
            return null;
        }
        return plural(unavailable.size(), "verifier") + " unavailable: "
            + unavailable.stream()
                .map(entry -> entry.id() + " (" + entry.why().wording + ")")
                .collect(Collectors.joining(", "));
    }
}
