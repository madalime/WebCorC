package edu.kit.cbc.editor.verifier;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;

/**
 * An entry of the verifier catalog, mirroring {@code openapi/schema/verifiers/verifier.yml}.
 *
 * <p>The catalog is read-only for the user; their modifications to it live in
 * {@link VerifierOverride}.
 *
 * <p>{@code settings} and {@code variables} are kept as raw {@link JsonNode} entries: their
 * shapes are frontend-owned, so they round-trip losslessly.
 *
 * <p>{@code toggleable} is optional (nullable {@code Boolean}): {@code false} locks the enabled
 * toggle at whatever {@code enabled} is declared as — either a mandatory-on verifier
 * ({@code enabled: true}) or a forced-off one ({@code enabled: false}); omitted / {@code null}
 * is equivalent to {@code true} (freely toggleable). A locked verifier's {@code enabled} is
 * catalog-owned, so an override contradicting it is ignored on load.
 *
 * <p>{@code allowFunctionalVariables} is optional (nullable {@code Boolean}): {@code true}
 * means the functional variables — the statement's own program variables — may be referenced
 * inside this verifier's non-functional conditions, alongside its own {@code variables}. Only
 * meaningful for a verifier that declares {@code variables} at all; omitted / {@code null} is
 * equivalent to {@code false} (not allowed), so a catalog must opt in explicitly.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Verifier(
    String id,
    String label,
    boolean enabled,
    Boolean toggleable,
    List<JsonNode> settings,
    List<JsonNode> variables,
    Boolean allowFunctionalVariables
) {}
