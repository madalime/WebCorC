package edu.kit.cbc.editor.verifier;

import io.micronaut.http.HttpRequest;
import io.micronaut.http.HttpResponse;
import io.micronaut.http.HttpStatus;
import io.micronaut.http.MediaType;
import io.micronaut.http.client.HttpClient;
import io.micronaut.http.client.exceptions.HttpClientException;
import io.micronaut.http.client.exceptions.HttpClientResponseException;
import io.micronaut.json.JsonMapper;
import jakarta.inject.Singleton;
import java.io.IOException;
import java.net.URI;

/**
 * The {@link VerifierClient} over HTTP: the single place in the backend where a Verifier id is
 * turned into a URL. The base URL comes from the Verifier's {@link VerifierRegistryEntry}; the
 * operation paths of the Verifier API ({@code openapi/verifier-api.yml}) are appended to it.
 *
 * <p>Failures are classified as the contract promises: a connection failure, a timeout or a
 * 5xx status is <em>unreachable</em>; any other non-2xx status or a body that does not parse
 * to {@link SelfDescription} is an <em>invalid response</em>. The body is fetched as text and
 * parsed separately so that the two classifications cannot bleed into each other.
 *
 * <p>Uses the application's default HTTP client (and therefore its {@code micronaut.http.client}
 * timeouts) with absolute request URIs; the client is not bound to any base URL.
 */
@Singleton
public class HttpVerifierClient implements VerifierClient {

    /** Path of the Self-Description operation, relative to the registered base URL. */
    static final String DESCRIPTION_PATH = "/description";

    private final VerifierRegistry registry;
    private final HttpClient httpClient;
    private final JsonMapper jsonMapper;

    public HttpVerifierClient(VerifierRegistry registry, HttpClient httpClient, JsonMapper jsonMapper) {
        this.registry = registry;
        this.httpClient = httpClient;
        this.jsonMapper = jsonMapper;
    }

    @Override
    public SelfDescription describe(String id) throws VerifierUnreachableException, InvalidSelfDescriptionException {
        URI uri = operationUri(id, DESCRIPTION_PATH);
        String body = fetch(id, uri);
        try {
            SelfDescription description = jsonMapper.readValue(body, SelfDescription.class);
            if (description == null) {
                throw new InvalidSelfDescriptionException(
                    "Verifier '" + id + "' answered GET " + DESCRIPTION_PATH + " with an empty Self-Description", null);
            }
            return description;
        } catch (IOException e) {
            throw new InvalidSelfDescriptionException(
                "Verifier '" + id + "' answered GET " + DESCRIPTION_PATH
                    + " with a body that is not a Self-Description: " + e.getMessage(), e);
        }
    }

    /**
     * Resolves the Verifier's base URL through the Registry and appends an operation path.
     *
     * @param id the Verifier's Registry id
     * @param operationPath a Verifier API path starting with {@code /}
     * @return the absolute URI of the operation
     * @throws IllegalArgumentException if no Verifier is registered under {@code id}
     */
    private URI operationUri(String id, String operationPath) {
        VerifierRegistryEntry entry = registry.entry(id)
            .orElseThrow(() -> new IllegalArgumentException("Verifier '" + id + "' is not registered"));
        String base = entry.getUrl();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return URI.create(base + operationPath);
    }

    private String fetch(String id, URI uri) throws VerifierUnreachableException, InvalidSelfDescriptionException {
        try {
            HttpResponse<String> response = httpClient.toBlocking()
                .exchange(HttpRequest.GET(uri).accept(MediaType.APPLICATION_JSON_TYPE), String.class);
            return response.getBody().orElse("");
        } catch (HttpClientResponseException e) {
            HttpStatus status = e.getStatus();
            String answered = "Verifier '" + id + "' answered " + status.getCode() + " to GET " + uri.getPath();
            if (status.getCode() >= HttpStatus.INTERNAL_SERVER_ERROR.getCode()) {
                throw new VerifierUnreachableException(answered, e);
            }
            throw new InvalidSelfDescriptionException(answered + " instead of a Self-Description", e);
        } catch (HttpClientException e) {
            throw new VerifierUnreachableException(
                "Verifier '" + id + "' could not be reached for GET " + uri.getPath() + ": " + e.getMessage(), e);
        }
    }
}
