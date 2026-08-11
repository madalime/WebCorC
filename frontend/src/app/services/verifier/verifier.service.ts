import { Injectable, Signal, WritableSignal, computed, signal, inject } from "@angular/core";
import { Observable, Subject } from "rxjs";
import { PRIMARY_VERIFIER_ID, Verifier, VerifierOverrides } from "../../types/Verifier";
import { ProjectService } from "../project/project.service";
import { applyOverrides } from "./verifier-overrides";
import { isSettingValid } from "./verifier-validation";

/**
 * Service that owns the verifier state and shares it across components.
 *
 * State is split in two:
 * - the read-only **base catalog** ({@link _base}) — currently hardcoded in
 *   {@link DEFAULT_VERIFIERS}, later delivered by the backend once per session via
 *   {@link loadBase};
 * - a sparse **overrides** record ({@link _overrides}) that stores only the fields the
 *   user has modified (enabled toggle and setting inputs).
 *
 * Consumers read {@link verifiers}, a `computed` that merges the two via
 * {@link applyOverrides}, so the shape is identical to the previous single-signal design.
 */
@Injectable({
  providedIn: "root",
})
export class VerifierService {
  private projectService = inject(ProjectService);

  private static readonly DEFAULT_VERIFIERS: Verifier[] = [
    { id: 'func', label: 'Functional correctness', enabled: true, toggleable: false, settings: [], variables: [] },
    { id: 'eebc', label: 'Energy efficiency', enabled: true,settings: [
      { id: 'model', label: 'select model', description: 'Energy efficiency prediction model', type: 'select', required: true, default: 'model1', options: [{ id: 'model1', label: 'Model 1' }, { id: 'model2', label: 'Model 2' }] },
      { id: 'max_threshold', label: 'max threshold', description: 'Maximum allowed energy to be consumed', type: 'text', valueType: 'number', step: 0.5, range: { min: 0, max: 100 } },
    ], variables: [] },
    { id: 'sec', label: 'Security', enabled: true, status_placeholder: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.', settings: [
        { id: 'test_value1', label: 'test_label1', type: 'text', default: 'test_default1' },
        { id: 'test_value2', label: 'test_label2', description: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.', type: 'text' },
        { id: 'test_flag', label: 'test_flag', description: 'Test boolean setting rendered as a toggle', type: 'boolean', default: false }],
      variables: [
        { id: 'test', name: 'test', type: 'int', description: 'test description' },
        { id: 'test2', name: 'test2', type: 'boolean' },
    ], allowFunctionalVariables: true },
    { id: 'maintain', label: 'Maintainability', enabled: true, status_placeholder: 'Lorem ipsum dolor sit amet, consetetur sadipscing elitr, sed diam nonumy eirmod tempor invidunt ut labore et dolore magna aliquyam erat, sed diam voluptua.', settings: [], variables: [] },
  ];

  private _base: WritableSignal<Verifier[]> = signal(this.sortVerifiers(VerifierService.DEFAULT_VERIFIERS));
  private _overrides: WritableSignal<VerifierOverrides> = signal({});

  constructor() {
    const cached = this.projectService.getVerifierOverrides();
    if (cached) {
      this._overrides.set(cached);
    }
    this.projectService.verifierOverridesLoaded.subscribe(() => {
      const reloaded = this.projectService.getVerifierOverrides();
      if (reloaded) {
        this._overrides.set(reloaded);
      }
    });
  }

  /**
   * Read-only signal of the available verifiers, shared across all consuming components.
   * Recomputed automatically when either the base catalog or the overrides change.
   */
  public readonly verifiers: Signal<Verifier[]> = computed(() =>
    applyOverrides(this._base(), this._overrides()),
  );

  /**
   * Whether every enabled verifier has all of its settings valid: required settings filled
   * in, and numeric settings within their range and on their step grid. Disabled verifiers
   * do not count — they will not run, so their invalid settings are irrelevant. Mirrors the
   * per-field `mat-error` validation (via the shared {@link isSettingValid}), so an invalid
   * value is stored but unusable: this gate goes false and blocks a future "run
   * verification" action.
   */
  public readonly verifiersValid: Signal<boolean> = computed(() =>
    this.verifiers()
      .filter((verifier) => verifier.enabled)
      .every((verifier) => verifier.settings.every(isSettingValid)),
  );

  /**
   * Replace the base verifier catalog, e.g. once it has been fetched from the backend.
   * Does not persist — the catalog is backend-supplied, not user state.
   * @param verifiers The verifiers to load as the new base
   */
  public loadBase(verifiers: Verifier[]): void {
    this._base.set(verifiers);
  }

