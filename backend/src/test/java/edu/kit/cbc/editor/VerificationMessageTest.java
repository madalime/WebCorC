package edu.kit.cbc.editor;

import io.micronaut.json.JsonMapper;
import io.micronaut.json.tree.JsonNode;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * The envelope on the frontend-facing WebSocket: a typed object, never a bare string, with only
 * the fields its type carries.
 */
class VerificationMessageTest {

    private static final JsonMapper JSON = JsonMapper.createDefault();

    private static JsonNode written(VerificationMessage message) throws Exception {
        return JSON.readValue(JSON.writeValueAsString(message), JsonNode.class);
    }

    @Test
    void logCarriesItsVerifierAndFreeText() throws Exception {
        Assertions.assertEquals(JSON.readValue("{\"type\": \"log\", \"verifier\": \"func\", \"message\": \"proving\"}", JsonNode.class),
            written(VerificationMessage.log("func", "proving")));
    }

    @Test
    void doneCarriesItsVerifierAndAggregateVerdict() throws Exception {
        Assertions.assertEquals(JSON.readValue("{\"type\": \"done\", \"verifier\": \"eebc\", \"proven\": false}", JsonNode.class),
            written(VerificationMessage.done("eebc", false)));
    }

    @Test
    void completeCarriesNothingElse() throws Exception {
        Assertions.assertEquals(JSON.readValue("{\"type\": \"complete\"}", JsonNode.class),
            written(VerificationMessage.complete()));
    }
}
