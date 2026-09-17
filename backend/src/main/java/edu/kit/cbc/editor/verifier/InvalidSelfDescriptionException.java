package edu.kit.cbc.editor.verifier;

/**
 * <em>Invalid response</em>: the Verifier answered, but not with something that parses to the
 * Self-Description schema — a non-JSON body, JSON of another shape, or a non-5xx error status
 * such as 404 for a URL that does not serve the Verifier API. Not retried: the Verifier (or its
 * Registry entry) is misconfigured and needs an operator.
 */
public final class InvalidSelfDescriptionException extends VerifierClientException {

    public InvalidSelfDescriptionException(String message, Throwable cause) {
        super(message, cause);
    }
}
