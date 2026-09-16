package edu.kit.cbc.editor.verifier;

import io.micronaut.json.tree.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * Seam 2 of the Verifier Catalog spec: the Catalog service driven through a fake Verifier
 * Client. The Catalog is the Functional Verifier followed by every registered Verifier in
 * Registry order, each entry being the Registry-assigned id joined with the Self-Description
 * the client returned.
 *
 * <p>Locked-off entries, retry and the {@code message} are a later milestone: here a Verifier
 * whose Self-Description could not be obtained is simply left out.
 */
class VerifierCatalogServiceTest {

    /** Canned Self-Descriptions or failures per id; records which ids were asked for. */
    private static final class FakeVerifierClient implements VerifierClient {

        private final Map<String, SelfDescription> descriptions = new HashMap<>();
        private final Map<String, VerifierClientException> failures = new HashMap<>();
        private final List<String> describedIds = new ArrayList<>();

        FakeVerifierClient describing(String id, SelfDescription description) {
            descriptions.put(id, description);
            return this;
        }

        FakeVerifierClient failing(String id, VerifierClientException failure) {
            failures.put(id, failure);
            return this;
        }

        @Override
        public SelfDescription describe(String id) throws VerifierUnreachableException, InvalidSelfDescriptionException {
            describedIds.add(id);
            VerifierClientException failure = failures.get(id);
            switch (failure) {
                case VerifierUnreachableException unreachable -> throw unreachable;
                case InvalidSelfDescriptionException invalid -> throw invalid;
                case null -> { }
            }
            SelfDescription description = descriptions.get(id);
            if (description == null) {
                throw new AssertionError("Unexpected describe(" + id + ")");
            }
            return description;
        }
    }

    private static final SelfDescription MINIMAL = new SelfDescription(
        "Minimal", false, null, null, null, null, null);

    private static VerifierRegistry registryOf(String... ids) {
        List<VerifierRegistryEntry> entries = new ArrayList<>();
        for (int i = 0; i < ids.length; i++) {
            VerifierRegistryEntry entry = new VerifierRegistryEntry(i);
            entry.setId(ids[i]);
            entry.setUrl("http://" + ids[i]);
            entries.add(entry);
        }
        return new VerifierRegistry(entries);
    }

    private static List<String> ids(VerifierCatalog catalog) {
        return catalog.verifiers().stream().map(Verifier::id).toList();
    }

    @Test
    void emptyRegistryYieldsOnlyTheFunctionalVerifier() {
        FakeVerifierClient client = new FakeVerifierClient();

        VerifierCatalog catalog = new VerifierCatalogService(registryOf(), client).catalog();

        Assertions.assertNull(catalog.message());
        Assertions.assertEquals(List.of("func"), ids(catalog));
        Assertions.assertTrue(client.describedIds.isEmpty(), "Nothing to fetch");
        Verifier func = catalog.verifiers().get(0);
        Assertions.assertEquals("Functional correctness", func.label());
        Assertions.assertTrue(func.enabled());
        Assertions.assertEquals(Boolean.FALSE, func.toggleable());
        Assertions.assertTrue(func.settings().isEmpty());
        Assertions.assertTrue(func.variables().isEmpty());
        Assertions.assertNull(func.statusPlaceholder());
        Assertions.assertNull(func.allowFunctionalVariables());
    }

    @Test
    void registeredVerifiersFollowTheFunctionalVerifierInRegistryOrder() {
        FakeVerifierClient client = new FakeVerifierClient()
            .describing("sec", MINIMAL)
            .describing("eebc", MINIMAL)
            .describing("maint", MINIMAL);

        VerifierCatalog catalog = new VerifierCatalogService(registryOf("sec", "eebc", "maint"), client).catalog();

        Assertions.assertEquals(List.of("func", "sec", "eebc", "maint"), ids(catalog));
        Assertions.assertEquals(List.of("sec", "eebc", "maint"), client.describedIds,
            "Every Registry entry is fetched, by id, in Registry order");
        Assertions.assertNull(catalog.message());
    }

