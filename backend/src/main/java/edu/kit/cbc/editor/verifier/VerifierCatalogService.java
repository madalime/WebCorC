package edu.kit.cbc.editor.verifier;

import io.micronaut.context.annotation.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * Builds the Verifier Catalog once at application startup and serves it from an immutable
 * cache for the backend's lifetime — no refresh, no liveness checks per request.
 *
 * <p>The Catalog is assembled by iterating the {@link VerifierRegistry} in order, fetching each
 * Verifier's {@link SelfDescription} through the {@link VerifierClient} (by id — this service
 * never sees a URL) and merging it into a Catalog entry via
 * {@link #merge(String, SelfDescription)}. The Functional Verifier is prepended through the
 * very same merge step from the constant {@link #FUNCTIONAL_SELF_DESCRIPTION}; moving it behind
 * the Verifier API later means deleting the constant and adding a Registry entry, nothing else.
 *
 * <p>A Verifier whose Self-Description could not be obtained — <em>unreachable</em> or
 * <em>invalid response</em> — is logged and left out of the Catalog for now. Locked-off
 * entries, the startup retry and the Catalog {@code message} are a later milestone.
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

    public VerifierCatalogService(VerifierRegistry registry, VerifierClient client) {
        this.catalog = build(registry, client);
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

    private static VerifierCatalog build(VerifierRegistry registry, VerifierClient client) {
        List<Verifier> verifiers = new ArrayList<>();
        verifiers.add(merge(FUNCTIONAL_VERIFIER_ID, FUNCTIONAL_SELF_DESCRIPTION));
        for (String id : registry.ids()) {
            try {
                verifiers.add(merge(id, client.describe(id)));
                LOGGER.info(String.format("Verifier '%s' described itself and joins the Verifier Catalog", id));
            } catch (VerifierClientException e) {
                LOGGER.warning(String.format(
                    "Verifier '%s' is left out of the Verifier Catalog: %s", id, e.getMessage()));
            }
        }
        LOGGER.info(String.format("Verifier Catalog built with %d entries", verifiers.size()));
        return new VerifierCatalog(verifiers, null);
    }
}
