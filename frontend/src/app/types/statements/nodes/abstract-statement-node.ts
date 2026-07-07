import { BehaviorSubject } from "rxjs";
import { Condition, ICondition } from "../../condition/condition";
import {
  IAbstractStatement,
  IVerifierConditions,
  StatementType,
} from "../abstract-statement";
import { IPosition } from "../../position";

export class AbstractStatementNode {
  public statement: IAbstractStatement;
  public parent: AbstractStatementNode | undefined;
  public children: (AbstractStatementNode | undefined)[] = [];
  public precondition: BehaviorSubject<ICondition>;
  public postcondition: BehaviorSubject<ICondition>;
  private _preconditionEditable = new BehaviorSubject<boolean>(true);
  public get preconditionEditable() {
    return this._preconditionEditable;
  }
  public set preconditionEditable(value) {
    this._preconditionEditable = value;
  }
  private _postconditionEditable = new BehaviorSubject<boolean>(true);
  public get postconditionEditable() {
    return this._postconditionEditable;
  }
  public set postconditionEditable(value) {
    this._postconditionEditable = value;
  }
  /**
   * Verifier condition subjects, keyed by the main condition subject ("slot") they
   * belong to. Parent and child share their pre/postconditions by sharing the slot
   * subject itself (see {@link overridePrecondition}) — keying the verifier
   * conditions by slot makes them ride along with every sharing mechanism
   * (child creation, root/composition/selection cascades, conflict adoption)
   * without the subclasses repeating the wiring. Entries are garbage collected
   * with their slot.
   */
  private static readonly slotVerifierConditions = new WeakMap<
    BehaviorSubject<ICondition>,
    Map<string, BehaviorSubject<ICondition>>
  >();

  private static verifierConditionsOfSlot(
    slot: BehaviorSubject<ICondition>,
  ): Map<string, BehaviorSubject<ICondition>> {
    let conditions = AbstractStatementNode.slotVerifierConditions.get(slot);
    if (!conditions) {
      conditions = new Map();
      AbstractStatementNode.slotVerifierConditions.set(slot, conditions);
    }
    return conditions;
  }

  /**
   * Persisted form of one slot's verifier conditions, e.g. a composition's
   * intermediate condition slot: stored entries of verifiers without an
   * instantiated subject are kept as-is, instantiated ones are written back,
   * and empty conditions are dropped to keep the record sparse.
   */
  protected static finalizeSlotConditions(
    slot: BehaviorSubject<ICondition>,
    stored: Record<string, ICondition> | undefined,
  ): Record<string, ICondition> {
    const conditions: Record<string, ICondition> = { ...stored };
    const slotConditions =
      AbstractStatementNode.slotVerifierConditions.get(slot);
    if (!slotConditions) {
      return conditions;
    }
    for (const [verifierId, subject] of slotConditions) {
      const value = subject.getValue();
      if (value.condition === "") {
        delete conditions[verifierId];
      } else {
        conditions[verifierId] = value;
      }
    }
    return conditions;
  }

  /**
   * Copy the current verifier condition values of one slot onto another as fresh,
   * unshared subjects. Used when a child is disconnected from its parent and gets
   * fresh main condition subjects — the verifier conditions are detached the same
   * way, keeping their current values.
   */
  public static copySlotVerifierConditions(
    from: BehaviorSubject<ICondition>,
    to: BehaviorSubject<ICondition>,
  ): void {
    if (from === to) {
      return;
    }
    const source = AbstractStatementNode.slotVerifierConditions.get(from);
    if (!source) {
      return;
    }
    const target = AbstractStatementNode.verifierConditionsOfSlot(to);
    for (const [verifierId, subject] of source) {
      target.set(
        verifierId,
        new BehaviorSubject<ICondition>(
          new Condition(subject.getValue().condition),
        ),
      );
    }
  }

  constructor(
    statement: IAbstractStatement,
    parent: AbstractStatementNode | undefined,
  ) {
    this.statement = statement;
    this.parent = parent;
    this.precondition = new BehaviorSubject<ICondition>(statement.preCondition);
    this.postcondition = new BehaviorSubject<ICondition>(
      statement.postCondition,
    );
  }

  /**
   * The pre condition a specific verifier attaches to this statement. Lazily backed
   * by a BehaviorSubject bound to the current precondition slot, so it is shared
   * between parent and child exactly like {@link precondition} itself. Seeded from
   * the statement's persisted verifier conditions on first access.
   * @param verifierId The id of the verifier owning the condition
   */
  public verifierPrecondition(verifierId: string): BehaviorSubject<ICondition> {
    return this.slotVerifierCondition(
      this.precondition,
      verifierId,
      this.statement.verifierConditions?.[verifierId]?.preCondition,
    );
  }

  /**
   * The post condition a specific verifier attaches to this statement.
   * @see verifierPrecondition
   * @param verifierId The id of the verifier owning the condition
   */
  public verifierPostcondition(
    verifierId: string,
  ): BehaviorSubject<ICondition> {
    return this.slotVerifierCondition(
      this.postcondition,
      verifierId,
      this.statement.verifierConditions?.[verifierId]?.postCondition,
    );
  }

