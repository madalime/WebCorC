package edu.kit.cbc.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.kit.cbc.editor.verifier.VerifierCatalogService;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.runtime.server.EmbeddedServer;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * The backend answers HTTP before the Verifier Catalog is built. A dev stack whose Registry
 * names a Verifier nobody listens at spends retries × retry-delay on it at startup; that must
 * not keep the port closed, or a frontend opened meanwhile sees connection refused instead of
 * a Catalog. Here the one registered Verifier is unreachable and costs about six seconds of
 * retries, so at test start the server is running while the Catalog is still being built, and
 * {@code GET /editor/verifiers} is held until it is — then answers with the entry locked off.
 */
@MicronautTest
@Property(name = "verifiers[0].id", value = "dead")
@Property(name = "verifiers[0].url", value = "http://127.0.0.1:9")
@Property(name = "verifier-catalog.retries", value = "2")
@Property(name = "verifier-catalog.retry-delay", value = "3s")
class VerifierCatalogStartupIT {

    @Inject
    @Client("/")
    HttpClient client;

    @Inject
    EmbeddedServer server;

    @Inject
    VerifierCatalogService catalogService;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void serverIsUpBeforeTheCatalogAndHoldsTheRequestUntilItIsBuilt() throws Exception {
        Assertions.assertTrue(server.isRunning(), "The HTTP server is bound");
        Assertions.assertFalse(catalogService.catalog().toCompletableFuture().isDone(),
            "The Catalog build (retries on the unreachable Verifier) is still running");

        JsonNode catalog = mapper.readTree(client.toBlocking().retrieve("/editor/verifiers"));

        Assertions.assertTrue(catalogService.catalog().toCompletableFuture().isDone(),
            "The request was answered only once the Catalog existed");
        Assertions.assertEquals("1 verifier unavailable: dead (unreachable)", catalog.get("message").asText());
        Assertions.assertEquals("dead (offline)", catalog.get("verifiers").get(1).get("label").asText());
    }
}
