import {ICondition} from "../condition/condition";
import {IPosition, Position} from "../position";
import {AbstractStatement, IAbstractStatement} from "./abstract-statement";

/**
 * Verifier-specific intermediate conditions of a composition, keyed by verifier id.
 * Sparse like {@link IVerifierConditions}: only verifiers with a non-empty condition
 * have an entry, and the primary (functional) verifier's intermediate condition is
 * the statement's own `intermediateCondition`.
 */
export type IVerifierIntermediateConditions = Record<string, ICondition>;

/**
 * Data only representation of {@link CompositionStatementComponent}.
 * Compatible with the api calls.
 */
export interface ICompositionStatement extends IAbstractStatement {
    intermediateCondition: ICondition
    verifierIntermediateConditions?: IVerifierIntermediateConditions
    firstStatement: IAbstractStatement | undefined
    secondStatement: IAbstractStatement | undefined
}

/**
 * Data only representation of {@link CompositionStatementComponent}.
 * @see ICompositionStatement
 */
export class CompositionStatement extends AbstractStatement implements ICompositionStatement {

    public static readonly TYPE = "COMPOSITION"

    public verifierIntermediateConditions: IVerifierIntermediateConditions = {}

    constructor(
        name: string,
        preCondition: ICondition,
        postCondition: ICondition,
        public intermediateCondition: ICondition,
        public firstStatement: IAbstractStatement | undefined,
        public secondStatement: IAbstractStatement | undefined,
        position: IPosition = new Position(0, 0),
    ) {
        super(name, CompositionStatement.TYPE, preCondition, postCondition, position)
    }
}