  protected slotVerifierCondition(
    slot: BehaviorSubject<ICondition>,
    verifierId: string,
    stored: ICondition | undefined,
  ): BehaviorSubject<ICondition> {
    const conditions = AbstractStatementNode.verifierConditionsOfSlot(slot);
    let subject = conditions.get(verifierId);
    if (!subject) {
      subject = new BehaviorSubject<ICondition>(stored ?? new Condition(""));
      conditions.set(verifierId, subject);
    }
    return subject;
  }

  public overridePrecondition(condition: BehaviorSubject<ICondition>): void {
    this.precondition = condition;
  }

  public overridePostcondition(condition: BehaviorSubject<ICondition>): void {
    this.postcondition = condition;
  }

  public deleteChild(node: AbstractStatementNode) {
    if (this.children.includes(node)) {
      this.children = this.children.filter(
        (filteredNode) => filteredNode != node,
      );
    }
  }

  public setPosition(position: { x: number; y: number }) {
    if ("position" in this.statement) {
      (this.statement.position as IPosition) = {
        xinPx: position.x,
        yinPx: position.y,
      };
    }
  }

  public position(): IPosition {
    if ("position" in this.statement) {
      return this.statement.position as IPosition;
    }
    return {
      xinPx: 0,
      yinPx: 0,
    };
  }

  public finalize() {
    this.statement.preCondition = this.precondition.getValue();
    this.statement.postCondition = this.postcondition.getValue();
    this.statement.verifierConditions = this.finalizeVerifierConditions();
    this.children.forEach((c) => c?.finalize());
  }

  /**
   * Persisted form of the verifier conditions: stored entries of verifiers whose
   * subjects were never instantiated are kept as-is, instantiated ones are written
   * back, and entries whose conditions are both empty are dropped to keep the
   * record sparse.
   */
  private finalizeVerifierConditions(): IVerifierConditions {
    const conditions: IVerifierConditions = {
      ...this.statement.verifierConditions,
    };
    const preSlot = AbstractStatementNode.slotVerifierConditions.get(
      this.precondition,
    );
    const postSlot = AbstractStatementNode.slotVerifierConditions.get(
      this.postcondition,
    );
    const verifierIds = new Set([
      ...(preSlot?.keys() ?? []),
      ...(postSlot?.keys() ?? []),
    ]);
    for (const verifierId of verifierIds) {
      const stored = this.statement.verifierConditions?.[verifierId];
      const preCondition =
        preSlot?.get(verifierId)?.getValue() ??
        stored?.preCondition ??
        new Condition("");
      const postCondition =
        postSlot?.get(verifierId)?.getValue() ??
        stored?.postCondition ??
        new Condition("");
      if (preCondition.condition === "" && postCondition.condition === "") {
        delete conditions[verifierId];
      } else {
        conditions[verifierId] = { preCondition, postCondition };
      }
    }
    return conditions;
  }

  public checkConditionSync(child: AbstractStatementNode) {
    let inSync =
      (this.precondition.getValue() == child.precondition.getValue() &&
        this.postcondition.getValue() == child.postcondition.getValue()) ||
      child.statement.type == "REPETITION";
    if (!inSync) {
      this.getConditionConflicts(child);
    }
    inSync =
      (this.precondition.getValue() == child.precondition.getValue() &&
        this.postcondition.getValue() == child.postcondition.getValue()) ||
      child.statement.type == "REPETITION";
    return inSync;
  }

  public addChild(statement: AbstractStatementNode, index: number) {
    throw Error(
      "AbstractStatementNode does not support child statement nodes.",
    );
  }

  getConditionConflicts(child: AbstractStatementNode): {
    version1: BehaviorSubject<ICondition>;
    version2: BehaviorSubject<ICondition>;
    type: "PRECONDITION" | "POSTCONDITION";
  }[] {
    const conflicts: {
      version1: BehaviorSubject<ICondition>;
      version2: BehaviorSubject<ICondition>;
      type: "PRECONDITION" | "POSTCONDITION";
    }[] = [];

    if (child.statement.type == "REPETITION") {
      return conflicts;
    }

    if (this.precondition.getValue() != child.precondition.getValue()) {
      if (
        this.precondition.getValue().condition ===
        child.precondition.getValue().condition
      ) {
        child.overridePrecondition(this.precondition);
      } else {
        conflicts.push({
          version1: this.precondition,
          version2: child.precondition,
          type: "PRECONDITION",
        });
      }
    }
    if (this.postcondition.getValue() != child.postcondition.getValue()) {
      if (
        this.postcondition.getValue().condition ===
        child.postcondition.getValue().condition
      ) {
        child.overridePostcondition(this.postcondition);
      } else {
        conflicts.push({
          version1: this.postcondition,
          version2: child.postcondition,
          type: "POSTCONDITION",
        });
      }
    }
    return conflicts;
  }

  createChild(
    _statementType: StatementType,
    _index?: number,
  ): AbstractStatementNode {
    throw Error(
      "AbstractStatementNode does not support child statement nodes.",
    );
  }
}
