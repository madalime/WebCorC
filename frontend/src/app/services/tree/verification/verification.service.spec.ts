import { TestBed } from '@angular/core/testing';

import { VerificationService } from './verification.service';
import { ConsoleLogGroup, ConsoleInfoLine } from '../../console/log';
import { FUNCTIONAL_VERIFIER_ID } from '../../../types/Verifier';
import { TreeService } from '../tree.service';
import { ProjectService } from '../../project/project.service';
import { VerifierService } from '../../verifier/verifier.service';
import { IAbstractStatement } from '../../../types/statements/abstract-statement';
import { LocalCBCFormula } from '../../../types/CBCFormula';

describe('VerificationService', () => {
  let service: VerificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VerificationService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('verifyInfo', () => {
    it('logs a functional verification-started message and starts loading', () => {
      const group = new ConsoleLogGroup();
      service.verifyInfo(group, {
        type: 'log',
        verifier: FUNCTIONAL_VERIFIER_ID,
        message: 'verification started',
      });
      expect(group.lines.length).toBe(1);
      expect((group.lines[0] as ConsoleInfoLine).message).toContain('started');
    });

    it('attributes a log message to the Verifier that produced it', () => {
      const group = new ConsoleLogGroup();
      service.verifyInfo(group, {
        type: 'log',
        verifier: 'mock',
        message: 'Checking statement 1',
      });
      const line = group.lines[0] as ConsoleInfoLine;
      expect(line.message).toContain('mock');
      expect(line.message).toContain('Checking statement 1');
    });

    it('prints an orchestration log line without a [name] prefix when verifier is absent', () => {
      const group = new ConsoleLogGroup();
      service.verifyInfo(group, {
        type: 'log',
        message: 'calling mock',
      });
      const line = group.lines[0] as ConsoleInfoLine;
      expect(line.message).toBe('calling mock');
      expect(line.message).not.toContain('[');
    });

    it('surfaces a per-Verifier done signal, pass or fail, before the final complete', () => {
      const group = new ConsoleLogGroup();
      service.verifyInfo(group, { type: 'done', verifier: 'mock', proven: false });
      const line = group.lines[0] as ConsoleInfoLine;
      expect(line.message).toContain('mock');
      expect(line.message.toLowerCase()).toContain('fail');
    });

    it('does not add a console line for the terminal complete signal itself', () => {
      const group = new ConsoleLogGroup();
      service.verifyInfo(group, { type: 'complete' });
      expect(group.lines.length).toBe(0);
    });
  });

  describe('next() per-Verifier result propagation', () => {
    let treeServiceSpy: jasmine.SpyObj<TreeService>;
    let projectServiceSpy: jasmine.SpyObj<ProjectService>;
    let verifierServiceSpy: jasmine.SpyObj<VerifierService>;

    beforeEach(() => {
      treeServiceSpy = jasmine.createSpyObj('TreeService', [
        'getStatementsFromFormula',
        'reapplyRunChanges',
      ]);
      projectServiceSpy = jasmine.createSpyObj('ProjectService', [
        'getFileContent',
        'syncLocalFileContent',
      ]);
      verifierServiceSpy = jasmine.createSpyObj('VerifierService', [], {
        effectiveEnabledNonFunctionalVerifierIds: ['mock'],
      });

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TreeService, useValue: treeServiceSpy },
          { provide: ProjectService, useValue: projectServiceSpy },
          { provide: VerifierService, useValue: verifierServiceSpy },
        ],
      });
      service = TestBed.inject(VerificationService);
    });

    it("copies each statement's verifiers map onto the live tree, not only isProven", async () => {
      const currentStatement = {
        id: '1',
        isProven: false,
        nodeState: 'unverified',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const resultStatement = {
        id: '1',
        isProven: true,
        verifiers: { mock: { proven: true, status: 'ok' } },
      } as unknown as IAbstractStatement;

      const currentFormula = {
        statement: { type: 'STATEMENT' },
      } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [currentStatement],
        [resultStatement],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'STATEMENT' },
        isProven: true,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(currentStatement.verifiers).toEqual({
        mock: { proven: true, status: 'ok' },
      });
    });

    it('sets failed-non-functional when a non-functional Verifier, not func, is what failed', async () => {
      const currentStatement = {
        id: '1',
        isProven: false,
        nodeState: 'unverified',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const resultStatement = {
        id: '1',
        isProven: false,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true }, mock: { proven: false } },
      } as unknown as IAbstractStatement;

      const currentFormula = {
        statement: { type: 'STATEMENT' },
      } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [currentStatement],
        [resultStatement],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'STATEMENT' },
        isProven: false,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(currentStatement.nodeState).toBe('failed-non-functional');
    });

    it('after a failed all-run then a passing functional-only run, the root and every statement are verified-functional with no repair block', async () => {
      const rootStatement = {
        id: 'root',
        isProven: false,
        nodeState: 'failed-non-functional',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const childStatement = {
        id: 'child',
        isProven: false,
        nodeState: 'failed-non-functional',
        verifiers: {},
      } as unknown as IAbstractStatement;

      // Functional-only run: every non-functional entry is `disabled`, func passed everywhere.
      const resultRoot = {
        id: 'root',
        isProven: true,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true }, mock: { proven: false, disabled: true } },
      } as unknown as IAbstractStatement;
      const resultChild = {
        id: 'child',
        isProven: true,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true }, mock: { proven: false, disabled: true } },
      } as unknown as IAbstractStatement;

      const currentFormula = { statement: { type: 'ROOT' } } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [rootStatement, childStatement],
        [resultRoot, resultChild],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'ROOT' },
        isProven: true,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(rootStatement.isProven).toBe(true);
      expect(rootStatement.nodeState).toBe('settings-changed');
      expect(childStatement.isProven).toBe(true);
      expect(childStatement.nodeState).toBe('settings-changed');
    });

    it('reapplies mid-run changes via TreeService.reapplyRunChanges once the result lands', async () => {
      const currentStatement = {
        id: '1',
        isProven: false,
        nodeState: 'unverified',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const resultStatement = {
        id: '1',
        isProven: true,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true }, mock: { proven: true } },
      } as unknown as IAbstractStatement;

      const currentFormula = { statement: { type: 'STATEMENT' } } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [currentStatement],
        [resultStatement],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'STATEMENT' },
        isProven: true,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(treeServiceSpy.reapplyRunChanges).toHaveBeenCalledWith([currentStatement]);
    });

    it('a statement edited during the run stays unverified after the result lands', async () => {
      treeServiceSpy.reapplyRunChanges.and.callFake((statements: IAbstractStatement[]) => {
        for (const statement of statements) {
          if (statement.id === '1') {
            statement.isProven = false;
            statement.nodeState = 'unverified';
          }
        }
      });

      const currentStatement = {
        id: '1',
        isProven: false,
        nodeState: 'unverified',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const resultStatement = {
        id: '1',
        isProven: true,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true } },
      } as unknown as IAbstractStatement;

      const currentFormula = { statement: { type: 'STATEMENT' } } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [currentStatement],
        [resultStatement],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'STATEMENT' },
        isProven: true,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(currentStatement.nodeState).toBe('unverified');
      expect(currentStatement.isProven).toBe(false);
    });

    it('a setting value changed during the run turns a verified-all result into settings-changed', async () => {
      treeServiceSpy.reapplyRunChanges.and.callFake((statements: IAbstractStatement[]) => {
        for (const statement of statements) {
          if (statement.nodeState === 'verified-all') {
            statement.nodeState = 'settings-changed';
          }
        }
      });

      const currentStatement = {
        id: '1',
        isProven: false,
        nodeState: 'unverified',
        verifiers: {},
      } as unknown as IAbstractStatement;
      const resultStatement = {
        id: '1',
        isProven: true,
        verifiers: { [FUNCTIONAL_VERIFIER_ID]: { proven: true }, mock: { proven: true } },
      } as unknown as IAbstractStatement;

      const currentFormula = { statement: { type: 'STATEMENT' } } as unknown as LocalCBCFormula;
      projectServiceSpy.getFileContent.and.resolveTo(currentFormula);
      treeServiceSpy.getStatementsFromFormula.and.returnValues(
        [currentStatement],
        [resultStatement],
      );

      const group = new ConsoleLogGroup();
      const formula = {
        statement: { type: 'STATEMENT' },
        isProven: true,
        name: 'f',
      } as unknown as LocalCBCFormula;

      await service.next(group, formula, 'urn');

      expect(currentStatement.nodeState).toBe('settings-changed');
    });
  });
});