    @Test
    void mergeCarriesEveryFieldOfTheSelfDescription() {
        VerifierSetting text = new VerifierSetting("reportTitle", "text", "string", "Report title", "Title of the report",
            false, JsonNode.createStringNode("Mock verification"), null, null, null, null);
        VerifierSetting number = new VerifierSetting("threshold", "text", "number", "Threshold", null,
            true, JsonNode.createStringNode("50"), null, new BigDecimal("0.5"),
            new VerifierSetting.Range(BigDecimal.ZERO, new BigDecimal("100")), null);
        VerifierSetting select = new VerifierSetting("strategy", "select", null, "Strategy", null,
            true, JsonNode.createStringNode("strict"), null, null, null,
            List.of(new VerifierSetting.Option("strict", "Strict"), new VerifierSetting.Option("lenient", "Lenient")));
        VerifierSetting bool = new VerifierSetting("verbose", "boolean", null, "Verbose output", null,
            null, JsonNode.createBooleanNode(true), null, null, null, null);
        JsonNode variable = JsonNode.createObjectNode(Map.of(
            "id", JsonNode.createStringNode("energyBudget"),
            "type", JsonNode.createStringNode("double"),
            "name", JsonNode.createStringNode("Energy budget")));
        SelfDescription description = new SelfDescription(
            "Mock Verifier", true, true, "Waiting for mock verification",
            List.of(text, number, select, bool), List.of(variable), true);
        FakeVerifierClient client = new FakeVerifierClient().describing("mock", description);

        VerifierCatalog catalog = new VerifierCatalogService(registryOf("mock"), client).catalog();

        Verifier mock = catalog.verifiers().get(1);
        Assertions.assertEquals("mock", mock.id(), "The id comes from the Registry, not the Self-Description");
        Assertions.assertEquals("Mock Verifier", mock.label());
        Assertions.assertTrue(mock.enabled());
        Assertions.assertEquals(Boolean.TRUE, mock.toggleable());
        Assertions.assertEquals("Waiting for mock verification", mock.statusPlaceholder());
        Assertions.assertEquals(List.of(text, number, select, bool), mock.settings());
        Assertions.assertEquals(List.of("reportTitle", "threshold", "strategy", "verbose"),
            mock.settings().stream().map(VerifierSetting::id).toList(), "Settings stay addressable by id");
        Assertions.assertEquals(List.of(variable), mock.variables());
        Assertions.assertEquals(Boolean.TRUE, mock.allowFunctionalVariables());
    }

    @Test
    void absentSettingsAndVariablesBecomeEmptyLists() {
        FakeVerifierClient client = new FakeVerifierClient().describing("bare", MINIMAL);

        Verifier bare = new VerifierCatalogService(registryOf("bare"), client).catalog().verifiers().get(1);

        Assertions.assertEquals("Minimal", bare.label());
        Assertions.assertFalse(bare.enabled());
        Assertions.assertNull(bare.toggleable(), "Omitted defaults stay omitted: the frontend supplies them");
        Assertions.assertNull(bare.statusPlaceholder());
        Assertions.assertNull(bare.allowFunctionalVariables());
        Assertions.assertEquals(List.of(), bare.settings(), "The Catalog always carries the arrays");
        Assertions.assertEquals(List.of(), bare.variables());
    }

    @Test
    void unreachableVerifierIsOmittedUntilLockedOffEntriesExist() {
        FakeVerifierClient client = new FakeVerifierClient()
            .failing("eebc", new VerifierUnreachableException("Verifier 'eebc' could not be reached", null))
            .describing("sec", MINIMAL);

        VerifierCatalog catalog = new VerifierCatalogService(registryOf("eebc", "sec"), client).catalog();

        Assertions.assertEquals(List.of("func", "sec"), ids(catalog));
        Assertions.assertNull(catalog.message());
    }

    @Test
    void invalidSelfDescriptionIsOmittedUntilLockedOffEntriesExist() {
        FakeVerifierClient client = new FakeVerifierClient()
            .describing("eebc", MINIMAL)
            .failing("sec", new InvalidSelfDescriptionException("Verifier 'sec' answered 404", null));

        VerifierCatalog catalog = new VerifierCatalogService(registryOf("eebc", "sec"), client).catalog();

        Assertions.assertEquals(List.of("func", "eebc"), ids(catalog));
        Assertions.assertNull(catalog.message());
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
        VerifierCatalog catalog = new VerifierCatalogService(registryOf(), new FakeVerifierClient()).catalog();

        Assertions.assertThrows(UnsupportedOperationException.class, () -> catalog.verifiers().clear());
    }
}
