package edu.kit.cbc.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micronaut.context.annotation.Property;
import io.micronaut.http.HttpRequest;
import io.micronaut.http.MediaType;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.annotation.Client;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.runtime.server.EmbeddedServer;
import io.micronaut.test.extensions.junit5.annotation.MicronautTest;
import jakarta.inject.Inject;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.WebSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.Timeout;

/**
 * Verification jobs end to end: functional verification through KeY, and — with the mock
 * Verifier (via Micronaut Test Resources, the same container {@link VerifierCatalogIT} uses)
 * registered and enabled by its own Self-Description — the fan-out over real HTTP and a real
 * WebSocket, relayed onto the frontend-facing WebSocket and merged into the job's result.
 */
@MicronautTest
@Property(name = "verifiers[0].id", value = "mock")
@Property(name = "verifiers[0].url", value = "http://${mock-verifier.host}:${mock-verifier.port}")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class VerificationIT {

    /** The mock Verifier's fixed status-stream script (mock-verifier/mock-verifier.js). */
    private static final List<String> MOCK_LOG_LINES = List.of(
        "Mock Verifier: analysing program",
        "Mock Verifier: checking every statement against the resolved Settings",
        "Mock Verifier: all statements checked");

    @Inject
    @Client("/")
    HttpClient client;

    @Inject
    EmbeddedServer server;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    @Order(1)
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void simpleAssignment_shouldBeProven() throws Exception {
        JsonNode result = submitAndPoll("fixtures/simple_assignment.json", Duration.ofSeconds(55));
        Assertions.assertTrue(result.get("isProven").asBoolean(), "Simple assignment proof failed");
    }

    @Test
    @Order(2)
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void oldExpression_shouldBeProven() throws Exception {
        JsonNode result = submitAndPoll("fixtures/old_expression.json", Duration.ofSeconds(55));
        Assertions.assertTrue(result.get("isProven").asBoolean(), "\\old() expression proof failed");
    }

    @Test
    @Order(3)
    @Timeout(value = 180, unit = TimeUnit.SECONDS)
    void compositionWithSelection_shouldBeProven() throws Exception {
        JsonNode result = submitAndPoll("fixtures/composition_with_selection.json", Duration.ofSeconds(170));
        Assertions.assertTrue(result.get("isProven").asBoolean(), "Composition with selection proof failed");
    }

    @Test
    @Order(4)
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void functionalOnlyJob_signalsFunctionalDoneThenCompleteAndNothingElse() throws Exception {
        UUID jobId = submit("fixtures/simple_assignment.json", true);

        List<JsonNode> messages = messagesUntilComplete(jobId, Duration.ofSeconds(55));

        Assertions.assertEquals(List.of("func"), verifiers(messages), "Only functional verification spoke: " + messages);
        Assertions.assertTrue(messages.contains(mapper.readTree("{\"type\": \"done\", \"verifier\": \"func\", \"proven\": true}")),
            messages.toString());
        Assertions.assertEquals(1, messages.stream().filter(m -> "complete".equals(m.path("type").asText())).count());
        Assertions.assertEquals("complete", messages.get(messages.size() - 1).path("type").asText(), "Complete comes last");
        Assertions.assertTrue(poll(jobId, Duration.ofSeconds(5)).get("isProven").asBoolean());
    }

    @Test
    @Order(5)
    @Timeout(value = 60, unit = TimeUnit.SECONDS)
    void mockVerifierRunsAfterFunctionalSuccess_andItsResultIsMergedIntoTheJobsFormula() throws Exception {
        UUID jobId = submit("fixtures/simple_assignment.json", false);

        List<JsonNode> messages = messagesUntilComplete(jobId, Duration.ofSeconds(55));

        Assertions.assertEquals(List.of("func", "mock"), verifiers(messages), "Functional first, then the mock: " + messages);
        int functionalDone = messages.indexOf(mapper.readTree("{\"type\": \"done\", \"verifier\": \"func\", \"proven\": true}"));
        Assertions.assertTrue(functionalDone >= 0, "Functional verification reports its own done: " + messages);
        List<JsonNode> mock = messages.stream().filter(m -> "mock".equals(m.path("verifier").asText())).toList();
        Assertions.assertTrue(messages.indexOf(mock.get(0)) > functionalDone, "The mock is called only after functional success");
        List<JsonNode> expected = new ArrayList<>();
        for (String line : MOCK_LOG_LINES) {
            expected.add(mapper.readTree("{\"type\": \"log\", \"verifier\": \"mock\", \"message\": \"" + line + "\"}"));
        }
        expected.add(mapper.readTree("{\"type\": \"done\", \"verifier\": \"mock\", \"proven\": true}"));
        Assertions.assertEquals(expected, mock, "The mock's fixed script, each message tagged with its id");
        Assertions.assertEquals(1, messages.stream().filter(m -> "complete".equals(m.path("type").asText())).count());
        Assertions.assertEquals("complete", messages.get(messages.size() - 1).path("type").asText(), "Complete comes last");

        JsonNode result = poll(jobId, Duration.ofSeconds(5));

        Assertions.assertTrue(result.get("isProven").asBoolean(), "The Functional Verifier's own verdict is untouched");
        JsonNode entry = result.get("statement").get("verifiers").get("mock");
        Assertions.assertNotNull(entry, "The mock's result is merged into the statement's verifiers entry: " + result);
        Assertions.assertTrue(entry.get("proven").asBoolean());
        Assertions.assertEquals("Mock verification passed (strategy=strict, threshold=50)", entry.get("status").asText(),
            "The status text echoes the resolved Settings: the Catalog defaults, with no project Overrides");
    }

    /** The distinct verifier tags in order of first appearance; complete carries none. */
    private static List<String> verifiers(List<JsonNode> messages) {
        return messages.stream().filter(m -> m.has("verifier")).map(m -> m.get("verifier").asText()).distinct().toList();
    }

    private UUID submit(String fixturePath, boolean functionalOnly) throws IOException {
        String jobIdStr = client.toBlocking().retrieve(
            HttpRequest.POST("/editor/verify?functionalOnly=" + functionalOnly, loadFixture(fixturePath))
                .contentType(MediaType.APPLICATION_JSON)
        );
        return UUID.fromString(jobIdStr.replace("\"", ""));
    }

    private JsonNode poll(UUID jobId, Duration timeout) throws Exception {
        long deadline = System.currentTimeMillis() + timeout.toMillis();
        while (System.currentTimeMillis() < deadline) {
            try {
                String resultJson = client.toBlocking().retrieve("/editor/jobs/" + jobId);
                return mapper.readTree(resultJson);
            } catch (HttpClientResponseException e) {
                Thread.sleep(500);
            }
        }
        throw new AssertionError("Timed out waiting for verification job: " + jobId);
    }

    private JsonNode submitAndPoll(String fixturePath, Duration timeout) throws Exception {
        return poll(submit(fixturePath, true), timeout);
    }

    /**
     * Opens the job's frontend-facing WebSocket and collects its messages up to and including
     * the complete message. The socket may well open after the job has sent its first messages;
     * those are replayed, so the list is the whole conversation.
     */
    private List<JsonNode> messagesUntilComplete(UUID jobId, Duration timeout) throws Exception {
        BlockingQueue<String> frames = new LinkedBlockingQueue<>();
        WebSocket.Listener listener = new WebSocket.Listener() {
            private final StringBuilder partial = new StringBuilder();

            @Override
            public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
                partial.append(data);
                if (last) {
                    frames.add(partial.toString());
                    partial.setLength(0);
                }
                socket.request(1);
                return null;
            }
        };
        URI uri = URI.create("ws://" + server.getHost() + ":" + server.getPort() + "/ws/verify/" + jobId);
        WebSocket socket = java.net.http.HttpClient.newHttpClient().newWebSocketBuilder().buildAsync(uri, listener).join();
        try {
            List<JsonNode> messages = new ArrayList<>();
            long deadline = System.currentTimeMillis() + timeout.toMillis();
            while (true) {
                String frame = frames.poll(Math.max(1, deadline - System.currentTimeMillis()), TimeUnit.MILLISECONDS);
                if (frame == null) {
                    throw new AssertionError("Timed out waiting for the complete message; received " + messages);
                }
                JsonNode message = mapper.readTree(frame);
                messages.add(message);
                if ("complete".equals(message.path("type").asText())) {
                    return messages;
                }
            }
        } finally {
            socket.abort();
        }
    }

    private String loadFixture(String path) throws IOException {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream(path)) {
            if (is == null) {
                throw new IOException("Fixture not found: " + path);
            }
            return new String(is.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
