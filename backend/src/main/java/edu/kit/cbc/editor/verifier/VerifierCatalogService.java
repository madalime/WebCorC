package edu.kit.cbc.editor.verifier;

import io.micronaut.context.annotation.Context;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Logger;

/**
 * Builds the Verifier Catalog once at application startup and serves it from an immutable
 * cache for the backend's lifetime — no refresh, no liveness checks per request.
 *
 * <p>The Catalog is assembled by iterating the {@link VerifierRegistry} in order and merging
 * each Verifier's {@link SelfDescription} into a Catalog entry via
 * {@link #merge(String, SelfDescription)}. The Functional Verifier is prepended through the
 * very same merge step from the constant {@link #FUNCTIONAL_SELF_DESCRIPTION}; moving it behind
 * the Verifier API later means deleting the constant and adding a Registry entry, nothing else.
 *
 * <p>Registered Verifiers are not contacted yet: fetching their Self-Descriptions over the
 * Verifier API is a later milestone, so a non-empty Registry currently contributes no entries
 * and no {@code message} is composed.
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

    public VerifierCatalogService(VerifierRegistry registry) {
        this.catalog = build(registry);
    }

    /** The cached Verifier Catalog. The same instance on every call. */
    public VerifierCatalog catalog() {
        return catalog;
    }

    /**
     * The merge step every Catalog entry passes through: the Registry-assigned id joined with
     * the Verifier's Self-Description. Registry policy is not applied yet.
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
            List.copyOf(description.settings()),
            List.copyOf(description.variables()),
            description.allowFunctionalVariables()
        );
    }

    private static VerifierCatalog build(VerifierRegistry registry) {
        List<Verifier> verifiers = new ArrayList<>();
        verifiers.add(merge(FUNCTIONAL_VERIFIER_ID, FUNCTIONAL_SELF_DESCRIPTION));
        for (VerifierRegistryEntry entry : registry.entries()) {
            LOGGER.info(String.format(
                "Verifier '%s' is registered at %s but not fetched yet: the Verifier API is not called in this milestone",
                entry.getId(), entry.getUrl()));
        }
        LOGGER.info(String.format("Verifier Catalog built with %d entries", verifiers.size()));
        return new VerifierCatalog(verifiers, null);
    }
}
