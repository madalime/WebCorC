/**
 * Well-known id of the primary (functional correctness) verifier. Every catalog is
 * contractually guaranteed to contain it and to keep it enabled (`toggleable: false`).
 * Unlike the other verifiers, its pre/postconditions are the statement's own
 * `preCondition`/`postCondition`, not verifier-specific ones.
 */
export const PRIMARY_VERIFIER_ID = "func";

/**
 * Whether a setting must be filled in. A required setting must declare a `default`
 * value used to preinitialize its input; an optional setting may still provide one.
 */
type Requiredness =
  | { required: true; default: string }
  | { required?: false; default?: string };

/**
 * Fields shared by every verifier setting regardless of its input type.
 */
type SettingBase = {
  /** Stable key of the setting, used to address it when persisting changes. */
  id: string;
  /** Human-readable label rendered next to the input. */
  label: string;
  /** Optional longer description of what the setting controls. */
  description?: string;
  /**
   * Current, persisted value of the setting. Seeded from `default` on load. Always a
   * string — numeric settings store their value as a canonical `.`-decimal string.
   */
  input?: string;
};

/**
 * A free-text setting holding an arbitrary string. `valueType` may be omitted or set to
 * `'string'`.
 */
type TextStringSetting = { type: 'text'; valueType?: 'string' };

/**
 * A numeric text setting. `step` defines the precision grid; an **omitted `step` means
 * `step = 1`, i.e. integers only**. `step: 0.01` allows two decimals, `step: 0.5` allows
 * halves, and so on. The step grid is measured relative to `range.min` (or `0` when no
 * `min` is given), matching native `<input type="number">` semantics. `range` (inclusive
 * on both ends, each bound optional) optionally bounds the value. The value is still stored
 * as a canonical, `.`-separated decimal string on {@link SettingBase.input}.
 */
type TextNumberSetting = {
  type: 'text';
  valueType: 'number';
  step?: number;
  range?: { min?: number; max?: number };
};

/**
 * A setting rendered as a dropdown of predefined options.
 */
type SelectSetting = { type: 'select'; options: { id: string; label: string }[] };

/**
 * A single configurable setting of a verifier, rendered as either a free text / numeric
 * input or a select dropdown. Discriminated on `type` and, for text settings, `valueType`.
 */
export type VerifierSetting =
  | (SettingBase & TextStringSetting & Requiredness)
  | (SettingBase & TextNumberSetting & Requiredness)
  | (SettingBase & SelectSetting & Requiredness);

/**
 * A domain variable a verifier operates on. `type` is a free-form string that names the
 * variable's type (e.g. `int`, `boolean`, a class name) — the frontend does not interpret
 * it, it is passed through to the verifier backend.
 */
export interface VerifierVariable {
  /** Stable key of the variable, used to address it when persisting changes. */
  id: string;
  /** Type name of the variable (e.g. `int`, `boolean`, a class name). */
  type: string;
  /** Human-readable name of the variable. */
  name: string;
  /** Optional longer description of what the variable represents. */
  description?: string;
}

/**
 * A verifier that can be toggled on or off and optionally configured through its settings.
 *
 * The base catalog is authored declaratively (currently hardcoded in `VerifierService`,
 * eventually delivered by the backend). User modifications live in a separate
 * {@link VerifierOverrides} record — a `Verifier` value that consumers see is the merged
 * projection produced by {@link applyOverrides}, not the raw base.
 */
export interface Verifier {
  id: string;
  label: string;
  enabled: boolean;
  /**
   * Whether the user can move the enabled toggle. Defaults to `true` (freely toggleable)
   * when omitted. `false` locks the toggle at whatever `enabled` is declared as — enabling
   * either a mandatory-on verifier (`enabled: true`) or a forced-off one (`enabled: false`).
   */
  toggleable?: boolean;
  settings: VerifierSetting[];
  /**
   * Domain variables the verifier operates on. Passed through to the verifier backend;
   * the frontend does not interpret them beyond rendering.
   */
  variables: VerifierVariable[];
}

/**
 * User's persisted modifications to the base verifier catalog, keyed by verifier id.
 * Sparse: entries are created lazily on first user interaction and never removed even if
 * the user reverts to the base value. `enabled` is optional per entry — when absent, the
 * merged view falls back to the base's `enabled`. `settings` maps each modified setting's
 * id to its raw input string.
 */
export type VerifierOverrides = Record<
  string,
  {
    enabled?: boolean;
    settings: Record<string, string>;
  }
>;