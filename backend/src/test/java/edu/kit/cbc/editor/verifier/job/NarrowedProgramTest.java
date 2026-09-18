package edu.kit.cbc.editor.verifier.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import edu.kit.cbc.common.corc.cbcmodel.CbCFormula;
import edu.kit.cbc.common.corc.cbcmodel.Condition;
import edu.kit.cbc.common.corc.cbcmodel.VerifierEntry;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.CompositionStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.SelectionStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.SmallRepetitionStatement;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

/**
 * The narrowed program a Verifier receives, built from the job's formula: every statement gets
 * a stable id, the receiving Verifier's own Verifier Conditions are swapped into the primary
 * condition fields (absent where none is written), structural fields are carried unchanged, and
 * a Verifier's flat result merges back into the same statements by those ids.
 */
class NarrowedProgramTest {

    /** Every statement kind once: composition(simple, repetition(selection(simple, skip))). */
    private static final String FORMULA_JSON = """
        {
          "name": "Demo",
          "javaVariables": [{"name": "int x", "kind": "LOCAL"}, {"name": "int total", "kind": "GLOBAL"}],
          "globalConditions": [{"condition": "total >= 0"}],
          "renamings": [],
          "isProven": false,
          "verifiers": {
            "energy": {"preCondition": {"condition": "energy == 0"}, "postCondition": {"condition": "energy <= budget"}}
          },
          "statement": {
            "name": "Comp", "type": "COMPOSITION", "isProven": false,
            "preCondition": {"condition": "x == 0"}, "postCondition": {"condition": "x == 10"},
            "intermediateCondition": {"condition": "x == 1"},
            "verifiers": {
              "energy": {
                "preCondition": {"condition": "energy == 0"}, "postCondition": {"condition": "energy <= budget"},
                "intermediateCondition": {"condition": "energy <= 1"}
              },
              "sec": {"preCondition": {"condition": "safe(x)"}, "postCondition": {"condition": "safe(x)"}}
            },
            "firstStatement": {
              "name": "Assign", "type": "STATEMENT", "isProven": false, "programStatement": "x = 1;",
              "preCondition": {"condition": "x == 0"}, "postCondition": {"condition": "x == 1"},
              "verifiers": {"energy": {"preCondition": {"condition": "energy == 0"}, "postCondition": {"condition": "energy <= 1"}}}
            },
            "secondStatement": {
              "name": "Loop", "type": "REPETITION", "isProven": false,
              "preCondition": {"condition": "x == 1"}, "postCondition": {"condition": "x == 10"},
              "variant": {"condition": "10 - x"}, "invariant": {"condition": "x <= 10"}, "guard": {"condition": "x < 10"},
              "loopStatement": {
                "name": "Branch", "type": "SELECTION", "isProven": false,
                "preCondition": {"condition": "x < 10"}, "postCondition": {"condition": "x <= 10"},
                "guards": [{"condition": "x < 5"}, {"condition": "x >= 5"}],
                "commands": [
                  {
                    "name": "Step", "type": "STATEMENT", "isProven": false, "programStatement": "x = x + 1;",
                    "preCondition": {"condition": "x < 5"}, "postCondition": {"condition": "x <= 10"}
                  },
                  {
                    "name": "Rest", "type": "SKIP", "isProven": false,
                    "preCondition": {"condition": "x >= 5"}, "postCondition": {"condition": "x <= 10"},
                    "verifiers": {"energy": {"preCondition": {"condition": "energy <= 1"}, "postCondition": {"condition": "energy <= 1"}}}
                  }
                ]
              }
            }
          }
        }
        """;

    private static CbCFormula formula() throws Exception {
        return new ObjectMapper().readValue(FORMULA_JSON, CbCFormula.class);
    }

    /** A condition as the backend prints it, attributed to the statement {@code originId}. */
    private static JobCondition condition(String content, long originId) {
        return new JobCondition(Condition.fromString(content).getCondition(), originId, "");
    }

    @Test
    void swapsTheVerifiersOwnConditionsIntoTheNarrowedTree() throws Exception {
        NarrowedProgram program = NarrowedProgram.of(formula());

        JobProgram energy = program.forVerifier("energy");

        JobStatement expected = JobStatement.composition(1, "Comp",
            condition("energy == 0", 1), condition("energy <= budget", 1), condition("energy <= 1", 1),
            JobStatement.simple(2, "Assign", condition("energy == 0", 2), condition("energy <= 1", 2)),
            JobStatement.repetition(3, "Loop", null, null,
                condition("x <= 10", 3), condition("x < 10", 3), Condition.fromString("10 - x").getCondition(),
                JobStatement.selection(4, "Branch", null, null,
                    List.of(condition("x < 5", 4), condition("x >= 5", 4)),
                    List.of(
                        JobStatement.simple(5, "Step", null, null),
                        JobStatement.simple(6, "Rest", condition("energy <= 1", 6), condition("energy <= 1", 6))))));
        Assertions.assertEquals(new JobProgram("Demo", "SrcGen", "method", List.of("int x", "int total"),
            List.of(condition("total >= 0", 0)), condition("energy == 0", 0), condition("energy <= budget", 0), expected),
            energy);
    }

