package edu.kit.cbc.editor.verifier.job;

import com.fasterxml.jackson.annotation.JsonInclude;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;

/**
 * The root of the program a Verifier receives, mirroring
 * {@code openapi/schema/verifiers/job/program.yml}: a narrowed view of the backend's own
 * formula, carrying only what static analysis needs. {@code preCondition}/{@code postCondition}
 * are the receiving Verifier's own Verifier Condition for the root and are absent
 * ({@code null}, omitted) where the user wrote none; {@code globalConditions} are structural.
 */
@Serdeable
@JsonInclude(JsonInclude.Include.NON_NULL)
public record JobProgram(
    String name,
    String className,
    String methodName,
    List<String> javaVariables,
    List<JobCondition> globalConditions,
    JobCondition preCondition,
    JobCondition postCondition,
    JobStatement statement
) {}
