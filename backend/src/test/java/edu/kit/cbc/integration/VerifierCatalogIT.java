package edu.kit.cbc.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * Seam 1 of the Verifier Catalog spec: {@code GET /editor/verifiers} over HTTP with an empty
 * Verifier Registry. The Catalog then holds exactly the Functional Verifier and carries no
 * {@code message}.
 */
@MicronautTest
class VerifierCatalogIT {

    @Inject
    @Client("/")
    HttpClient client;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void emptyRegistry_catalogHoldsOnlyTheFunctionalVerifier() throws Exception {
        HttpResponse<String> response = client.toBlocking()
            .exchange(HttpRequest.GET("/editor/verifiers"), String.class);

        Assertions.assertEquals(HttpStatus.OK, response.getStatus());
        Assertions.assertTrue(
            response.getContentType().map(t -> t.matches(MediaType.APPLICATION_JSON_TYPE)).orElse(false),
            "Catalog must be served as JSON");

        JsonNode catalog = mapper.readTree(response.body());
        Assertions.assertTrue(catalog.isObject(), "Catalog is an envelope object");
        Assertions.assertFalse(catalog.has("message"), "No message when every Verifier loaded");

        JsonNode verifiers = catalog.get("verifiers");
        Assertions.assertNotNull(verifiers, "Envelope carries the verifiers array");
        Assertions.assertTrue(verifiers.isArray());
        Assertions.assertEquals(1, verifiers.size(), "Only the Functional Verifier");

        JsonNode func = verifiers.get(0);
        Assertions.assertEquals("func", func.get("id").asText());
        Assertions.assertEquals("Functional correctness", func.get("label").asText());
        Assertions.assertTrue(func.get("enabled").asBoolean());
        Assertions.assertFalse(func.get("toggleable").asBoolean());
        Assertions.assertTrue(func.get("settings").isArray() && func.get("settings").isEmpty(),
            "Functional Verifier declares no settings (present, empty)");
        Assertions.assertTrue(func.get("variables").isArray() && func.get("variables").isEmpty(),
            "Functional Verifier declares no variables (present, empty)");
        Assertions.assertFalse(func.has("statusPlaceholder"), "Functional Verifier has no status placeholder");
        Assertions.assertFalse(func.has("allowFunctionalVariables"));
    }
}
