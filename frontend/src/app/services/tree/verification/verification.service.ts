import { Injectable, inject } from "@angular/core";
import { LocalCBCFormula } from "../../../types/CBCFormula";
import { ProjectService } from "../../project/project.service";
import { TreeService } from "../tree.service";
import { ConsoleService } from "../../console/console.service";
import { IAbstractStatement, nodeStateFor } from "../../../types/statements/abstract-statement";
import { AbstractStatementNode } from "../../../types/statements/nodes/abstract-statement-node";
import { GlobalSettingsService } from "../../global-settings.service";
import { ConsoleInfoLine, ConsoleLogGroup } from "../../console/log";
import {
  DoneMessage,
  LogMessage,
  VerificationMessage,
} from "../../../types/VerificationMessage";
import { FUNCTIONAL_VERIFIER_ID } from "../../../types/Verifier";
import {VerifierService} from "../../verifier/verifier.service";

/**
 * Service to distribute the verification result from the http response to the tree service.
 * @see TreeService
 */
@Injectable({
  providedIn: "root",
})
export class VerificationService {
  private projectService = inject(ProjectService);
  private treeService = inject(TreeService);
  private consoleService = inject(ConsoleService);
  private globalSettingsService = inject(GlobalSettingsService);
  private verifierService = inject(VerifierService)

  /** Inserted by Angular inject() migration for backwards compatibility */
  constructor(...args: unknown[]);

  constructor() {}

  public beginVerificationLog() {
    const group = this.consoleService.addGroup();
    group.status = "RUNNING";
    return group;
  }

  /**
   * Handle one message off the job's WS: a log line (attributed to whichever Verifier or
   * functional verification produced it), a per-Verifier done signal, or the final complete
   * signal — which carries nothing to show and is handled by the caller (fetching the result).
   */
  public verifyInfo(group: ConsoleLogGroup, msg: VerificationMessage) {
    switch (msg.type) {
      case "log":
        this.logMessage(group, msg);
        break;
      case "done":
        this.doneMessage(group, msg);
        break;
      case "complete":
        break;
    }
  }

  private logMessage(group: ConsoleLogGroup, msg: LogMessage) {
    if (msg.verifier === FUNCTIONAL_VERIFIER_ID) {
      switch (msg.message) {
        case "verification started":
          group.lines.push(new ConsoleInfoLine("Verification started."));
          this.consoleService.beginLoading("verifying");
          return;
        case "verification initialized":
          group.lines.push(new ConsoleInfoLine("Verification initialized."));
          return;
      }
    }
    if (msg.verifier === undefined) {
      // A line about the job's own orchestration, not any Verifier's output: no [name] prefix.
      group.lines.push(new ConsoleInfoLine(msg.message));
      return;
    }
    group.lines.push(
      new ConsoleInfoLine(`[${this.verifierLabel(msg.verifier)}] ${msg.message}`),
    );
  }

  private doneMessage(group: ConsoleLogGroup, msg: DoneMessage) {
    const label = this.verifierLabel(msg.verifier);
    group.lines.push(
      new ConsoleInfoLine(
        `${label} finished: ${msg.proven ? "passed" : "failed"}.`,
        msg.proven ? "pi pi-check-circle" : "pi pi-times-circle",
      ),
    );
  }

  private verifierLabel(verifierId: string): string {
    return verifierId === FUNCTIONAL_VERIFIER_ID
      ? "Functional verification"
      : verifierId;
  }

  public async next(
    group: ConsoleLogGroup,
    formula: LocalCBCFormula,
    urn: string,
  ) {
    this.consoleService.finishLoading();
    const enabledVerifiers = this.verifierService.effectiveEnabledNonFunctionalVerifierIds;
    if (formula.statement) {
      const currentFormula = await this.projectService.getFileContent(urn);
      const currentStatements = this.treeService.getStatementsFromFormula(
        currentFormula as LocalCBCFormula,
      );
      const newStatements = this.treeService.getStatementsFromFormula(formula);
      // The statements should be in the same order, since the structure should be unchanged.
      currentStatements.forEach((stmt, index) => {
        stmt.isProven = newStatements[index]?.isProven;
        stmt.nodeState = nodeStateFor(newStatements[index]?.verifiers, enabledVerifiers);
        stmt.verifiers = newStatements[index]?.verifiers ?? stmt.verifiers;
      });
      this.treeService.reapplyRunChanges(currentStatements);
      this.projectService.syncLocalFileContent(urn, currentFormula);
    }
    this.globalSettingsService.isVerifying = false;
    if (formula.isProven) {
      group.lines.push(
        new ConsoleInfoLine(
          `Verification successful: The formula "${formula.name}" is verified.`,
          "pi pi-check-circle",
        ),
      );
      group.status = "SUCCESS";
    } else {
      group.lines.push(
        new ConsoleInfoLine(
          `Verification failed: The formula "${formula.name}" could not be (completely) verified.`,
          "pi pi-times-circle",
        ),
      );
      group.status = "FAIL";
    }
  }

