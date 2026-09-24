package edu.kit.cbc.editor;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;

/**
 * One message on the frontend-facing verification WebSocket, mirroring
 * {@code openapi/schema/verification/message.yml}: the three types flattened into one record
 * the way {@link edu.kit.cbc.editor.verifier.job.JobStatement} flattens the statement kinds —
 * fields a type does not carry are {@code null} and omitted. {@code verifier} is {@code func}
 * for functional verification.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record VerificationMessage(String type, String verifier, String message, Boolean proven) {

    public static final String LOG = "log";
    public static final String DONE = "done";
    public static final String COMPLETE = "complete";

    public static VerificationMessage log(String verifier, String message) {
        return new VerificationMessage(LOG, verifier, message, null);
    }

    public static VerificationMessage done(String verifier, boolean proven) {
        return new VerificationMessage(DONE, verifier, null, proven);
    }

    public static VerificationMessage complete() {
        return new VerificationMessage(COMPLETE, null, null, null);
    }
}
