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
 * statement — both {@code null} until the Verifier has actually reported one; {@code status} is
 * opaque Verifier Status text (see CONTEXT.md), never interpreted here.
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
