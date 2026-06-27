import { Directive, Input } from "@angular/core";
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from "@angular/forms";
import { VerifierSetting } from "../../types/Verifier";
import { numberInputError } from "./verifier-validation";

/**
 * Template-driven validator for a numeric verifier setting rendered as a plain
 * `<input type="text">`.
 *
 * A native `<input type="number">` silently discards any non-numeric text (the DOM reports an
 * empty value for `"abc"`), so the raw string never reaches the model and a "must be a number"
 * error can never be raised. Rendering the field as text keeps the raw string, and this
 * directive validates it through the shared {@link numberInputError} — the same check the
 * service's run gate uses — emitting its result as the control error key
 * (`number` / `min` / `max` / `step`). Using one validator for the UI and the gate means the
 * two cannot drift.
 *
 * Emptiness is intentionally left to Angular's built-in `required`: an empty value is valid
 * here regardless, so the two validators compose without conflict.
 */
@Directive({
  selector: "[appNumberInput]",
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: NumberInputValidatorDirective, multi: true }],
})
export class NumberInputValidatorDirective implements Validator {
  /** The number setting whose constraints (range, step) are enforced. */
  @Input({ alias: "appNumberInput", required: true })
  public setting!: Extract<VerifierSetting, { valueType: "number" }>;

  /**
   * Validate the control's raw string against the setting's constraints. Empty values pass
   * (emptiness and `required` are handled elsewhere); otherwise the {@link numberInputError}
   * key, if any, is surfaced as the control error so `mat-error` can react to it.
   * @param control The control to validate
   */
  public validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || String(value).trim().length === 0) {
      return null;
    }
    const error = numberInputError(this.setting, String(value));
    return error ? { [error]: true } : null;
  }
}
