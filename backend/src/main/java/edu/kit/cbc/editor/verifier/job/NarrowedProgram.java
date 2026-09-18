package edu.kit.cbc.editor.verifier.job;

import edu.kit.cbc.common.corc.cbcmodel.CbCFormula;
import edu.kit.cbc.common.corc.cbcmodel.Condition;
import edu.kit.cbc.common.corc.cbcmodel.JavaVariable;
import edu.kit.cbc.common.corc.cbcmodel.VerifierEntry;
import edu.kit.cbc.common.corc.cbcmodel.statements.AbstractStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.CompositionStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.SelectionStatement;
import edu.kit.cbc.common.corc.cbcmodel.statements.SmallRepetitionStatement;
import edu.kit.cbc.common.corc.codegeneration.CodeGenerator;
import java.util.ArrayList;
import java.util.IdentityHashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;

/**
 * The job's formula as the Verifiers see it: every statement numbered once, in pre-order from
 * 1, so that each Verifier receives the same ids and its flat result maps back onto the same
 * statements. {@link #forVerifier} narrows the tree for one Verifier — its own Verifier
 * Conditions in the primary condition fields, structural fields as they are — and
 * {@link #merge} writes a Verifier's result into the statements' {@code verifiers} entries.
 *
 * <p>The backend's statement model has no id of its own, hence the numbering here; the program
 * level (root conditions, global conditions) is attributed to id 0. A skip or return statement
 * is sent as a {@code simple} leaf: the contract's {@code strongWeak} kind requires a nested
 * statement, which neither has. Class and method name are the ones the {@link CodeGenerator}
 * gives every program, since a formula names neither.
 *
 * <p>Both operations synchronize on this instance: several Verifiers' results merge into one
 * tree, and a narrowing must not read a {@code verifiers} map another thread is writing.
 */
public final class NarrowedProgram {

    private static final Logger LOGGER = Logger.getGlobal();

    private final CbCFormula formula;
    private final Map<Long, AbstractStatement> statementsById = new LinkedHashMap<>();
    private final Map<AbstractStatement, Long> idsByStatement = new IdentityHashMap<>();

    private NarrowedProgram(CbCFormula formula) {
        this.formula = formula;
        number(formula.getStatement());
    }

    public static NarrowedProgram of(CbCFormula formula) {
        return new NarrowedProgram(formula);
    }

    private void number(AbstractStatement statement) {
        long id = statementsById.size() + 1;
        statementsById.put(id, statement);
        idsByStatement.put(statement, id);
        for (AbstractStatement child : children(statement)) {
            number(child);
        }
    }

    private static List<AbstractStatement> children(AbstractStatement statement) {
        return switch (statement) {
            case CompositionStatement composition -> List.of(composition.getFirstStatement(), composition.getSecondStatement());
            case SmallRepetitionStatement repetition -> List.of(repetition.getLoopStatement());
            case SelectionStatement selection -> selection.getCommands();
            default -> List.of();
        };
    }

    /** The statement ids in pre-order; the keys a Verifier's result is expected under. */
    List<Long> statementIds() {
        return List.copyOf(statementsById.keySet());
    }

    /** The program with {@code verifierId}'s own Verifier Conditions in the primary condition fields. */
    public synchronized JobProgram forVerifier(String verifierId) {
        VerifierEntry root = entry(formula.getVerifiers(), verifierId);
        List<JobCondition> globalConditions = new ArrayList<>();
        for (Condition condition : formula.getGlobalConditions() == null ? List.<Condition>of() : formula.getGlobalConditions()) {
            globalConditions.add(condition(condition, 0));
        }
        List<String> javaVariables = new ArrayList<>();
        for (JavaVariable variable : formula.getJavaVariables() == null ? List.<JavaVariable>of() : formula.getJavaVariables()) {
            javaVariables.add(variable.getName());
        }
        return new JobProgram(
            formula.getName(),
            CodeGenerator.CLASS_NAME,
            CodeGenerator.METHOD_NAME,
            javaVariables,
            globalConditions,
            root == null ? null : condition(root.preCondition(), 0),
            root == null ? null : condition(root.postCondition(), 0),
            narrow(formula.getStatement(), verifierId)
        );
    }

    private JobStatement narrow(AbstractStatement statement, String verifierId) {
        long id = idsByStatement.get(statement);
        VerifierEntry entry = entry(statement.getVerifiers(), verifierId);
        JobCondition pre = entry == null ? null : condition(entry.preCondition(), id);
        JobCondition post = entry == null ? null : condition(entry.postCondition(), id);
        String name = statement.getName();
        return switch (statement) {
            case CompositionStatement composition -> JobStatement.composition(id, name, pre, post,
                entry == null ? null : condition(entry.intermediateCondition(), id),
                narrow(composition.getFirstStatement(), verifierId),
                narrow(composition.getSecondStatement(), verifierId));
            case SmallRepetitionStatement repetition -> JobStatement.repetition(id, name, pre, post,
                condition(repetition.getInvariant(), id),
                condition(repetition.getGuard(), id),
                repetition.getVariant() == null ? null : repetition.getVariant().getCondition(),
                narrow(repetition.getLoopStatement(), verifierId));
            case SelectionStatement selection -> {
                List<JobCondition> guards = new ArrayList<>();
                for (Condition guard : selection.getGuards()) {
                    guards.add(condition(guard, id));
                }
                List<JobStatement> commands = new ArrayList<>();
                for (AbstractStatement command : selection.getCommands()) {
                    commands.add(narrow(command, verifierId));
                }
                yield JobStatement.selection(id, name, pre, post, guards, commands);
            }
            default -> JobStatement.simple(id, name, pre, post);
        };
    }

    private static VerifierEntry entry(Map<String, VerifierEntry> verifiers, String verifierId) {
        return verifiers == null ? null : verifiers.get(verifierId);
    }

    private static JobCondition condition(Condition condition, long originId) {
        return condition == null ? null : new JobCondition(condition.getCondition(), originId, "");
    }

    /**
     * Records the result on the statements' {@code verifiers} entries, keeping the authored
     * conditions; an entry is created where none existed, since a Verifier checks a statement
     * whether or not a condition was written for it. Ids the program never handed out are
     * logged and skipped.
     */
    public synchronized void merge(String verifierId, Map<String, StatementResult> result) {
        for (Map.Entry<String, StatementResult> reported : result.entrySet()) {
            AbstractStatement statement = statementOf(reported.getKey());
            if (statement == null) {
                LOGGER.warning(String.format("Verifier '%s' reported a result for unknown statement id '%s'; ignored",
                    verifierId, reported.getKey()));
                continue;
            }
            Map<String, VerifierEntry> verifiers = statement.getVerifiers();
            if (verifiers == null) {
                verifiers = new LinkedHashMap<>();
                statement.setVerifiers(verifiers);
            }
            VerifierEntry existing = verifiers.get(verifierId);
            verifiers.put(verifierId, new VerifierEntry(
                existing == null ? null : existing.preCondition(),
                existing == null ? null : existing.postCondition(),
                existing == null ? null : existing.intermediateCondition(),
                reported.getValue().proven(),
                reported.getValue().status()));
        }
    }

    private AbstractStatement statementOf(String id) {
        try {
            return statementsById.get(Long.parseLong(id));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
