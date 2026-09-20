import { TestBed } from '@angular/core/testing';

import { CbcFormulaMapperService } from './cbc-formula-mapper.service';
import { ICBCFormula, LocalCBCFormula } from '../../../types/CBCFormula';
import { IStatement } from '../../../types/statements/simple-statement';
import { RootStatement } from '../../../types/statements/root-statement';

describe('CbcFormulaMapperService', () => {
  let service: CbcFormulaMapperService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CbcFormulaMapperService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  /**
   * The per-statement sparse map of Verifier Conditions is named `verifiers` and widened
   * with an optional result (proven/status). Nothing populates a result yet, but the
   * mapper must carry one through losslessly wherever it is already present on the wire.
   */
  describe('verifiers field (renamed/widened from verifierConditions)', () => {
    it('importFormula carries a statement\'s verifiers, including proven/status, through under the new field name', () => {
      const formula: ICBCFormula = {
        name: 'f',
        preCondition: { condition: 'true' },
        postCondition: { condition: 'true' },
        javaVariables: [],
        globalConditions: [],
        renamings: [],
        isProven: false,
        statement: {
          id: '1',
          name: 's',
          type: 'STATEMENT',
          preCondition: { condition: 'true' },
          postCondition: { condition: 'true' },
          isProven: false,
          nodeState: 'unverified',
          programStatement: 'x = 1;',
          verifiers: {
            energy: {
              preCondition: { condition: 'true' },
              postCondition: { condition: 'true' },
              proven: true,
              status: '0.4 kWh',
            },
            security: {
              preCondition: { condition: 'true' },
              postCondition: { condition: 'true' },
            },
          },
        } as IStatement,
      };

      const imported = service.importFormula(formula);
      const inner = (imported.statement as RootStatement)
        .statement as IStatement;
      const verifiers = inner.verifiers ?? {};

      expect(verifiers['energy'].proven).toBe(true);
      expect(verifiers['energy'].status).toBe('0.4 kWh');
      expect(verifiers['security'].proven).toBeUndefined();
      expect(verifiers['security'].status).toBeUndefined();
    });

    /**
     * A Verifier that was never given a condition for a statement can still report a
     * result for it: `preCondition`/`postCondition` are optional on the wire, so the
     * entry carries only `proven`/`status`.
     */
    it('importFormula tolerates a result-only entry with no authored conditions', () => {
      const formula: ICBCFormula = {
        name: 'f',
        preCondition: { condition: 'true' },
        postCondition: { condition: 'true' },
        javaVariables: [],
        globalConditions: [],
        renamings: [],
        isProven: false,
        statement: {
          id: '1',
          name: 's',
          type: 'STATEMENT',
          preCondition: { condition: 'true' },
          postCondition: { condition: 'true' },
          isProven: false,
          nodeState: 'unverified',
          programStatement: 'x = 1;',
          verifiers: {
            mock: {
              proven: true,
              status: 'Mock verification passed',
            },
          },
        } as unknown as IStatement,
      };

      const imported = service.importFormula(formula);
      const inner = (imported.statement as RootStatement)
        .statement as IStatement;
      const verifiers = inner.verifiers ?? {};

      expect(verifiers['mock'].proven).toBe(true);
      expect(verifiers['mock'].status).toBe('Mock verification passed');
      // Absent on the wire stays absent: the backend cannot parse a `""` condition,
      // so padding here would make the next verify request a 400.
      expect(verifiers['mock'].preCondition).toBeUndefined();
      expect(verifiers['mock'].postCondition).toBeUndefined();
    });

    /**
     * Diagrams saved by earlier builds carry result entries padded with `""`
     * conditions; import normalizes them to absent so they stop being re-sent.
     */
    it('importFormula drops empty-string conditions from a verifier entry', () => {
      const formula: ICBCFormula = {
        name: 'f',
        preCondition: { condition: 'true' },
        postCondition: { condition: 'true' },
        javaVariables: [],
        globalConditions: [],
        renamings: [],
        isProven: false,
        statement: {
          id: '1',
          name: 's',
          type: 'STATEMENT',
          preCondition: { condition: 'true' },
          postCondition: { condition: 'true' },
          isProven: false,
          nodeState: 'unverified',
          programStatement: 'x = 1;',
          verifiers: {
            func: {
              preCondition: { condition: '' },
              postCondition: { condition: '' },
              proven: true,
            },
            energy: {
              preCondition: { condition: '' },
              postCondition: { condition: 'x > 1' },
            },
            stale: {
              preCondition: { condition: '' },
              postCondition: { condition: '' },
            },
          },
        } as IStatement,
      };

      const imported = service.importFormula(formula);
      const inner = (imported.statement as RootStatement)
        .statement as IStatement;
      const verifiers = inner.verifiers ?? {};

      expect(verifiers['func']).toEqual({ proven: true });
      expect(verifiers['energy'].preCondition).toBeUndefined();
      expect(verifiers['energy'].postCondition?.condition).toBe('x > 1');
      // Neither a condition nor a result: nothing left worth an entry.
      expect(verifiers['stale']).toBeUndefined();
    });

    it('exportFormula writes the local statement\'s verifiers, including proven/status, under `verifiers`', () => {
      const rootStatement = new RootStatement(
        'root',
        { condition: 'true' },
        { condition: 'true' },
        undefined,
      );
      rootStatement.verifiers = {
        energy: {
          preCondition: { condition: 'true' },
          postCondition: { condition: 'true' },
          proven: false,
          status: 'timed out',
        },
      };
      const local = new LocalCBCFormula('f', rootStatement);

      const exported = service.exportFormula(local);

      expect((exported as unknown as { verifiers: unknown }).verifiers)
        .toEqual(rootStatement.verifiers);
      expect(
        Object.prototype.hasOwnProperty.call(exported, 'verifierConditions'),
      ).toBe(false);
    });
  });
});
