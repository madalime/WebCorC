import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";

import { environment } from "../../../environments/environment";
import { Verifier, VerifierOverrides } from "../../types/Verifier";
import { ConsoleService } from "../console/console.service";
import { ConsoleErrorLine, ConsoleLogLine, isError, isGroup } from "../console/log";
import { ProjectService } from "../project/project.service";
import { VerifierService } from "./verifier.service";

describe("VerifierService", () => {
  const catalogUrl = environment.apiUrl + "/editor/verifiers";

  /** The Functional Verifier exactly as the backend serves it and as the local fallback builds it. */
  const functionalVerifier: Verifier = {
    id: 'func', label: 'Functional correctness', enabled: true, toggleable: false, settings: [], variables: [],
  };

  let service: VerifierService;
  let httpTesting: HttpTestingController;
  let consoleService: ConsoleService;
  let projectServiceStub: Partial<ProjectService>;
  let overridesLoaded: Subject<void>;

  /**
   * Answer the Catalog request issued at construction with the given entries — the seam
   * through which every test loads its Catalog, exactly as the backend would deliver it.
   */
  function loadCatalog(verifiers: Verifier[]): void {
    httpTesting.expectOne(catalogUrl).flush({ verifiers });
  }

  beforeEach(() => {
    overridesLoaded = new Subject<void>();
    projectServiceStub = {
      getVerifierOverrides: () => null,
      saveVerifierOverrides: () => undefined,
      verifierOverridesLoaded: overridesLoaded,
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ProjectService, useValue: projectServiceStub },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    consoleService = TestBed.inject(ConsoleService);
    service = TestBed.inject(VerifierService);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it("should be created", () => {
    loadCatalog([]);
    expect(service).toBeTruthy();
  });

  describe("Catalog fetch", () => {
    it("fetches the Catalog once at construction with GET", () => {
      const request = httpTesting.expectOne(catalogUrl);
      expect(request.request.method).toBe("GET");
      request.flush({ verifiers: [] });

      httpTesting.expectNone(catalogUrl);
    });

    it("shows the Functional Verifier until the Catalog arrives", () => {
      expect(service.verifiers().map((verifier) => verifier.id)).toEqual(['func']);
      loadCatalog([]);
    });

    it("shows the fetched Catalog", () => {
      loadCatalog([functionalVerifier]);

      expect(service.verifiers()).toEqual([functionalVerifier]);
    });

    it("applies the existing ranking to the fetched Catalog", () => {
      loadCatalog([
        { id: 'plain', label: 'Nothing', enabled: true, settings: [], variables: [] },
        { id: 'text', label: 'Text', enabled: true, statusPlaceholder: 'pending', settings: [], variables: [] },
        { id: 'settings', label: 'Settings', enabled: true, settings: [
          { id: 's', label: 's', type: 'text' },
        ], variables: [] },
        { id: 'vars', label: 'Variables', enabled: true, settings: [], variables: [
          { id: 'x', name: 'x', type: 'int' },
        ] },
        functionalVerifier,
      ]);

      expect(service.verifiers().map((verifier) => verifier.id)).toEqual([
        'func', 'vars', 'settings', 'text', 'plain',
      ]);
    });

    it("falls back to exactly the Functional Verifier and logs one console line when the fetch fails", () => {
      httpTesting.expectOne(catalogUrl).flush("backend down", { status: 503, statusText: "Service Unavailable" });

      expect(service.verifiers()).toEqual([functionalVerifier]);
      expect(consoleService.numberOfLogs).toBe(1);
      const line = consoleService.logs[0];
      expect(isGroup(line)).toBeFalse();
      expect(isError(line as ConsoleLogLine)).toBeTrue();
      expect((line as ConsoleErrorLine).action).toContain("Verifier Catalog");
    });

    it("falls back to the Functional Verifier on a network error", () => {
      httpTesting.expectOne(catalogUrl).error(new ProgressEvent("error"));

      expect(service.verifiers().map((verifier) => verifier.id)).toEqual(['func']);
      expect(consoleService.numberOfLogs).toBe(1);
    });

    it("logs nothing when the Catalog is fetched successfully", () => {
      loadCatalog([]);

      expect(consoleService.numberOfLogs).toBe(0);
    });
  });

  describe("Overrides over the fetched Catalog", () => {
    it("merges Overrides loaded with the project over the fetched Catalog", () => {
      loadCatalog([
        { id: 'v', label: 'V', enabled: true, settings: [
          { id: 's', label: 's', type: 'text', default: 'd' },
        ], variables: [] },
      ]);

      const persisted: VerifierOverrides = { v: { enabled: false, settings: { s: 'saved' } } };
      projectServiceStub.getVerifierOverrides = () => persisted;
      overridesLoaded.next();

      expect(service.verifiers()[0].enabled).toBeFalse();
      expect(service.verifiers()[0].settings[0].input).toBe('saved');
    });

    it("keeps Overrides made before the Catalog arrived", () => {
      service.setEnabled('v', false);
      loadCatalog([
        { id: 'v', label: 'V', enabled: true, settings: [], variables: [] },
      ]);

      expect(service.verifiers()[0].enabled).toBeFalse();
    });
  });

  it("seeds setting inputs from their default on load", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'withDefault', label: 'a', type: 'text', required: true, default: 'd' },
        { id: 'withoutDefault', label: 'b', type: 'text' },
      ], variables: [] },
    ]);

    const settings = service.verifiers()[0].settings;
    expect(settings[0].input).toBe('d');
    expect(settings[1].input).toBe('');
  });

  it("persists a setting input through updateSetting", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 's', label: 's', type: 'text' },
      ], variables: [] },
    ]);

    service.updateSetting('v', 's', 'typed');

    expect(service.verifiers()[0].settings[0].input).toBe('typed');
  });

  it("reflects setEnabled in the merged verifier list", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [], variables: [] },
    ]);

    service.setEnabled('v', false);

    expect(service.verifiers()[0].enabled).toBeFalse();
  });

  it("ignores empty required settings of disabled verifiers for validity", () => {
    loadCatalog([
      { id: 'on', label: 'On', enabled: true, statusPlaceholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: 'ok' },
      ], variables: [] },
      { id: 'off', label: 'Off', enabled: false, statusPlaceholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when an enabled verifier has an empty required setting", () => {
    loadCatalog([
      { id: 'on', label: 'On', enabled: true, statusPlaceholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeFalse();
  });

  it("treats a numeric setting within range and on the step grid as valid", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 10 } },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '2.5');

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when a numeric setting is out of range", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 0, max: 10 } },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '20');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("is invalid when a numeric setting violates its step (non-integer with default step 1)", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number' },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '4.2');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("persists a boolean setting input through updateSetting and stays valid", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'flag', label: 'flag', type: 'boolean', default: false },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'flag', true);

    expect(service.verifiers()[0].settings[0].input).toBeTrue();
    expect(service.verifiersValid()).toBeTrue();
  });

  it("treats an empty optional numeric setting as valid", () => {
    loadCatalog([
      { id: 'v', label: 'V', enabled: true, statusPlaceholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 1, max: 10 } },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });
});
