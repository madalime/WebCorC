import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { VerifierService } from '../../../services/verifier/verifier.service';
import { TreeService } from '../../../services/tree/tree.service';
import { ProjectService } from '../../../services/project/project.service';
import { Verifier } from '../../../types/Verifier';
import { IVerifiers } from '../../../types/statements/abstract-statement';
import { RootStatement } from '../../../types/statements/root-statement';
import { Condition } from '../../../types/condition/condition';
import { LocalCBCFormula } from '../../../types/CBCFormula';
import { VerifierManagerComponent } from './verifier-manager.component';

describe('VerifierManagerComponent', () => {
  const catalogUrl = environment.apiUrl + '/editor/verifiers';

  let component: VerifierManagerComponent;
  let fixture: ComponentFixture<VerifierManagerComponent>;
  let httpTesting: HttpTestingController;

  /** The panel's status line about the Catalog fetch, or `null` once it is gone. */
  function statusText(): string | null {
    fixture.detectChanges();
    const element: HTMLElement | null = fixture.nativeElement.querySelector('.catalog-status');
    return element ? element.textContent!.replace(/\s+/g, ' ').trim() : null;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VerifierManagerComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    })
    .compileComponents();

    httpTesting = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(VerifierManagerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create', () => {
    httpTesting.expectOne(catalogUrl).flush({ verifiers: [] });
    expect(component).toBeTruthy();
  });

  it('says the Catalog is being fetched until it arrives', () => {
    expect(statusText()).toBe('Fetching Verifier Catalog…');

    httpTesting.expectOne(catalogUrl).flush({ verifiers: [] });

    expect(statusText()).toBeNull();
  });

  it('counts the attempts while the backend is not reachable', fakeAsync(() => {
    httpTesting.expectOne(catalogUrl).error(new ProgressEvent('error'));

    expect(statusText()).toBe(
      `Fetching Verifier Catalog… Backend not reachable yet, attempt 2 of ${VerifierService.CATALOG_FETCH_ATTEMPTS}`,
    );

    tick(VerifierService.CATALOG_FETCH_DELAY_MS);
    httpTesting.expectOne(catalogUrl).flush({ verifiers: [] });

    expect(statusText()).toBeNull();
  }));

  it('drops the status line once the fetch is given up on', () => {
    httpTesting.expectOne(catalogUrl).flush('bug', { status: 500, statusText: 'Internal Server Error' });

    expect(statusText()).toBeNull();
  });

  describe("highlights each Verifier by its result on the open diagram's root", () => {
    const verifier = (id: string, label: string): Verifier => ({
      id, label, enabled: true, toggleable: true,
      settings: [{ id: 'level', label: 'Level', type: 'text' }], variables: [],
    });
    const catalog: Verifier[] = [
      { id: 'func', label: 'Functional correctness', enabled: true, toggleable: false, settings: [], variables: [] },
      verifier('energy', 'Energy'),
      verifier('security', 'Security'),
    ];

    function openDiagram(rootEntries: IVerifiers): void {
      const root = new RootStatement('root', new Condition('true'), new Condition('true'), undefined);
      root.verifiers = rootEntries;
      TestBed.inject(TreeService).setFormula(new LocalCBCFormula('f', root), 'urn');
    }

    /** The classes of the accordion panel showing the Verifier with this label. */
    function panelClasses(label: string): string[] {
      fixture.detectChanges();
      const panels: HTMLElement[] = Array.from(fixture.nativeElement.querySelectorAll('p-accordion-panel'));
      const panel = panels.find((candidate) => candidate.textContent!.includes(label))!;
      return Array.from(panel.classList);
    }

    const resultClasses = (label: string) =>
      panelClasses(label).filter((cls) => cls.startsWith('verifier-result--'));

    beforeEach(() => {
      httpTesting.expectOne(catalogUrl).flush({ verifiers: catalog });
    });

    it('shows the grey no-result border with no diagram open', () => {
      expect(resultClasses('Functional correctness')).toEqual(['verifier-result--none']);
      expect(resultClasses('Energy')).toEqual(['verifier-result--none']);
    });

    it("reads the root's entries, keeps PrimeNG's own panel class, and follows a diagram switch", () => {
      openDiagram({
        func: { proven: true },
        energy: { proven: false, status: 'too hungry' },
        security: { proven: false, disabled: true },
      });

      expect(resultClasses('Functional correctness')).toEqual(['verifier-result--proven']);
      expect(resultClasses('Energy')).toEqual(['verifier-result--failed']);
      expect(resultClasses('Security')).toEqual(['verifier-result--none']);
      expect(panelClasses('Energy')).toContain('p-accordionpanel');

      openDiagram({ func: { proven: false } });

      expect(resultClasses('Functional correctness')).toEqual(['verifier-result--failed']);
      expect(resultClasses('Energy')).toEqual(['verifier-result--none']);
    });

    it('dims, but keeps, the result of a Verifier switched off now, a missing result included', () => {
      openDiagram({ func: { proven: true }, energy: { proven: false } });
      // Keep the override out of sessionStorage, where it would outlive this spec.
      spyOn(TestBed.inject(ProjectService), 'saveVerifierOverrides');

      component.onToggle(catalog[1], false);
      component.onToggle(catalog[2], false);

      expect(resultClasses('Energy')).toEqual(['verifier-result--failed', 'verifier-result--off']);
      expect(resultClasses('Security')).toEqual(['verifier-result--none', 'verifier-result--off']);
      expect(resultClasses('Functional correctness')).toEqual(['verifier-result--proven']);
    });

    it('turns only the Verifier whose setting changed stale', () => {
      openDiagram({ func: { proven: true }, energy: { proven: true }, security: { proven: false } });
      // Keep the override out of sessionStorage, where it would outlive this spec.
      spyOn(TestBed.inject(ProjectService), 'saveVerifierOverrides');

      TestBed.inject(VerifierService).updateSetting('energy', 'level', '3');

      expect(resultClasses('Energy')).toEqual(['verifier-result--stale']);
      expect(resultClasses('Security')).toEqual(['verifier-result--failed']);
      expect(resultClasses('Functional correctness')).toEqual(['verifier-result--proven']);
    });
  });
});
