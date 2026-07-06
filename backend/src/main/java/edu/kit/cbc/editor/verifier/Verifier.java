package edu.kit.cbc.editor.verifier;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * A project-wide verifier loaded from {@code .internal/verifiers.json}.
 *
 * <p>{@code settings} and {@code variables} are kept as raw {@link JsonNode} entries: their
 * actual shapes are frontend-owned, and the proof flow does not inspect them yet.
 * Round-tripping the JSON losslessly is enough until the KeY wiring decides what it needs.
 *
 * <p>{@code disableable} is optional (nullable {@code Boolean}): {@code false} means the
 * verifier is mandatory and cannot be toggled off; omitted / {@code null} is equivalent to
 * {@code true} (freely toggleable) for backwards compatibility with existing project files.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Verifier(
    String id,
    String label,
    boolean enabled,
    Boolean disableable,
    List<JsonNode> settings,
    List<JsonNode> variables
) {}
