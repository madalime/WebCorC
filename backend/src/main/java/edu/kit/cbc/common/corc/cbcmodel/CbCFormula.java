package edu.kit.cbc.common.corc.cbcmodel;

import com.fasterxml.jackson.annotation.JsonProperty;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import io.micronaut.serde.annotation.Serdeable;
import java.util.List;
import java.util.Map;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@AllArgsConstructor
@NoArgsConstructor
@Getter
@Setter
@Serdeable
public class CbCFormula {

    private String name;
    private AbstractStatement statement;
    private List<JavaVariable> javaVariables;
    private List<Condition> globalConditions;
    private List<Renaming> renamings;

    /**
     * The Root's per-Verifier conditions and results (mirrors
     * {@code openapi/schema/cbc/formula.yml}'s {@code verifiers}): the same shape and the same
     * rules as a statement's map (see {@link AbstractStatement#getVerifiers()}), carrying
     * {@code func} and every catalog Verifier once a run has happened. The conditions are the
     * ones flattened into the formula's own pre-/postcondition on export; a non-functional
     * Verifier's {@code proven}/{@code status} here are its whole-run verdict, not a statement's.
     */
    private Map<String, VerifierEntry> verifiers;

    /*
     * WARNING: Jackson will interpret this value as "proven" because the
     * preprocessor automatically removes the "is"
     * from the getters name -> "isProven" will be proven. The input JSON must
     * contain proven= instead of isProven.
     * Therefore this annotation is important, as it disables this feature. (I spent
     * hours finding this bug ~ Markus)
     */

    @JsonProperty(value = "isProven", required = true)
    private boolean isProven;
}
