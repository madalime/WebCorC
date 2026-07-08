import { VerifierSetting } from "../../types/Verifier";

/** Tolerance for floating-point step-grid comparisons (e.g. 0.1 + 0.2 drift). */
const STEP_EPSILON = 1e-9;

/**
 * The effective step of a number setting. An omitted step means `1` (integers only).
 * @param setting The number setting to read the step from
 */
export function effectiveStep(setting: { step?: number }): number {
  return setting.step ?? 1;
}

/**
 * Whether `value` sits on the step grid `base + n * step` for some integer `n`, within a
 * small floating-point tolerance. Mirrors native `<input type="number">` step semantics,
 * where the grid is anchored at `range.min` (or `0` when there is no min).
 * @param value The numeric value to test
 * @param step The step size (must be > 0)
 * @param base The grid anchor, i.e. `range.min ?? 0`
 */
export function matchesStep(value: number, step: number, base: number): boolean {
  if (step <= 0) {
    return true;
  }
  const steps = (value - base) / step;
  return Math.abs(steps - Math.round(steps)) < STEP_EPSILON;
}

/**
 * Validate a single non-empty numeric input string against a number setting's constraints
 * (finite number, inclusive range, step grid). Returns `null` when valid, otherwise a
 * machine-readable error key. Shared by the service gate and the step validator directive
 * so both agree on what "valid" means.
 *
 * Emptiness and `required` are intentionally NOT handled here — empty optional inputs are
 * valid and are filtered out by the caller; `required` is enforced separately.
 * @param setting The number setting providing the constraints
 * @param input The raw input string (assumed non-empty)
 */
export function numberInputError(
  setting: Extract<VerifierSetting, { valueType: 'number' }>,
  input: string,
): 'number' | 'min' | 'max' | 'step' | null {
  const value = Number(input);
  if (input.trim().length === 0 || !Number.isFinite(value)) {
    return 'number';
  }
  const min = setting.range?.min;
  const max = setting.range?.max;
  if (min !== undefined && value < min) {
    return 'min';
  }
  if (max !== undefined && value > max) {
    return 'max';
  }
  if (!matchesStep(value, effectiveStep(setting), min ?? 0)) {
    return 'step';
  }
  return null;
}

/**
 * Whether a single setting is currently valid for the purpose of gating a run. Boolean
 * settings are always valid — a toggle can only produce `true`/`false` and its default
 * is mandatory. Required string-valued settings must be non-empty; non-empty numeric
 * settings must satisfy their constraints. Empty optional settings are valid.
 * @param setting The setting to validate
 */
export function isSettingValid(setting: VerifierSetting): boolean {
  if (setting.type === 'boolean') {
    return true;
  }
  const input = setting.input ?? '';
  if (setting.required && input.trim().length === 0) {
    return false;
  }
  if (input.trim().length === 0) {
    return true;
  }
  if (setting.type === 'text' && setting.valueType === 'number') {
    return numberInputError(setting, input) === null;
  }
  return true;
}