import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { VerifierService } from '../../../services/verifier/verifier.service';
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
});
