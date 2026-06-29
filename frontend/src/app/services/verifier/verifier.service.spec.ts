import { TestBed } from "@angular/core/testing";

import { ProjectService } from "../project/project.service";
import { VerifierService } from "./verifier.service";

describe("VerifierService", () => {
  let service: VerifierService;

  beforeEach(() => {
    const projectServiceStub: Partial<ProjectService> = {
      getVerifiers: () => null,
      saveVerifiers: () => undefined,
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
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 'withDefault', label: 'a', type: 'text', required: true, default: 'd' },
        { id: 'withoutDefault', label: 'b', type: 'text' },
      ] },
    ]);

    const settings = service.verifiers()[0].settings ?? [];
    expect(settings[0].input).toBe('d');
    expect(settings[1].input).toBe('');
  });

  it("persists a setting input through updateSetting", () => {
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 's', label: 's', type: 'text' },
      ] },
    ]);

    service.updateSetting('v', 's', 'typed');

    expect(service.verifiers()[0].settings?.[0].input).toBe('typed');
  });

  it("ignores empty required settings of disabled verifiers for validity", () => {
    service.load([
      { id: 'on', label: 'On', enabled: true, settings: [
        { id: 's', label: 's', type: 'text', required: true, default: 'ok' },
      ] },
      { id: 'off', label: 'Off', enabled: false, settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when an enabled verifier has an empty required setting", () => {
    service.load([
      { id: 'on', label: 'On', enabled: true, settings: [
        { id: 's', label: 's', type: 'text', required: true, default: '' },
      ] },
    ]);

    expect(service.verifiersValid()).toBeFalse();
  });

  it("treats a numeric setting within range and on the step grid as valid", () => {
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 10 } },
      ] },
    ]);

    service.updateSetting('v', 'n', '2.5');

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when a numeric setting is out of range", () => {
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 0, max: 10 } },
      ] },
    ]);

    service.updateSetting('v', 'n', '20');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("is invalid when a numeric setting violates its step (non-integer with default step 1)", () => {
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number' },
      ] },
    ]);

    service.updateSetting('v', 'n', '4.2');

    expect(service.verifiersValid()).toBeFalse();
  });

  it("treats an empty optional numeric setting as valid", () => {
    service.load([
      { id: 'v', label: 'V', enabled: true, settings: [
        { id: 'n', label: 'n', type: 'text', valueType: 'number', range: { min: 1, max: 10 } },
      ] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });
});
