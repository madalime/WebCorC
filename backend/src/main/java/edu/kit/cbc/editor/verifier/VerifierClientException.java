package edu.kit.cbc.editor.verifier;

/**
 * A failure of the {@link VerifierClient} to obtain a Verifier's Self-Description. Exactly two
 * kinds exist, and callers are expected to tell them apart: {@link VerifierUnreachableException}
 * (the Verifier could not be talked to — retryable) and {@link InvalidSelfDescriptionException}
 * (the Verifier answered, but not with a Self-Description — not retryable).
 */
public abstract sealed class VerifierClientException extends Exception
    permits VerifierUnreachableException, InvalidSelfDescriptionException {

    protected VerifierClientException(String message, Throwable cause) {
        super(message, cause);
    }
}
