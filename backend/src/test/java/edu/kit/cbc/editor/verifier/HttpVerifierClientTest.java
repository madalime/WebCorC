package edu.kit.cbc.editor.verifier;

import com.sun.net.httpserver.HttpServer;
import io.micronaut.http.client.HttpClient;
import io.micronaut.json.JsonMapper;
import java.io.IOException;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * The HTTP implementation of the Verifier Client against a stand-in Verifier served by the
 * JDK's own HTTP server: callers pass an id, the client resolves the URL through the Verifier
 * Registry, calls {@code GET <url>/description} and either returns the typed Self-Description
 * or throws <em>unreachable</em> (connect error, 5xx) or <em>invalid response</em> (anything
 * that does not parse to the Self-Description schema).
 */
class HttpVerifierClientTest {

    private static final String MOCK_DESCRIPTION = """
        {
          "label": "Mock Verifier",
          "enabled": true,
          "toggleable": true,
          "statusPlaceholder": "Waiting for mock verification",
          "settings": [
            {"id": "reportTitle", "type": "text", "valueType": "string", "label": "Report title",
             "required": false, "default": "Mock verification"},
            {"id": "threshold", "type": "text", "valueType": "number", "label": "Threshold",
             "step": 0.5, "range": {"min": 0, "max": 100}, "required": true, "default": "50"},
            {"id": "strategy", "type": "select", "label": "Strategy",
             "options": [{"id": "strict", "label": "Strict"}, {"id": "lenient", "label": "Lenient"}],
             "required": true, "default": "strict"},
            {"id": "verbose", "type": "boolean", "label": "Verbose output", "default": true}
          ],
          "variables": [
            {"id": "energyBudget", "type": "double", "name": "Energy budget"}
          ],
          "allowFunctionalVariables": true
        }
        """;

    private record CannedResponse(int status, String contentType, String body) {}

    private static HttpServer server;
    private static HttpClient httpClient;
    private static final Map<String, CannedResponse> RESPONSES = new ConcurrentHashMap<>();
    private static final List<String> REQUESTED_PATHS = new CopyOnWriteArrayList<>();

