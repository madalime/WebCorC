package edu.kit.cbc.editor.verifier.job;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * One statement of the program a Verifier receives, mirroring
 * {@code openapi/schema/verifiers/job/statement.yml}: the five kinds discriminated by
 * {@code statementType}, flattened into one record the way {@link
 * edu.kit.cbc.editor.verifier.VerifierSetting} flattens the setting kinds — fields a kind does
 * not declare are {@code null} and omitted from the JSON. Build one through the per-kind
 * factories, which take exactly the kind's own fields.
 *
 * <p>{@code preCondition}/{@code postCondition} (and a composition's
 * {@code intermediateCondition}) carry the receiving Verifier's own Verifier Condition and are
 * absent where the user wrote none; a repetition's invariant, guard and variant and a
 * selection's guards are structural — the same for every Verifier.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JobStatement(
    long id,
    String name,
    String statementType,
    JobCondition preCondition,
    JobCondition postCondition,
    JobCondition intermediateCondition,
    JobStatement leftStatement,
    JobStatement rightStatement,
    JobCondition invariantCondition,
    JobCondition guardCondition,
    String variant,
    JobStatement loopStatement,
    List<JobCondition> guards,
    List<JobStatement> statements,
    JobStatement statement
) {

    public static final String SIMPLE = "simple";
    public static final String COMPOSITION = "composition";
    public static final String REPETITION = "repetition";
    public static final String SELECTION = "selection";
    public static final String STRONG_WEAK = "strongWeak";

    public static JobStatement simple(long id, String name, JobCondition preCondition, JobCondition postCondition) {
        return new JobStatement(id, name, SIMPLE, preCondition, postCondition,
            null, null, null, null, null, null, null, null, null, null);
    }

    public static JobStatement composition(
        long id, String name, JobCondition preCondition, JobCondition postCondition,
        JobCondition intermediateCondition, JobStatement leftStatement, JobStatement rightStatement
    ) {
        return new JobStatement(id, name, COMPOSITION, preCondition, postCondition,
            intermediateCondition, leftStatement, rightStatement, null, null, null, null, null, null, null);
    }

    public static JobStatement repetition(
        long id, String name, JobCondition preCondition, JobCondition postCondition,
        JobCondition invariantCondition, JobCondition guardCondition, String variant, JobStatement loopStatement
    ) {
        return new JobStatement(id, name, REPETITION, preCondition, postCondition,
            null, null, null, invariantCondition, guardCondition, variant, loopStatement, null, null, null);
    }

    /** {@code guards} and {@code statements} pair up by index. */
    public static JobStatement selection(
        long id, String name, JobCondition preCondition, JobCondition postCondition,
        List<JobCondition> guards, List<JobStatement> statements
    ) {
        return new JobStatement(id, name, SELECTION, preCondition, postCondition,
            null, null, null, null, null, null, null, List.copyOf(guards), List.copyOf(statements), null);
    }

    public static JobStatement strongWeak(
        long id, String name, JobCondition preCondition, JobCondition postCondition, JobStatement statement
    ) {
        return new JobStatement(id, name, STRONG_WEAK, preCondition, postCondition,
            null, null, null, null, null, null, null, null, null, statement);
    }
}
