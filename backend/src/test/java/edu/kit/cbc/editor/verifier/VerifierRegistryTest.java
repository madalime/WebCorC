package edu.kit.cbc.editor.verifier;

import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

class VerifierRegistryTest {

    private static VerifierRegistryEntry entry(int index, String id, String url) {
        VerifierRegistryEntry entry = new VerifierRegistryEntry(index);
        entry.setId(id);
        entry.setUrl(url);
        return entry;
    }

    @Test
    void entriesAreOrderedByConfigurationIndexRegardlessOfInjectionOrder() {
        VerifierRegistry registry = new VerifierRegistry(List.of(
            entry(1, "sec", "http://sec"),
            entry(0, "eebc", "http://eebc")));

        Assertions.assertEquals(List.of("eebc", "sec"),
            registry.entries().stream().map(VerifierRegistryEntry::getId).toList());
    }

    @Test
    void rejectsDuplicateIds() {
        IllegalStateException e = Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "eebc", "http://a"), entry(1, "eebc", "http://b"))));

        Assertions.assertTrue(e.getMessage().contains("eebc"), e.getMessage());
    }

    @Test
    void rejectsEntriesWithoutIdOrUrl() {
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, null, "http://a"))));
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "eebc", " "))));
    }

    @Test
    void reservesTheFunctionalVerifierId() {
        Assertions.assertThrows(IllegalStateException.class,
            () -> new VerifierRegistry(List.of(entry(0, "func", "http://a"))));
    }
}
