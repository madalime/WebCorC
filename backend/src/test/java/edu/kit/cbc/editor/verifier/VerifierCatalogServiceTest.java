package edu.kit.cbc.editor.verifier;

import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * Seam 2 of the Verifier Catalog spec, as far as this milestone goes: the Catalog service with
 * an empty Verifier Registry yields exactly the Functional Verifier, produced by the shared
 * merge step from its constant Self-Description.
 */
class VerifierCatalogServiceTest {

    private static VerifierCatalogService withEmptyRegistry() {
        return new VerifierCatalogService(new VerifierRegistry(List.of()));
    }

    @Test
    void emptyRegistryYieldsOnlyTheFunctionalVerifier() {
        VerifierCatalog catalog = withEmptyRegistry().catalog();

        Assertions.assertNull(catalog.message());
        Assertions.assertEquals(1, catalog.verifiers().size());
        Verifier func = catalog.verifiers().get(0);
        Assertions.assertEquals("func", func.id());
        Assertions.assertEquals("Functional correctness", func.label());
        Assertions.assertTrue(func.enabled());
        Assertions.assertEquals(Boolean.FALSE, func.toggleable());
        Assertions.assertTrue(func.settings().isEmpty());
        Assertions.assertTrue(func.variables().isEmpty());
        Assertions.assertNull(func.statusPlaceholder());
        Assertions.assertNull(func.allowFunctionalVariables());
    }

    @Test
    void functionalVerifierComesFromTheSharedMergeStep() {
        Verifier merged = VerifierCatalogService.merge("any-id", VerifierCatalogService.FUNCTIONAL_SELF_DESCRIPTION);

        Assertions.assertEquals("any-id", merged.id(), "The id is Registry-assigned, not part of the Self-Description");
        Assertions.assertEquals("Functional correctness", merged.label());
        Assertions.assertTrue(merged.enabled());
        Assertions.assertEquals(Boolean.FALSE, merged.toggleable());
    }

    @Test
    void catalogEntriesAreImmutable() {
        VerifierCatalog catalog = withEmptyRegistry().catalog();

        Assertions.assertThrows(UnsupportedOperationException.class, () -> catalog.verifiers().clear());
    }
}
