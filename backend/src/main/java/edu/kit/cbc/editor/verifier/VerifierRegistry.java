package edu.kit.cbc.editor.verifier;

import io.micronaut.core.order.OrderUtil;
import jakarta.inject.Singleton;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * The Verifier Registry: the deployment's configuration naming each Verifier by id and URL,
 * in the operator's order. Bound from the {@code verifiers} list (see
 * {@link VerifierRegistryEntry}); the application default is an empty list, so a deployment
 * with no Registry file mounted has no registered Verifiers and the Catalog holds only the
 * Functional Verifier.
 *
 * <p>The Functional Verifier is built in, not registered: its id
 * ({@link VerifierCatalogService#FUNCTIONAL_VERIFIER_ID}) is reserved.
 *
 * <p>Malformed entries — missing id or URL, duplicate ids, the reserved id — fail at startup
 * rather than being dropped silently, so an operator's typo surfaces immediately.
 */
@Singleton
public class VerifierRegistry {

    private final List<VerifierRegistryEntry> entries;

    public VerifierRegistry(List<VerifierRegistryEntry> entries) {
        this.entries = List.copyOf(entries.stream().sorted(OrderUtil.COMPARATOR).toList());
        validate(this.entries);
    }

    /** Every registered Verifier in Registry (configuration) order. Immutable. */
    public List<VerifierRegistryEntry> entries() {
        return entries;
    }

    private static void validate(List<VerifierRegistryEntry> entries) {
        Set<String> ids = new HashSet<>();
        for (VerifierRegistryEntry entry : entries) {
            String id = entry.getId();
            if (id == null || id.isBlank()) {
                throw new IllegalStateException(
                    "Verifier Registry entry #" + entry.getOrder() + " has no id");
            }
            if (entry.getUrl() == null || entry.getUrl().isBlank()) {
                throw new IllegalStateException(
                    "Verifier Registry entry '" + id + "' has no url");
            }
            if (VerifierCatalogService.FUNCTIONAL_VERIFIER_ID.equals(id)) {
                throw new IllegalStateException(
                    "Verifier Registry must not register '" + id + "': the Functional Verifier is built in");
            }
            if (!ids.add(id)) {
                throw new IllegalStateException(
                    "Verifier Registry lists id '" + id + "' more than once");
            }
        }
    }
}
