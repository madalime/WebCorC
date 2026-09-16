package edu.kit.cbc.editor.verifier;

import io.micronaut.json.tree.JsonNode;
import java.util.List;

/**
 * What a Verifier declares about itself through the Verifier API ({@code GET /description}):
 * the {@link Verifier} Catalog entry <em>minus</em> {@code id} — the id is assigned by the
 * Verifier Registry, so the same Verifier image can be registered under any id.
 *
 * <p>{@code enabled} and {@code toggleable} are the Verifier's <em>defaults</em>; the Registry
 * may apply deployment policy over them before the entry reaches the Catalog. The Verifier is
 * the sole authority on which {@code settings} exist and what they mean.
 *
 * <p>The Functional Verifier is not fetched but described by the constant
 * {@link VerifierCatalogService#FUNCTIONAL_SELF_DESCRIPTION}, so that it passes through the
 * same merge step as every remote Verifier.
 */
public record SelfDescription(
    String label,
    boolean enabled,
    Boolean toggleable,
    String statusPlaceholder,
    List<JsonNode> settings,
    List<JsonNode> variables,
    Boolean allowFunctionalVariables
) {}
