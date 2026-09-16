package edu.kit.cbc.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.kit.cbc.editor.verifier.VerifierRegistry;
import edu.kit.cbc.editor.verifier.VerifierRegistryEntry;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * The backend boots with a Verifier Registry that lists entries, binds them in configuration
 * order, and — nothing reading them yet — still serves a Catalog of only the Functional
 * Verifier.
 */
@MicronautTest
@Property(name = "verifiers[0].id", value = "eebc")
@Property(name = "verifiers[0].url", value = "http://eebc:8080")
@Property(name = "verifiers[1].id", value = "sec")
@Property(name = "verifiers[1].url", value = "http://sec:8080")
class VerifierRegistryIT {

    @Inject
    VerifierRegistry registry;

    @Inject
    @Client("/")
    HttpClient client;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void entriesAreBoundInConfiguredOrder() {
        List<VerifierRegistryEntry> entries = registry.entries();

        Assertions.assertEquals(List.of("eebc", "sec"),
            entries.stream().map(VerifierRegistryEntry::getId).toList());
        Assertions.assertEquals("http://eebc:8080", entries.get(0).getUrl());
        Assertions.assertEquals("http://sec:8080", entries.get(1).getUrl());
    }

    @Test
    void registeredEntriesDoNotYetReachTheCatalog() throws Exception {
        JsonNode catalog = mapper.readTree(client.toBlocking().retrieve("/editor/verifiers"));

        Assertions.assertEquals(1, catalog.get("verifiers").size());
        Assertions.assertEquals("func", catalog.get("verifiers").get(0).get("id").asText());
    }
}
