import { TestBed } from "@angular/core/testing";
import { Subject } from "rxjs";

import { ProjectService } from "../project/project.service";
import { VerifierService } from "./verifier.service";

describe("VerifierService", () => {
  let service: VerifierService;

  beforeEach(() => {
    const projectServiceStub: Partial<ProjectService> = {
      getVerifierOverrides: () => null,
      saveVerifierOverrides: () => undefined,
      verifierOverridesLoaded: new Subject<void>(),
    };
    TestBed.configureTestingModule({
      providers: [{ provide: ProjectService, useValue: projectServiceStub }],
    });
    service = TestBed.inject(VerifierService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("seeds setting inputs from their default on load", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'withDefault', label: 'a', type: 'text', required: true, default: 'd' },
        { id: 'withoutDefault', label: 'b', type: 'text' },
      ], variables: [] },
    ]);

    const settings = service.verifiers()[0].settings;
    expect(settings[0].input).toBe('d');
    expect(settings[1].input).toBe('');
  });

  it("persists a setting input through updateSetting", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 's', label: 's', type: 'text' },
      ], variables: [] },
    ]);

    service.updateSetting('v', 's', 'typed');

    expect(service.verifiers()[0].settings[0].input).toBe('typed');
  });

  it("reflects setEnabled in the merged verifier list", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [], variables: [] },
    ]);

    service.setEnabled('v', false);

    expect(service.verifiers()[0].enabled).toBeFalse();
  });

  it("ignores empty required settings of disabled verifiers for validity", () => {
    service.loadBase([
      { id: 'on', label: 'On', enabled: true, status_placeholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: 'ok' },
      ], variables: [] },
      { id: 'off', label: 'Off', enabled: false, status_placeholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when an enabled verifier has an empty required setting", () => {
    service.loadBase([
      { id: 'on', label: 'On', enabled: true, status_placeholder: '', settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeFalse();
  });

  it("treats a numeric setting within range and on the step grid as valid", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 10 } },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '2.5');

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when a numeric setting is out of range", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 0, max: 10 } },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '20');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("is invalid when a numeric setting violates its step (non-integer with default step 1)", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number' },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'n', '4.2');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("persists a boolean setting input through updateSetting and stays valid", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'flag', label: 'flag', type: 'boolean', default: false },
      ], variables: [] },
    ]);

    service.updateSetting('v', 'flag', true);

    expect(service.verifiers()[0].settings[0].input).toBeTrue();
    expect(service.verifiersValid()).toBeTrue();
  });

  it("treats an empty optional numeric setting as valid", () => {
    service.loadBase([
      { id: 'v', label: 'V', enabled: true, status_placeholder: '', settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 1, max: 10 } },
      ], variables: [] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });
});
