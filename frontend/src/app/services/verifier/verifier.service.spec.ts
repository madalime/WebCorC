import { TestBed } from "@angular/core/testing";

import { VerifierService } from "./verifier.service";

describe("VerifierService", () => {
  let service: VerifierService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VerifierService);
  });

  it("should be created", () => {
    expect(service).toBeTruthy();
  });

  it("seeds setting inputs from their default on load", () => {
    service.load([
      { value: 'v', label: 'V', enabled: true, settings: [
        { value: 'withDefault', label: 'a', type: 'text', required: true, default: 'd' },
        { value: 'withoutDefault', label: 'b', type: 'text' },
      ] },
    ]);

    const settings = service.verifiers()[0].settings ?? [];
    expect(settings[0].input).toBe('d');
    expect(settings[1].input).toBe('');
  });

  it("persists a setting input through updateSetting", () => {
    service.load([
      { value: 'v', label: 'V', enabled: true, settings: [
        { value: 's', label: 's', type: 'text' },
      ] },
    ]);

    service.updateSetting('v', 's', 'typed');

    expect(service.verifiers()[0].settings?.[0].input).toBe('typed');
  });

  it("ignores empty required settings of disabled verifiers for validity", () => {
    service.load([
      { value: 'on', label: 'On', enabled: true, settings: [
        { value: 's', label: 's', type: 'text', required: true, default: 'ok' },
      ] },
      { value: 'off', label: 'Off', enabled: false, settings: [
        { value: 's', label: 's', type: 'text', required: true, default: '' },
      ] },
    ]);

    expect(service.verifiersValid()).toBeTrue();
  });

  it("is invalid when an enabled verifier has an empty required setting", () => {
    service.load([
      { value: 'on', label: 'On', enabled: true, settings: [
        { value: 's', label: 's', type: 'text', required: true, default: '' },
      ] },
    ]);

    expect(service.verifiersValid()).toBeFalse();
  });
});