  /**
   * Whether verification runs only the default functional verification instead of all
   * enabled verifiers. Selected via the global verify split button and applied to both
   * the global verify and per-statement verify. Session state only — not persisted with
   * the overrides.
   */
  private _functionalOnly: WritableSignal<boolean> = signal(false);
  public readonly functionalOnly: Signal<boolean> =
    this._functionalOnly.asReadonly();

  /**
   * Select between functional-only and all-verifiers verification.
   * @param functionalOnly When true, only the default functional verification runs
   */
  public setFunctionalOnly(functionalOnly: boolean): void {
    this._functionalOnly.set(functionalOnly);
  }

  /**
   * Update whether the verifier with the given id is enabled. Mutating shared state
   * goes through the service so every consumer observes the same enabled state.
   * @param id The id of the verifier to toggle
   * @param enabled The new enabled state
   */
  public setEnabled(id: string, enabled: boolean): void {
    this._overrides.update((overrides) => {
      const existing = overrides[id] ?? { settings: {} };
      return { ...overrides, [id]: { ...existing, enabled } };
    });
    this.persist();
    this._overridesChanged.next();
  }

  /**
   * Persist a settings input value into the overrides signal. Routing changes through the
   * service keeps it the single source of truth, so every consumer (side menu, bottom
   * menu) observes the same value.
   * @param verifierId The id of the verifier owning the setting
   * @param settingId The id (key) of the setting to update
   * @param input The new input value — a string for text/select settings, a boolean for
   *   boolean settings
   */
  public updateSetting(
    verifierId: string,
    settingId: string,
    input: string | boolean,
  ): void {
    this._overrides.update((overrides) => {
      const existing = overrides[verifierId] ?? { settings: {} };
      return {
        ...overrides,
        [verifierId]: {
          ...existing,
          settings: { ...existing.settings, [settingId]: input },
        },
      };
    });
    this.persist();
    this._overridesChanged.next();
  }

  /**
   * Fires after each user-driven change to the overrides (setEnabled / updateSetting).
   * Does not fire on initial hydration from persisted overrides, so consumers can
   * distinguish "the user changed a verifier setting" from "we just loaded the project".
   */
  private readonly _overridesChanged = new Subject<void>();
  public readonly overridesChanged: Observable<void> =
    this._overridesChanged.asObservable();

  /**
   * Push the current overrides into the project's persistence layer (sessionStorage
   * cache + `.internal/verifiers.json` project file). Called after every mutation so the
   * UI state is always in sync with the persisted state.
   */
  private persist(): void {
    this.projectService.saveVerifierOverrides(this._overrides());
  }

  /**
   * Sort Verifiers by:
   * 1. functional Verifier (top)
   * 2. variable + text
   * 3. variable
   * 4. text + settings
   * 5. settings
   * 6. text
   * 7. nothing (bottom)
   * @param verifiers
   * @private
   */
  private sortVerifiers(verifiers: Verifier[]): Verifier[] {
    const rank = (verifier: Verifier): number => {
      if (verifier.id === PRIMARY_VERIFIER_ID) return 0;
      const hasVariables = verifier.variables.length > 0;
      const hasText = verifier.status_placeholder !== undefined;
      const hasSettings = verifier.settings.length > 0;
      if (hasVariables && hasText) return 1;
      if (hasVariables) return 2;
      if (hasText && hasSettings) return 3;
      if (hasSettings) return 4;
      if (hasText) return 5;
      return 6;
    };
    return [...verifiers].sort((a, b) => rank(a) - rank(b));
  }

  /**
   * Get the list of enabled verifiers.
   */
  public get activeVerifiers(): Verifier[] {
    return this.verifiers().filter((verifier) => verifier.enabled);
  }

  /**
   * The enabled verifiers that have at least one invalid setting, each with its `settings`
   * narrowed to only the invalid ones. Disabled verifiers are excluded — they will not run —
   * mirroring the {@link verifiersValid} gate. Returns an empty array when everything is valid.
   */
  public get invalidVerifierSettings(): Verifier[] {
    return this.verifiers()
      .filter((verifier) => verifier.enabled)
      .map((verifier) => ({
        ...verifier,
        settings: verifier.settings.filter(
          (setting) => !isSettingValid(setting),
        ),
      }))
      .filter((verifier) => verifier.settings.length > 0);
  }
}