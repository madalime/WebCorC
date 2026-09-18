package edu.kit.cbc.common.corc.codegeneration;

import edu.kit.cbc.common.corc.cbcmodel.CbCFormula;
import edu.kit.cbc.common.corc.cbcmodel.JavaVariable;
import edu.kit.cbc.common.corc.cbcmodel.JavaVariableKind;
import java.util.List;

public final class CodeGenerator {

    /** The class every generated program lives in; a formula carries no class name of its own. */
    public static final String CLASS_NAME = "SrcGen";
    /** The method every generated program is the body of; a formula carries no method name of its own. */
    public static final String METHOD_NAME = "method";

    private static final String TAB_SPACES = "    ";
    private static final String CLASS_PATTERN = """
        public final class %s {
        %s
        public void %s() {
        %s
        }
        }
        """;

    private CodeGenerator() {
    }

    public static String generate(CbCFormula formula) {
        return fixTabs(String.format(
            CLASS_PATTERN,
            CLASS_NAME,
            generateLocalVariables(formula.getJavaVariables()),
            METHOD_NAME,
            formula.getStatement().generateCode()
        ));
    }

    private static String fixTabs(String toFix) {
        int currentTabDepth = 0;

        StringBuilder tabbed = new StringBuilder();

        for (String line : toFix.lines().toList()) {
            if (line.contains("}")) {
                currentTabDepth--;
            }

            tabbed.append(TAB_SPACES.repeat(currentTabDepth));
            tabbed.append(line);
            tabbed.append('\n');

            if (line.contains("{")) {
                currentTabDepth++;
            }
        }

        return tabbed.toString();
    }

    private static String generateLocalVariables(List<JavaVariable> variables) {
        StringBuilder localVariables = new StringBuilder();
        for (JavaVariable variable : variables) {
            if (variable.getKind() == JavaVariableKind.LOCAL) {
                localVariables.append(variable.generateCode());
                localVariables.append('\n');
            }
        }

        return localVariables.toString();
    }
}
