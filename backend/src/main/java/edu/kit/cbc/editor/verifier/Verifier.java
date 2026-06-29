package edu.kit.cbc.editor.verifier;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * A project-wide verifier loaded from {@code .internal/verifiers.json}.
 *
 * <p>{@code settings} is kept as raw {@link JsonNode} entries: the actual shape of each
 * setting is a discriminated union owned by the frontend, and the proof flow does not
 * inspect them yet. Round-tripping the JSON losslessly is enough until the KeY wiring
 * decides what it needs.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Verifier(
    String id,
    String label,
    boolean enabled,
    List<JsonNode> settings
) {}
