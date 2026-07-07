import { IPosition, Position } from "../position";
import { ICondition } from "../condition/condition";
import { IStatement } from "./simple-statement";
import { ICompositionStatement } from "./composition-statement";
import { IRepetitionStatement } from "./repetition-statement";
import { ISkipStatement } from "./strong-weak-statement";
import { ISelectionStatement } from "./selection-statement";

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
 * Verifier-specific pre/postcondition pairs of a statement, keyed by verifier id.
 * Sparse: only verifiers with at least one non-empty condition have an entry. The
 * primary (functional) verifier never appears here — its conditions are the
 * statement's own `preCondition`/`postCondition`.
 */
export type IVerifierConditions = Record<
  string,
  { preCondition: ICondition; postCondition: ICondition }
>;

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
  verifierConditions?: IVerifierConditions;
  isProven: boolean;
  nodeState: 'verified' | 'unverified' | 'failed';
  position?: IPosition;
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
  public nodeState: 'verified' | 'unverified' | 'failed';
  public verifierConditions: IVerifierConditions = {};

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
