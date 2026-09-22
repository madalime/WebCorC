import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StatementComponent } from './statement.component';
import { provideAnimations } from '@angular/platform-browser/animations';
import { SimpleStatementComponent } from '../simple-statement/simple-statement.component';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TreeService } from '../../../../services/tree/tree.service';
import { GlobalSettingsService } from '../../../../services/global-settings.service';
import { NetworkJobService } from '../../../../services/tree/network/network-job.service';
import { AbstractStatementNode } from '../../../../types/statements/nodes/abstract-statement-node';
import { Verifier } from '../../../../types/Verifier';

describe('StatementComponent', () => {
  let component: StatementComponent;
  let fixture: ComponentFixture<StatementComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatementComponent],
      providers: [provideHttpClient(),provideAnimations()]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StatementComponent);
    component = fixture.componentInstance;
    component.refinement = TestBed.createComponent(SimpleStatementComponent).componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * These two describe blocks unit-test plain methods of {@link StatementComponent} directly
 * (constructed via `TestBed.runInInjectionContext`, never rendered) rather than going through
 * `TestBed.createComponent` + `fixture.detectChanges()` as the block above does: rendering this
 * component is a pre-existing, unrelated `NG0919` failure in this checkout (see
 * `docs/agents/test-environment.md`), which the shared `beforeEach` above already hits for the
 * one "should create" spec. `verifyStatement()` and `verifierStatusText()` do not touch the
 * template, so they can be exercised on a plain instance without triggering it.
 */
describe('StatementComponent.verifyStatement (ticket 12 fix C)', () => {
  let verifyComponent: StatementComponent;
  let treeServiceSpy: jasmine.SpyObj<TreeService>;
  let networkJobServiceSpy: jasmine.SpyObj<NetworkJobService>;
  let globalSettingsService: GlobalSettingsService;

  beforeEach(() => {
    treeServiceSpy = jasmine.createSpyObj(
      'TreeService',
      ['beginRun', 'finalizeStatements', 'createTempFormulaFromNode'],
      { urn: 'urn' },
    );
    networkJobServiceSpy = jasmine.createSpyObj('NetworkJobService', ['verifyStatement']);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TreeService, useValue: treeServiceSpy },
        { provide: NetworkJobService, useValue: networkJobServiceSpy },
      ],
    });
    globalSettingsService = TestBed.inject(GlobalSettingsService);
    globalSettingsService.isVerifying = false;
    verifyComponent = TestBed.runInInjectionContext(() => new StatementComponent());
    verifyComponent._node = {} as AbstractStatementNode;
  });

  it('sets GlobalSettingsService.isVerifying and calls treeService.beginRun, alongside the local signal', () => {
    verifyComponent.verifyStatement();

    expect(verifyComponent.isVerifying()).toBeTrue();
    expect(globalSettingsService.isVerifying).toBeTrue();
    expect(treeServiceSpy.beginRun).toHaveBeenCalled();
  });

  it('does nothing (no beginRun) when a verification is already in progress locally', () => {
    verifyComponent.isVerifying.set(true);

    verifyComponent.verifyStatement();

    expect(treeServiceSpy.beginRun).not.toHaveBeenCalled();
  });
});

describe('StatementComponent.verifierStatusText (ticket 12 item 6)', () => {
  let statusComponent: StatementComponent;

  const mockVerifier: Verifier = {
    id: 'mock',
    label: 'Mock',
    enabled: true,
    statusPlaceholder: 'Pending',
    settings: [],
    variables: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    statusComponent = TestBed.runInInjectionContext(() => new StatementComponent());
  });

  it("falls back to the Catalog's statusPlaceholder when no status has been reported", () => {
    statusComponent._node = {
      statement: { verifiers: {} },
    } as unknown as AbstractStatementNode;

    expect(statusComponent.verifierStatusText(mockVerifier)).toBe('Pending');
  });

  it('returns the reported status text once one exists', () => {
    statusComponent._node = {
      statement: { verifiers: { mock: { proven: true, status: 'All good' } } },
    } as unknown as AbstractStatementNode;

    expect(statusComponent.verifierStatusText(mockVerifier)).toBe('All good');
  });

  it('is undefined, never a derived "Passed"/"Failed", when status and placeholder are both absent', () => {
    statusComponent._node = {
      statement: { verifiers: { mock: { proven: false } } },
    } as unknown as AbstractStatementNode;
    const noPlaceholder: Verifier = { ...mockVerifier, statusPlaceholder: undefined };

    expect(statusComponent.verifierStatusText(noPlaceholder)).toBeUndefined();
  });
});