    @BeforeAll
    static void startStandInVerifier() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            REQUESTED_PATHS.add(path);
            CannedResponse response = RESPONSES.getOrDefault(path,
                new CannedResponse(404, "text/plain", "no such operation"));
            byte[] bytes = response.body().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", response.contentType());
            exchange.sendResponseHeaders(response.status(), bytes.length);
            try (OutputStream out = exchange.getResponseBody()) {
                out.write(bytes);
            }
        });
        server.start();
        httpClient = HttpClient.create(null);
    }

    @AfterAll
    static void stopStandInVerifier() {
        httpClient.close();
        server.stop(0);
    }

    @BeforeEach
    void reset() {
        RESPONSES.clear();
        REQUESTED_PATHS.clear();
    }

    private static String standInUrl(String basePath) {
        return "http://127.0.0.1:" + server.getAddress().getPort() + basePath;
    }

    private static void serveJson(String path, String body) {
        RESPONSES.put(path, new CannedResponse(200, "application/json", body));
    }

    private static HttpVerifierClient clientFor(String id, String url) {
        VerifierRegistryEntry entry = new VerifierRegistryEntry(0);
        entry.setId(id);
        entry.setUrl(url);
        return new HttpVerifierClient(new VerifierRegistry(List.of(entry)), httpClient, JsonMapper.createDefault());
    }

    @Test
    void returnsTheTypedSelfDescriptionOfAReachableVerifier() throws Exception {
        serveJson("/mock/description", MOCK_DESCRIPTION);

        SelfDescription description = clientFor("mock", standInUrl("/mock")).describe("mock");

        Assertions.assertEquals(List.of("/mock/description"), REQUESTED_PATHS,
            "The id is resolved through the Registry and the description operation appended");
        Assertions.assertEquals("Mock Verifier", description.label());
        Assertions.assertTrue(description.enabled());
        Assertions.assertEquals(Boolean.TRUE, description.toggleable());
        Assertions.assertEquals("Waiting for mock verification", description.statusPlaceholder());
        Assertions.assertEquals(Boolean.TRUE, description.allowFunctionalVariables());
        Assertions.assertEquals(1, description.variables().size());

        Assertions.assertEquals(List.of("reportTitle", "threshold", "strategy", "verbose"),
            description.settings().stream().map(VerifierSetting::id).toList(),
            "Settings are addressable by id");
        VerifierSetting threshold = description.settings().get(1);
        Assertions.assertEquals("text", threshold.type());
        Assertions.assertEquals("number", threshold.valueType());
        Assertions.assertEquals("Threshold", threshold.label());
        Assertions.assertEquals(Boolean.TRUE, threshold.required());
        Assertions.assertEquals("50", threshold.defaultValue().getStringValue());
        Assertions.assertEquals(new BigDecimal("0.5"), threshold.step());
        Assertions.assertEquals(new BigDecimal("0"), threshold.range().min());
        Assertions.assertEquals(new BigDecimal("100"), threshold.range().max());
        VerifierSetting strategy = description.settings().get(2);
        Assertions.assertEquals(List.of("strict", "lenient"),
            strategy.options().stream().map(VerifierSetting.Option::id).toList());
        VerifierSetting verbose = description.settings().get(3);
        Assertions.assertEquals("boolean", verbose.type());
        Assertions.assertTrue(verbose.defaultValue().getBooleanValue());
        Assertions.assertNull(verbose.required());
    }

    @Test
    void appendsTheOperationPathWithoutDoublingSlashes() throws Exception {
        serveJson("/mock/description", MOCK_DESCRIPTION);

        clientFor("mock", standInUrl("/mock/")).describe("mock");

        Assertions.assertEquals(List.of("/mock/description"), REQUESTED_PATHS);
    }

    @Test
    void serverErrorIsUnreachable() {
        RESPONSES.put("/description", new CannedResponse(503, "text/plain", "starting up"));

        VerifierUnreachableException e = Assertions.assertThrows(VerifierUnreachableException.class,
            () -> clientFor("mock", standInUrl("")).describe("mock"));

        Assertions.assertTrue(e.getMessage().contains("mock"), e.getMessage());
        Assertions.assertTrue(e.getMessage().contains("503"), e.getMessage());
    }

    @Test
    void connectionRefusedIsUnreachable() throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0, 1, java.net.InetAddress.getLoopbackAddress())) {
            closedPort = socket.getLocalPort();
        }

        VerifierUnreachableException e = Assertions.assertThrows(VerifierUnreachableException.class,
            () -> clientFor("mock", "http://127.0.0.1:" + closedPort).describe("mock"));

        Assertions.assertTrue(e.getMessage().contains("mock"), e.getMessage());
        Assertions.assertTrue(REQUESTED_PATHS.isEmpty(), "Nothing reached the stand-in");
    }

    @Test
    void clientErrorIsAnInvalidResponse() {
        InvalidSelfDescriptionException e = Assertions.assertThrows(InvalidSelfDescriptionException.class,
            () -> clientFor("mock", standInUrl("/nowhere")).describe("mock"));

        Assertions.assertTrue(e.getMessage().contains("mock"), e.getMessage());
        Assertions.assertTrue(e.getMessage().contains("404"), e.getMessage());
    }

    @Test
    void bodyThatDoesNotParseToTheSchemaIsAnInvalidResponse() {
        RESPONSES.put("/html/description", new CannedResponse(200, "text/html", "<html>not a verifier</html>"));
        RESPONSES.put("/array/description", new CannedResponse(200, "application/json", "[]"));
        RESPONSES.put("/empty/description", new CannedResponse(200, "application/json", ""));

        for (String base : List.of("/html", "/array", "/empty")) {
            Assertions.assertThrows(InvalidSelfDescriptionException.class,
                () -> clientFor("mock", standInUrl(base)).describe("mock"), base);
        }
    }

    @Test
    void unregisteredIdIsAProgrammingError() {
        HttpVerifierClient client = clientFor("mock", standInUrl("/mock"));

        Assertions.assertThrows(IllegalArgumentException.class, () -> client.describe("nope"));
        Assertions.assertTrue(REQUESTED_PATHS.isEmpty());
    }
}