    @Test
    void aVerifierWithoutAnyConditionsStillGetsTheWholeStructure() throws Exception {
        NarrowedProgram program = NarrowedProgram.of(formula());

        JobProgram bare = program.forVerifier("maint");

        Assertions.assertNull(bare.preCondition());
        Assertions.assertNull(bare.postCondition());
        JobStatement root = bare.statement();
        Assertions.assertEquals(JobStatement.COMPOSITION, root.statementType());
        Assertions.assertNull(root.preCondition());
        Assertions.assertNull(root.intermediateCondition());
        Assertions.assertEquals(2, root.leftStatement().id());
        Assertions.assertEquals(condition("x < 10", 3), root.rightStatement().guardCondition(),
            "Structural fields are the same for every Verifier");
        Assertions.assertEquals(List.of(condition("x < 5", 4), condition("x >= 5", 4)),
            root.rightStatement().loopStatement().guards());
        Assertions.assertEquals(List.of("int x", "int total"), bare.javaVariables());
        Assertions.assertEquals(List.of(condition("total >= 0", 0)), bare.globalConditions());
    }

    @Test
    void onlyTheReceivingVerifiersConditionsAreSwappedIn() throws Exception {
        NarrowedProgram program = NarrowedProgram.of(formula());

        JobStatement root = program.forVerifier("sec").statement();

        Assertions.assertEquals(condition("safe(x)", 1), root.preCondition());
        Assertions.assertNull(root.intermediateCondition(), "sec wrote no intermediate condition");
        Assertions.assertNull(root.leftStatement().preCondition(), "energy's condition on Assign is not sec's");
    }

    @Test
    void idsAreAssignedInPreorderAndAreTheSameForEveryVerifier() throws Exception {
        NarrowedProgram program = NarrowedProgram.of(formula());

        Assertions.assertEquals(List.of(1L, 2L, 3L, 4L, 5L, 6L), program.statementIds());
        Assertions.assertEquals(ids(program.forVerifier("energy").statement()), ids(program.forVerifier("sec").statement()));
    }

    private static List<Long> ids(JobStatement statement) {
        return switch (statement.statementType()) {
            case JobStatement.COMPOSITION -> concat(statement.id(), ids(statement.leftStatement()), ids(statement.rightStatement()));
            case JobStatement.REPETITION -> concat(statement.id(), ids(statement.loopStatement()), List.of());
            case JobStatement.SELECTION -> concat(statement.id(),
                statement.statements().stream().flatMap(s -> ids(s).stream()).toList(), List.of());
            case JobStatement.STRONG_WEAK -> concat(statement.id(), ids(statement.statement()), List.of());
            default -> List.of(statement.id());
        };
    }

    private static List<Long> concat(long id, List<Long> first, List<Long> second) {
        return Stream.of(List.of(id), first, second).flatMap(List::stream).toList();
    }

    @Test
    void mergesAResultIntoTheStatementsVerifiersEntriesKeepingTheirConditions() throws Exception {
        CbCFormula formula = formula();
        NarrowedProgram program = NarrowedProgram.of(formula);

        program.merge("energy", Map.of(
            "1", new StatementResult(true, "3.2 J"),
            "2", new StatementResult(false, null),
            "5", new StatementResult(true, "0.1 J")));

        CompositionStatement root = (CompositionStatement) formula.getStatement();
        VerifierEntry rootEntry = root.getVerifiers().get("energy");
        Assertions.assertEquals(Boolean.TRUE, rootEntry.proven());
        Assertions.assertEquals("3.2 J", rootEntry.status());
        Assertions.assertEquals("energy == 0", rootEntry.preCondition().getCondition(), "The authored condition survives");
        Assertions.assertEquals("energy <= 1", rootEntry.intermediateCondition().getCondition());
        Assertions.assertNull(root.getVerifiers().get("sec").proven(), "Another Verifier's entry is untouched");

        VerifierEntry assign = root.getFirstStatement().getVerifiers().get("energy");
        Assertions.assertEquals(Boolean.FALSE, assign.proven());
        Assertions.assertNull(assign.status(), "A Verifier with nothing to say leaves the status absent");

        SmallRepetitionStatement loop = (SmallRepetitionStatement) root.getSecondStatement();
        Assertions.assertNull(loop.getVerifiers(), "No result for the loop: nothing is invented");
        AbstractStatement step = ((SelectionStatement) loop.getLoopStatement()).getCommands().get(0);
        VerifierEntry stepEntry = step.getVerifiers().get("energy");
        Assertions.assertEquals(Boolean.TRUE, stepEntry.proven(), "A result is recorded even where no condition was written");
        Assertions.assertEquals("0.1 J", stepEntry.status());
        Assertions.assertNull(stepEntry.preCondition());
        Assertions.assertFalse(formula.isProven(), "The Functional Verifier's own verdict is untouched");
    }

    @Test
    void ignoresResultEntriesForIdsTheProgramDoesNotHave() throws Exception {
        CbCFormula formula = formula();
        NarrowedProgram program = NarrowedProgram.of(formula);

        program.merge("energy", Map.of("42", new StatementResult(true, null), "root", new StatementResult(true, null)));

        Assertions.assertNull(formula.getStatement().getVerifiers().get("energy").proven());
        Assertions.assertNull(formula.getStatement().getVerifiers().get("energy").status());
    }
}
