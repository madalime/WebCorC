package edu.kit.cbc.common.corc.cbcmodel;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import io.micronaut.serde.annotation.Serdeable;

/**
 * One Verifier's condition and result for one statement (or, at formula level, for the root
 * statement), keyed by Verifier id in {@link AbstractStatement#getVerifiers()} /
 * {@link CbCFormula#getVerifiers()}. Mirrors {@code openapi/schema/cbc/verifiers.yml}.
 *
 * <p>{@code preCondition}/{@code postCondition} are the Verifier Condition the user authored for
 * this Verifier; {@code intermediateCondition} is only meaningful on a composition statement, and
 * only present when non-empty. {@code proven}/{@code status} are that Verifier's result for this
 * statement, both {@code null} until a run has reached the Verifier phase for the first time.
 *
 * <p>From then on, {@code proven} is reset {@code false} for every catalog Verifier at the start
 * of every such run, set {@code true} only by a Verifier that itself proved this statement in that
 * run; {@code status} is cleared, a fixed disabled-run text, or that Verifier's own opaque
 * Verifier Status text (see CONTEXT.md), never interpreted here.
 *
 * <p>The Functional Verifier's own entry, keyed by
 * {@link edu.kit.cbc.editor.verifier.VerifierCatalogService#FUNCTIONAL_VERIFIER_ID}, is the one
 * exception: written once functional verification completes, {@code proven} only, never
 * {@code status} or conditions -- its actual conditions stay the owning statement's plain
 * pre-/postcondition, never a {@code VerifierEntry} of its own.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public record VerifierEntry(
    Condition preCondition,
    Condition postCondition,
    Condition intermediateCondition,
    Boolean proven,
    String status
) {}
