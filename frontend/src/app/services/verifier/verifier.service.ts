import { HttpErrorResponse } from "@angular/common/http";
import { Injectable, Signal, WritableSignal, computed, signal, inject } from "@angular/core";
import { Observable, Subject, retry, throwError, timer } from "rxjs";
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
import { isSettingValid, isWellFormedCatalog } from "./verifier-validation";

/** How the Verifier Catalog fetch is going; see {@link VerifierService.catalogFetch}. */
export type CatalogFetchState =
  | { status: "fetching"; attempt: number }
  | { status: "loaded" }
  | { status: "failed" };

/**
 * Service that owns the verifier state and shares it across components.
 *
 * State is split in two:
 * - the read-only **Verifier Catalog** ({@link _catalog}) — fetched from the backend once per
 *   page load, at construction (see {@link fetchCatalog}, which keeps trying for a while when
 *   the backend is not up yet); held in memory only, never in sessionStorage, so a reload
 *   always shows the deployment's current Catalog;
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

  /**
   * How many times the Catalog is requested before the fetch counts as failed, and the pause
   * between two requests. Together they bound how long a page opened before the backend is up
   * keeps trying — the dev stack takes about a minute to bind its port on a cold start — while
   * a backend that is down for good stops being asked after this budget instead of forever.
   */
  public static readonly CATALOG_FETCH_ATTEMPTS = 40;
  public static readonly CATALOG_FETCH_DELAY_MS = 3000;

  /**
   * The HTTP statuses that mean "nobody answered", which a backend still starting shares with
   * one that is down for good: `0` is the browser's connection failure (refused, DNS, CORS),
   * the 5xx ones are a proxy in front of a backend it cannot reach. Only these are retried;
   * any other error is the backend answering wrongly, which no retry would change.
   */
  private static readonly UNREACHABLE_STATUSES: ReadonlySet<number> = new Set([0, 502, 503, 504]);

  private _catalog: WritableSignal<Verifier[]> = signal([VerifierService.FUNCTIONAL_VERIFIER_FALLBACK]);
  private _overrides: WritableSignal<VerifierOverrides> = signal({});
  private _catalogFetch: WritableSignal<CatalogFetchState> = signal({ status: "fetching", attempt: 1 });

  /**
   * How the Catalog fetch is going, for the Verifiers panel to say so while the backend is not
   * up yet: `fetching` with the 1-based attempt currently in flight (of
   * {@link CATALOG_FETCH_ATTEMPTS}), `loaded` once the Catalog is shown, `failed` once the
   * fetch has been given up on and only the Functional Verifier remains.
   */
  public readonly catalogFetch: Signal<CatalogFetchState> = this._catalogFetch.asReadonly();

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
   * A page opened before the backend listens (the dev stack's backend binds its port a good
   * minute after the frontend serves) would otherwise be stuck with the Functional Verifier
   * until a reload, so while nobody answers ({@link UNREACHABLE_STATUSES}) the request is
   * repeated every {@link CATALOG_FETCH_DELAY_MS}, one at a time, up to
   * {@link CATALOG_FETCH_ATTEMPTS} times; {@link catalogFetch} counts the attempts for the
   * panel. The frontend cannot tell a backend that is still starting from one that is down,
   * so the budget is what keeps this from spinning forever against a dead one.
   *
   * If the Catalog carries a `message` — the backend's one console line naming the Verifiers
   * it locked off and why — it is forwarded verbatim to the console, like a verification log
   * line. The frontend performs no reasoning about why an entry is locked off: the entry
   * itself already says everything the panel needs (`enabled: false`, `toggleable: false`).
   *
   * On any other failure, or once the attempts are used up, the Catalog becomes exactly the
   * locally built Functional Verifier and one console line reports it, so the editor stays
   * usable for pure correctness-by-construction work; verification itself surfaces backend
   * unavailability separately.
   *
   * A 200 response whose body does not match the Catalog contract — a Verifier missing its
   * `settings`/`variables` arrays, most likely a frontend/backend version mismatch rather than
   * a startup race — is not retried (nothing about retrying the same request would fix a wrong
   * shape) but takes the same fallback as a network failure via {@link isWellFormedCatalog}.
   * Without that check, {@link sortVerifiers} and the overrides merge both index into those
   * arrays unconditionally and would throw outside the Observable's error channel — invisible
   * to both `retry` and this method's own `error` handler, leaving the panel stuck rather than
   * falling back.
   */
  private fetchCatalog(): void {
    this.network
      .fetchCatalog()
      .pipe(
        retry({
          count: VerifierService.CATALOG_FETCH_ATTEMPTS - 1,
          delay: (error: HttpErrorResponse, retryCount: number) => {
            if (!VerifierService.UNREACHABLE_STATUSES.has(error.status)) {
              return throwError(() => error);
            }
            this._catalogFetch.set({ status: "fetching", attempt: retryCount + 1 });
            return timer(VerifierService.CATALOG_FETCH_DELAY_MS);
          },
        }),
      )
      .subscribe({
        next: (catalog: VerifierCatalog) => {
          if (!isWellFormedCatalog(catalog)) {
            this.fallBackToFunctionalVerifier(
              "Verifier Catalog was malformed; showing only the Functional Verifier",
              "A Verifier entry was missing its settings/variables arrays",
            );
            return;
          }
          this._catalog.set(this.sortVerifiers(catalog.verifiers));
          this._catalogFetch.set({ status: "loaded" });
          if (catalog.message) {
            this.consoleService.addStringInfo(catalog.message, "pi pi-exclamation-triangle");
          }
        },
        error: (error: HttpErrorResponse) => {
          this.fallBackToFunctionalVerifier(
            "Verifier Catalog could not be fetched; showing only the Functional Verifier",
            error,
          );
        },
      });
  }

  /**
   * Reset to exactly the locally built Functional Verifier and log one console error —
   * the shared landing spot for a Catalog fetch that failed outright and one whose body
   * arrived but does not match the contract.
   * @param action What the console line says was being attempted
   * @param error The underlying failure: the response for a network failure, or a plain
   *   description for a malformed body
   */
  private fallBackToFunctionalVerifier(action: string, error: HttpErrorResponse | string): void {
    this._catalog.set([VerifierService.FUNCTIONAL_VERIFIER_FALLBACK]);
    this._catalogFetch.set({ status: "failed" });
    if (typeof error === "string") {
      this.consoleService.addStringError(error, action);
    } else {
      this.consoleService.addErrorResponse(error, action);
    }
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