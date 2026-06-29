import { Injectable, Signal, WritableSignal, computed, signal } from "@angular/core";
import { Verifier } from "../../types/Verifier";
import { ProjectService } from "../project/project.service";
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
  private static readonly DEFAULT_VERIFIERS: Verifier[] = [
    { id: 'eebc', label: 'Energy efficiency', enabled: true, settings: [
      { id: 'model', label: 'select model', description: 'Energy efficiency prediction model', type: 'select', required: true, default: 'model1', options: [{ id: 'model1', label: 'Model 1' }, { id: 'model2', label: 'Model 2' }] },
      { id: 'max_threshold', label: 'max threshold', description: 'Maximum allowed energy to be consumed', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 100 } },
    ] },
    { id: 'sec', label: 'Security', enabled: true, settings: [
        { id: 'test_value1', label: 'test_label1', type: 'text' },
        { id: 'test_value2', label: 'test_label2', description: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.', type: 'text' }] },
    { id: 'maintain', label: 'Maintainability', enabled: false },
  ];

  private _verifiers: WritableSignal<Verifier[]> = signal<Verifier[]>(
    this.seedInputs(VerifierService.DEFAULT_VERIFIERS),
  );

  constructor(private projectService: ProjectService) {
    const cached = this.projectService.getVerifiers();
    if (cached) {
      this._verifiers.set(this.seedInputs(cached));
    }
    this.projectService.verifiersLoaded.subscribe(() => {
      const reloaded = this.projectService.getVerifiers();
      if (reloaded) {
        this._verifiers.set(this.seedInputs(reloaded));
      }
    });
  }

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
    this.persist();
  }

  /**
   * Update whether the verifier with the given id is enabled. Mutating shared state
   * goes through the service so every consumer observes the same enabled state.
   * @param id The id of the verifier to toggle
   * @param enabled The new enabled state
   */
  public setEnabled(id: string, enabled: boolean): void {
    this._verifiers.update(verifiers =>
      verifiers.map(v => (v.id === id ? { ...v, enabled } : v)),
    );
    this.persist();
  }

  /**
   * Persist a settings input value into the shared signal. Routing changes through the
   * service keeps it the single source of truth, so every consumer (side menu, bottom
   * menu) observes the same value.
   * @param verifierId The id of the verifier owning the setting
   * @param settingId The id (key) of the setting to update
   * @param input The new input value
   */
  public updateSetting(verifierId: string, settingId: string, input: string): void {
    this._verifiers.update(verifiers =>
      verifiers.map(verifier =>
        verifier.id === verifierId
          ? {
              ...verifier,
              settings: verifier.settings?.map(setting =>
                setting.id === settingId ? { ...setting, input } : setting,
              ),
            }
          : verifier,
      ),
    );
    this.persist();
  }

  /**
   * Push the current verifier list into the project's persistence layer (sessionStorage
   * cache + `.internal/verifiers.json` project file). Called after every mutation so the
   * UI state is always in sync with the persisted state.
   */
  private persist(): void {
    this.projectService.saveVerifiers(this._verifiers());
  }

  /**
   * Seed every setting's `input` from its `default` when no `input` is present yet
   * (`input ??= default ?? ''`). Applied to both the hardcoded initializer, to backend-loaded
   * verifiers, and to cache-restored verifiers so the preinitialization rule cannot be
   * forgotten on any path. Preserving an existing `input` is essential for the cache path —
   * the user's typed values must survive a reload.
   * @param verifiers The verifiers to normalize
   */
  private seedInputs(verifiers: Verifier[]): Verifier[] {
    return verifiers.map(verifier => ({
      ...verifier,
      settings: verifier.settings?.map(setting => ({ ...setting, input: setting.input ?? setting.default ?? '' })),
    }));
  }

  /**
   * Get the list of enabled verifiers.
   */
  public get activeVerifiers(): Verifier[] {
    return this._verifiers().filter(verifier => verifier.enabled);
  }

  /**
   * The enabled verifiers that have at least one invalid setting, each with its `settings`
   * narrowed to only the invalid ones. Disabled verifiers are excluded — they will not run —
   * mirroring the {@link verifiersValid} gate. Returns an empty array when everything is valid.
   */
  public get invalidVerifierSettings(): Verifier[] {
    return this._verifiers()
      .filter(verifier => verifier.enabled)
      .map(verifier => ({
        ...verifier,
        settings: (verifier.settings ?? []).filter(setting => !isSettingValid(setting)),
      }))
      .filter(verifier => (verifier.settings ?? []).length > 0);
  }
}
