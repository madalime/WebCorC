package edu.kit.cbc.editor.verifier.job;

import io.micronaut.json.tree.JsonNode;

/**
 * One message on a job's status stream, mirroring
 * {@code openapi/schema/verifiers/job/statusMessage.yml}: the typed envelope a Verifier sends
 * over the WebSocket — never a bare string. Parsed from the wire by {@link #parse(JsonNode)}.
 */
public sealed interface StatusMessage permits StatusMessage.Log, StatusMessage.Done {

    /** A free-text log line, sent at any point during the run. */
    record Log(String message) implements StatusMessage {}

    /** Sent exactly once, when the run has finished: one aggregate verdict, no per-statement detail. */
    record Done(boolean proven) implements StatusMessage {}

    /**
     * Turns a parsed WebSocket message into the envelope it claims to be.
     *
     * @param node the message as JSON
     * @return the typed message
     * @throws IllegalArgumentException with the reason if {@code node} is not a status message —
     *     not an object, an unknown or missing {@code type}, or a missing/ill-typed payload field
     */
    static StatusMessage parse(JsonNode node) {
        if (node == null || !node.isObject()) {
            throw new IllegalArgumentException("not a JSON object");
        }
        JsonNode type = node.get("type");
        if (type == null || !type.isString()) {
            throw new IllegalArgumentException("no string 'type'");
        }
        switch (type.getStringValue()) {
            case "log" -> {
                JsonNode message = node.get("message");
                if (message == null || !message.isString()) {
                    throw new IllegalArgumentException("log message without a string 'message'");
                }
                return new Log(message.getStringValue());
            }
            case "done" -> {
                JsonNode proven = node.get("proven");
                if (proven == null || !proven.isBoolean()) {
                    throw new IllegalArgumentException("done message without a boolean 'proven'");
                }
                return new Done(proven.getBooleanValue());
            }
            default -> throw new IllegalArgumentException("unknown type '" + type.getStringValue() + "'");
        }
    }
}
