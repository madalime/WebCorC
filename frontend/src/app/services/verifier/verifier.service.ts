import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, Signal, WritableSignal, computed, signal, inject } from "@angular/core";
import { Observable, Subject } from "rxjs";
import {
  FUNCTIONAL_VERIFIER_ID,
  Verifier,
  VerifierCatalog,
  VerifierOverrides,
} from "../../types/Verifier";
import { ConsoleService } from "../console/console.service";
import { ProjectService } from "../project/project.service";
import { VerifierNetworkService } from "./network/verifier-network.service";
import { applyOverrides } from "./verifier-overrides";
import { isSettingValid } from "./verifier-validation";

/**
 * Service that owns the verifier state and shares it across components.
 *
 * State is split in two:
 * - the read-only **Verifier Catalog** ({@link _catalog}) — fetched from the backend once per
 *   page load, at construction (see {@link fetchCatalog}); held in memory only, never in
 *   sessionStorage, so a reload always shows the deployment's current Catalog;
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
  private network = inject(VerifierNetworkService);
  private consoleService = inject(ConsoleService);

  /**
   * The Functional Verifier built locally: what the panel shows until the Catalog arrives
   * and all it shows when the Catalog cannot be fetched. Mirrors the backend's own entry so
   * the invariant "every Catalog contains `func`, locked on" holds at every moment.
   */
  private static readonly FUNCTIONAL_VERIFIER_FALLBACK: Verifier = {
    id: FUNCTIONAL_VERIFIER_ID,
    label: "Functional correctness",
    enabled: true,
    toggleable: false,
    settings: [],
    variables: [],
  };

  private _catalog: WritableSignal<Verifier[]> = signal([VerifierService.FUNCTIONAL_VERIFIER_FALLBACK]);
  private _overrides: WritableSignal<VerifierOverrides> = signal({});

  constructor() {
    this.fetchCatalog();
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
   * Recomputed automatically when either the Catalog or the overrides change.
   */
  public readonly verifiers: Signal<Verifier[]> = computed(() =>
    applyOverrides(this._catalog(), this._overrides()),
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
   * Fetch the Verifier Catalog from the backend. Called once, at
   * construction — the Catalog is frozen for the backend's lifetime and refreshed here only
   * by a page reload. Does not persist — the Catalog is backend-supplied, not user state.
   *
   * If the Catalog carries a `message` — the backend's one console line naming the Verifiers
   * it locked off and why — it is forwarded verbatim to the console, like a verification log
   * line. The frontend performs no reasoning about why an entry is locked off: the entry
   * itself already says everything the panel needs (`enabled: false`, `toggleable: false`).
   *
   * On any failure the Catalog becomes exactly the locally built Functional Verifier and one
   * console line reports it, so the editor stays usable for pure correctness-by-construction
   * work; verification itself surfaces backend unavailability separately.
   */
  private fetchCatalog(): void {
    this.network.fetchCatalog().subscribe({
      next: (catalog: VerifierCatalog) => {
        this._catalog.set(this.sortVerifiers(catalog.verifiers));
        if (catalog.message) {
          this.consoleService.addStringInfo(catalog.message, "pi pi-exclamation-triangle");
        }
      },
      error: (error: HttpErrorResponse) => {
        this._catalog.set([VerifierService.FUNCTIONAL_VERIFIER_FALLBACK]);
        this.consoleService.addErrorResponse(
          error,
          "Verifier Catalog could not be fetched; showing only the Functional Verifier",
        );
      },
    });
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
      if (verifier.id === FUNCTIONAL_VERIFIER_ID) return 0;
      const hasVariables = verifier.variables.length > 0;
      const hasText = verifier.statusPlaceholder !== undefined;
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