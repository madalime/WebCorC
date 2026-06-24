import { Injectable, Signal, WritableSignal, computed, signal } from "@angular/core";
import { Verifier } from "../../types/Verifier";
import { isSettingValid } from "./verifier-validation";

/**
 * Service that owns the list of available verifiers and shares it across components.
 *
 * The verifiers are currently hardcoded in the frontend but are exposed as a read-only
 * signal so that consumers update reactively once they are loaded from the backend. The
 * backend delivers the verifier list once at startup and is only mutated by the frontend
 * afterwards, so the consuming `@for (item of verifiers())` is the only reactivity needed
 * — there is no form to rebuild. When the backend integration lands, call `load(...)` with
 * the fetched verifiers; consumers do not need to change.
 */
@Injectable({
  providedIn: "root",
})
export class VerifierService {
  private _verifiers: WritableSignal<Verifier[]> = signal<Verifier[]>(
    this.seedInputs([
      { value: '1', label: 'Energy efficiency', enabled: true, settings: [
        { value: 'model', label: 'select model', description: 'Energy efficiency prediction model', type: 'select', required: true, default: 'model1', options: [{ value: 'model1', label: 'Model 1' }, { value: 'model2', label: 'Model 2' }] },
        { value: 'max_threshold', label: 'max threshold', description: 'Maximum allowed energy to be consumed', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 100 } },
      ] },
      { value: '2', label: 'Security', enabled: true, settings: [{ value: 'test_value', label: 'test_label', type: 'text' }] },
      { value: '3', label: 'Maintainability', enabled: false },
    ]),
  );

  /**
   * Read-only signal of the available verifiers, shared across all consuming components.
   */
  public readonly verifiers: Signal<Verifier[]> = this._verifiers.asReadonly();

  /**
   * Whether every enabled verifier has all of its settings valid: required settings filled
   * in, and numeric settings within their range and on their step grid. Disabled verifiers
   * do not count — they will not run, so their invalid settings are irrelevant. Mirrors the
   * per-field `mat-error` validation (via the shared {@link isSettingValid}), so an invalid
   * value is stored but unusable: this gate goes false and blocks a future "run
   * verification" action.
   */
  public readonly verifiersValid: Signal<boolean> = computed(() =>
    this._verifiers()
      .filter(verifier => verifier.enabled)
      .every(verifier => (verifier.settings ?? []).every(isSettingValid)),
  );

  /**
   * Replace the verifier list, e.g. once it has been fetched from the backend. Every
   * setting's `input` is seeded from its `default` so the load path and the hardcoded
   * initializer share the same preinitialization rule.
   * @param verifiers The verifiers to load
   */
  public load(verifiers: Verifier[]): void {
    this._verifiers.set(this.seedInputs(verifiers));
  }

  /**
   * Update whether the verifier with the given value is enabled. Mutating shared state
   * goes through the service so every consumer observes the same enabled state.
   * @param value The value of the verifier to toggle
   * @param enabled The new enabled state
   */
  public setEnabled(value: string, enabled: boolean): void {
    this._verifiers.update(verifiers =>
      verifiers.map(v => (v.value === value ? { ...v, enabled } : v)),
    );
  }

  /**
   * Persist a settings input value into the shared signal. Routing changes through the
   * service keeps it the single source of truth, so every consumer (side menu, bottom
   * menu) observes the same value.
   * @param verifierValue The value of the verifier owning the setting
   * @param settingValue The value (key) of the setting to update
   * @param input The new input value
   */
  public updateSetting(verifierValue: string, settingValue: string, input: string): void {
    this._verifiers.update(verifiers =>
      verifiers.map(verifier =>
        verifier.value === verifierValue
          ? {
              ...verifier,
              settings: verifier.settings?.map(setting =>
                setting.value === settingValue ? { ...setting, input } : setting,
              ),
            }
          : verifier,
      ),
    );
  }

  /**
   * Seed every setting's `input` from its `default` (`input = default ?? ''`). Applied to
   * both the hardcoded initializer and to backend-loaded verifiers so the preinitialization
   * rule cannot be forgotten on either path.
   * @param verifiers The verifiers to normalize
   */
  private seedInputs(verifiers: Verifier[]): Verifier[] {
    return verifiers.map(verifier => ({
      ...verifier,
      settings: verifier.settings?.map(setting => ({ ...setting, input: setting.default ?? '' })),
    }));
  }
}
