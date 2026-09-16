package edu.kit.cbc.editor.verifier;

/**
 * The only component that speaks to Verifiers over the Verifier API. Callers address a Verifier
 * by its Registry id only; the client resolves the URL through the {@link VerifierRegistry},
 * appends the operation path, and hands back typed results. No other backend code holds or
 * builds a Verifier URL.
 *
 * <p>An interface so that tests can drive the Catalog service through a fake; the production
 * implementation is {@link HttpVerifierClient}.
 */
public interface VerifierClient {

    /**
     * Fetches the Verifier's Self-Description ({@code GET <url>/description}).
     *
     * @param id the Verifier's Registry id
     * @return what the Verifier declares about itself
     * @throws VerifierUnreachableException if the Verifier could not be talked to (connect
     *     failure, timeout, 5xx)
     * @throws InvalidSelfDescriptionException if the Verifier answered with something that does
     *     not parse to the Self-Description schema
     * @throws IllegalArgumentException if no Verifier is registered under {@code id}
     */
    SelfDescription describe(String id) throws VerifierUnreachableException, InvalidSelfDescriptionException;
}