  /**
   * Handle verification result for a single statement and its subtree
   * @param formula The formula returned from backend verification
   * @param statementNode The statement node that was verified
   * @param urn urn of the file being verified
   */
  public async nextStatement(
    group: ConsoleLogGroup,
    formula: LocalCBCFormula,
    statementNode: AbstractStatementNode,
    urn: string,
  ) {
    this.consoleService.finishLoading();
    const enabledVerifiers = this.verifierService.effectiveEnabledNonFunctionalVerifierIds;

    if (!formula.statement) {
      group.lines.push(
        new ConsoleInfoLine(
          `Verification failed: No statement in response for "${statementNode.statement.name}".`,
          "pi pi-times-circle",
        ),
      );
      group.status = "FAIL";
      return;
    }

    // Get statements from the verification result
    const resultStatements = this.treeService.getStatementsFromFormula(formula);

    // Collect all nodes in the subtree starting from the verified node
    const subtreeNodes = this.treeService.collectSubtreeNodes(statementNode);

    // Collect statements from subtree in order
    const subtreeStatements: IAbstractStatement[] = [];
    this.collectStatementsFromNode(statementNode, subtreeStatements);

    // If the original node wasn't ROOT, the result will have a ROOT wrapper
    // So we need to skip the ROOT statement in the result
    let resultStartIndex = 0;
    if (
      statementNode.statement.type !== "ROOT" &&
      resultStatements.length > 0 &&
      resultStatements[0].type === "ROOT"
    ) {
      resultStartIndex = 1; // Skip the ROOT wrapper
    }

    // Match statements from result to nodes in the subtree by order
    const minLength = Math.min(
      resultStatements.length - resultStartIndex,
      subtreeStatements.length,
    );

    const updatedStatements: IAbstractStatement[] = [];
    for (let i = 0; i < minLength; i++) {
      const resultStmt = resultStatements[resultStartIndex + i];
      const subtreeStmt = subtreeStatements[i];

      // Find the node corresponding to this statement
      const node = subtreeNodes.find((n) => n.statement.id === subtreeStmt.id);
      if (node) {
        node.statement.isProven = resultStmt.isProven || false;
        node.statement.nodeState = nodeStateFor(resultStmt.verifiers, enabledVerifiers);
        node.statement.verifiers = resultStmt.verifiers ?? node.statement.verifiers;
        updatedStatements.push(node.statement);
      }
    }

    this.treeService.reapplyRunChanges(updatedStatements);

    // Refresh nodes to trigger UI update
    this.treeService.refreshNodes();

    // Show success/failure message
    if (formula.isProven) {
      group.lines.push(
        new ConsoleInfoLine(
          `Verification successful: The statement "${statementNode.statement.name}" and its subtree are verified.`,
          "pi pi-check-circle",
        ),
      );
      group.status = "SUCCESS";
    } else {
      group.lines.push(
        new ConsoleInfoLine(
          `Verification failed: The statement "${statementNode.statement.name}" or its subtree could not be (completely) verified.`,
          "pi pi-times-circle",
        ),
      );
      group.status = "FAIL";
    }
  }
  /**
   * Collect statements from a node and its subtree in order
   * @param node The root node
   * @param statements Array to collect statements into
   */
  private collectStatementsFromNode(
    node: AbstractStatementNode,
    statements: IAbstractStatement[],
  ): void {
    statements.push(node.statement);
    for (const child of node.children) {
      if (child) {
        this.collectStatementsFromNode(child, statements);
      }
    }
  }

  abort(urn: string) {
    this.globalSettingsService.isVerifying = false;
  }
}
