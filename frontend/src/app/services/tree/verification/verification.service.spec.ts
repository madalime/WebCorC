import { TestBed } from '@angular/core/testing';

import { VerificationService } from './verification.service';
import { ConsoleLogGroup, ConsoleInfoLine } from '../../console/log';
import { FUNCTIONAL_VERIFIER_ID } from '../../../types/Verifier';
import { TreeService } from '../tree.service';
import { ProjectService } from '../../project/project.service';
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

    beforeEach(() => {
      treeServiceSpy = jasmine.createSpyObj('TreeService', [
        'getStatementsFromFormula',
      ]);
      projectServiceSpy = jasmine.createSpyObj('ProjectService', [
        'getFileContent',
        'syncLocalFileContent',
      ]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: TreeService, useValue: treeServiceSpy },
          { provide: ProjectService, useValue: projectServiceSpy },
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

      await service.next(group, formula, 'urn', false);

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

      await service.next(group, formula, 'urn', false);

      expect(currentStatement.nodeState).toBe('failed-non-functional');
    });
  });
});
