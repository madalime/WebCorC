import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';

import { VerificationService } from './verification.service';
import { ConsoleLogGroup, ConsoleInfoLine } from '../../console/log';
import { FUNCTIONAL_VERIFIER_ID, Verifier } from '../../../types/Verifier';
import { TreeService } from '../tree.service';
import { ProjectService } from '../../project/project.service';
import { VerifierService } from '../../verifier/verifier.service';
import { IAbstractStatement, IVerifiers, nodeStateFor } from '../../../types/statements/abstract-statement';
import { LocalCBCFormula } from '../../../types/CBCFormula';
import { environment } from '../../../../environments/environment';
import { Condition } from '../../../types/condition/condition';
import { Statement } from '../../../types/statements/simple-statement';
import { CompositionStatement } from '../../../types/statements/composition-statement';
import { RootStatement } from '../../../types/statements/root-statement';

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
        'reapplyRunChanges',
        'deriveNodeState',
      ]);
      // No settings stamps in play here: the plain derivation over the one enabled Verifier.
      treeServiceSpy.deriveNodeState.and.callFake((verifiers) => nodeStateFor(verifiers, ['mock']));
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

  });

  describe('settings stamp on a landing result (real TreeService)', () => {
    const catalogUrl = environment.apiUrl + '/editor/verifiers';
    const functionalVerifier: Verifier = {
      id: 'func', label: 'Functional correctness', enabled: true, toggleable: false, settings: [], variables: [],
    };
    const mockVerifier: Verifier = {
      id: 'mock', label: 'Mock', enabled: true, toggleable: true,
      settings: [{ id: 'threshold', label: 'Threshold', type: 'text' }],
      variables: [],
    };
    const c = () => new Condition('true');

    let treeService: TreeService;
    let verifierService: VerifierService;
    let now: jasmine.Spy<() => number>;

    /** root -> comp -> (first, second), every entry a proven result carrying `stamp`. */
    function tree(stamp?: number) {
      const entries = (): IVerifiers => ({
        func: { proven: true },
        mock: stamp === undefined ? { proven: true } : { proven: true, settingsUpdatedAt: stamp },
      });
      const first = new Statement('first', c(), c(), 'x = 1;');
      first.verifiers = entries();
      const second = new Statement('second', c(), c(), 'x = 2;');
      second.verifiers = entries();
      const comp = new CompositionStatement('comp', c(), c(), new Condition('mid'), first, second);
      comp.verifiers = entries();
      const root = new RootStatement('root', c(), c(), comp);
      root.verifiers = entries();
      return { root, comp, first, second };
    }

    function load() {
      const loaded = tree();
      treeService.setFormula(new LocalCBCFormula('f', loaded.root), 'urn');
      return loaded;
    }

    function changeSettingAt(stamp: number) {
      now.and.returnValue(stamp);
      verifierService.updateSetting('mock', 'threshold', String(stamp));
      // Statement ids are derived from Date.now() too.
      now.and.callThrough();
    }

    beforeEach(() => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ProjectService,
            useValue: {
              getVerifierOverrides: () => null,
              saveVerifierOverrides: () => undefined,
              verifierOverridesLoaded: new Subject<void>(),
              getFileContent: () => Promise.resolve(treeService.rootFormula),
              syncLocalFileContent: () => undefined,
            },
          },
        ],
      });
      verifierService = TestBed.inject(VerifierService);
      TestBed.inject(HttpTestingController).expectOne(catalogUrl).flush({ verifiers: [functionalVerifier, mockVerifier] });
      treeService = TestBed.inject(TreeService);
      service = TestBed.inject(VerificationService);
      now = spyOn(Date, 'now').and.callThrough();
    });

    it('a subtree verify refreshes only the subtree: the Root, the ancestors and statements outside stay stale', async () => {
      const { root, comp, first, second } = load();
      changeSettingAt(7);

      const result = tree(7).second;
      await service.nextStatement(
        new ConsoleLogGroup(),
        new LocalCBCFormula('second', new RootStatement('second', c(), c(), result)),
        treeService.findStatementNodeById(second.id)!,
        'urn',
      );

      expect(treeService.verifierResult(second, 'mock')).toBe('proven');
      expect(second.nodeState).toBe('verified-all');
      for (const outside of [root, comp, first]) {
        expect(treeService.verifierResult(outside, 'mock')).withContext(outside.name).toBe('stale');
        expect(outside.nodeState).withContext(outside.name).toBe('settings-changed');
      }
    });

    it('a whole-tree verify makes the whole diagram fresh', async () => {
      const { root, comp, first, second } = load();
      changeSettingAt(7);

      await service.next(new ConsoleLogGroup(), new LocalCBCFormula('f', tree(7).root), 'urn');

      for (const statement of [root, comp, first, second]) {
        expect(treeService.verifierResult(statement, 'mock')).withContext(statement.name).toBe('proven');
        expect(statement.nodeState).withContext(statement.name).toBe('verified-all');
      }
    });

    it('a result stamped with the settings the run started under shows stale after a mid-run change', async () => {
      const { root, second } = load();
      changeSettingAt(7);
      changeSettingAt(8);

      await service.next(new ConsoleLogGroup(), new LocalCBCFormula('f', tree(7).root), 'urn');

      expect(treeService.verifierResult(root, 'mock')).toBe('stale');
      expect(treeService.verifierResult(second, 'mock')).toBe('stale');
      expect(second.nodeState).toBe('settings-changed');
    });
  });
});
