package edu.kit.cbc.common.corc.cbcmodel;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import io.micronaut.serde.annotation.Serdeable;

/**
 * One Verifier's condition and result for one statement or for the Root, keyed by Verifier id in
 * {@link AbstractStatement#getVerifiers()} / {@link CbCFormula#getVerifiers()}. Mirrors
 * {@code openapi/schema/cbc/verifiers.yml}.
 *
 * <p>{@code preCondition}/{@code postCondition} are the Verifier Condition the user authored for
 * this Verifier; {@code intermediateCondition} is only meaningful on a composition statement, and
 * only present when non-empty. {@code proven}, {@code status} and {@code disabled} are that
 * Verifier's result, all {@code null} until the first run of any kind.
 *
 * <p>From then on every entry describes the last run: {@code proven} is reset {@code false} for
 * every catalog Verifier at the start of every run, in both modes, and set {@code true} only by a
 * Verifier that itself proved this statement in that run. {@code disabled} is {@code true} — and
 * absent otherwise — exactly when this Verifier did not run because it was not enabled for that
 * run, which in a functional-only run is every non-functional Verifier; such an entry has no
 * {@code status}. {@code status} is that Verifier's own opaque Verifier Status text (see
 * CONTEXT.md), never interpreted here, or the reason a Verifier that could not be run at all
 * failed.
 *
 * <p>On the Root the map has the same shape and rules, written by the same operations: there
 * {@code proven} and {@code status} are the Verifier's whole-run verdict, its {@code done}
 * message's, not anything derived from the statements below.
 *
 * <p>The Functional Verifier's own entry, keyed by
 * {@link edu.kit.cbc.editor.verifier.VerifierCatalogService#FUNCTIONAL_VERIFIER_ID}, is the one
 * exception: written once functional verification completes, {@code proven} only, never
 * {@code status}, {@code disabled} or conditions -- its actual conditions stay the owning
 * statement's plain pre-/postcondition, never a {@code VerifierEntry} of its own.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
@JsonIgnoreProperties(ignoreUnknown = true)
public record VerifierEntry(
    Condition preCondition,
    Condition postCondition,
    Condition intermediateCondition,
    Boolean proven,
    String status,
    Boolean disabled
) {}
