import { IPosition, Position } from "../position";
import { ICondition } from "../condition/condition";
import { IStatement } from "./simple-statement";
import { ICompositionStatement } from "./composition-statement";
import { IRepetitionStatement } from "./repetition-statement";
import { ISkipStatement } from "./strong-weak-statement";
import { ISelectionStatement } from "./selection-statement";
import { FUNCTIONAL_VERIFIER_ID } from "../Verifier";

export type IAbstractStatementImpl =
  | IStatement
  | ICompositionStatement
  | IRepetitionStatement
  | ISkipStatement
  | ISelectionStatement;
export type StatementType =
  | "ROOT"
  | "STATEMENT"
  | "COMPOSITION"
  | "RETURN"
  | "SELECTION"
  | "SKIP"
  | "REPETITION";

/**
 * One verifier's condition and result for a statement. Mirrors the statement's own
 * condition properties: every statement has a pre- and a postcondition, and a
 * composition additionally has an intermediate condition — which is only present
 * for compositions, and only when non-empty. `preCondition`/`postCondition` are
 * themselves optional: a Verifier that was never given a condition for this
 * statement still reports a result, producing a result-only entry with neither.
 * `proven`/`status` are that verifier's result for this statement, absent until it
 * has actually reported one.
 */
export interface IVerifierEntry {
  preCondition?: ICondition;
  postCondition?: ICondition;
  intermediateCondition?: ICondition;
  proven?: boolean;
  status?: string;
}

/**
 * Whether a verifier entry carries a reported result — used to keep a result-only entry
 * (no authored conditions) from being pruned as "empty" when conditions are finalized.
 */
export function hasVerifierResult(entry: IVerifierEntry | undefined): boolean {
  return entry?.proven !== undefined || entry?.status !== undefined;
}

/**
 * Per-verifier conditions and results of a statement, keyed by verifier id. Sparse:
 * only verifiers with at least one non-empty condition or a reported result have an
 * entry. The primary (functional) verifier's own conditions are still the statement's
 * own `preCondition`/`postCondition`/`intermediateCondition`, but it does appear here
 * too, keyed by `FUNCTIONAL_VERIFIER_ID`, as a result-only entry (`proven` only, never
 * `status` or conditions).
 */
export type IVerifiers = Record<string, IVerifierEntry>;

/**
 * Data only representation of the statements edited in the editor
 */
export interface IAbstractStatement {
  id: string;
  name: string;
  type:
    | "STATEMENT"
    | "COMPOSITION"
    | "RETURN"
    | "SELECTION"
    | "SKIP"
    | "REPETITION"
    | "ROOT";
  preCondition: ICondition;
  postCondition: ICondition;
  verifiers?: IVerifiers;
  isProven: boolean;
  nodeState: NodeState;
  position?: IPosition;
}

export type NodeState =
  | 'verified-all'
  | 'verified-functional'
  | 'settings-changed'
  | 'unverified'
  | 'failed'
  | 'failed-non-functional';

/**
 * `failed-non-functional` means a *different*, non-functional Verifier is what failed —
 * `func` itself still proved this statement, unlike a plain `failed`.
 */
export function nodeStateFor(
  isProven: boolean,
  verifiers: IVerifiers | undefined,
  verifiedState: NodeState,
): NodeState {
  if (isProven) {
    return verifiedState;
  }
  return verifiers?.[FUNCTIONAL_VERIFIER_ID]?.proven === true
    ? "failed-non-functional"
    : "failed";
}

/**
 * Data only representation of the statements edited in the editor.
 * @see IAbstractStatement
 */
export class AbstractStatement implements IAbstractStatement {
  /**
   * Own properties holding nested child statements, serialized last (see
   * {@link toJSON}) so the scalar fields and (verifier) conditions stay readable
   * at the top of each statement object.
   */
  private static readonly CHILD_STATEMENT_KEYS = [
    "statement",
    "firstStatement",
    "secondStatement",
    "loopStatement",
    "commands",
  ];

  public readonly id: string;
  public isProven = false;
  public nodeState: NodeState;
  public verifiers: IVerifiers = {};

  public toJSON(): Record<string, unknown> {
    const properties = { ...this } as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const key of Object.keys(properties)) {
      if (!AbstractStatement.CHILD_STATEMENT_KEYS.includes(key)) {
        ordered[key] = properties[key];
      }
    }
    for (const key of AbstractStatement.CHILD_STATEMENT_KEYS) {
      if (key in properties) {
        ordered[key] = properties[key];
      }
    }
    return ordered;
  }
    constructor(
    public name: string,
    public type:
      | "STATEMENT"
      | "COMPOSITION"
      | "RETURN"
      | "SELECTION"
      | "SKIP"
      | "REPETITION"
      | "ROOT",
    public preCondition: ICondition,
    public postCondition: ICondition,
    public position: IPosition = new Position(0, 0),
  ) {
    this.id = String(Date.now() * Math.random());
    this.nodeState = 'unverified'
  }
}
