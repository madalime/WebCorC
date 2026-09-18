package edu.kit.cbc.editor.verifier.job;

import io.micronaut.serde.annotation.Serdeable;

/**
 * A condition as sent to a Verifier, mirroring {@code openapi/schema/cbc/condition.yml} — the
 * wire shape, not the backend's own {@code cbcmodel.Condition}, which carries a parsed tree and
 * serializes differently.
 */
@Serdeable
public record JobCondition(String content, long originID, String title) {}
