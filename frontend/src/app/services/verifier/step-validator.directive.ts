import { Directive, Input } from "@angular/core";
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from "@angular/forms";
import { matchesStep } from "./verifier-validation";

/**
 * Template-driven validator for the step grid of a numeric input.
 *
 * Angular's forms do not surface the browser's native `stepMismatch` into `control.errors`,
 * so `mat-error` cannot react to the native `step` attribute alone. This directive adds a
 * `{ step: { ... } }` error when the value is off the grid `base + n * step`, reusing the
 * same {@link matchesStep} check the service gate uses so the two cannot drift. Range
 * (`min`/`max`) is left to Angular's built-in validators.
 */
@Directive({
  selector: "[appStepValidator]",
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: StepValidatorDirective, multi: true }],
})
export class StepValidatorDirective implements Validator {
  /** The step size to enforce. Anything <= 0 disables the check. */
  @Input("appStepValidator") public step = 1;

  /** The grid anchor, i.e. `range.min ?? 0`. */
  @Input() public stepBase = 0;

  /**
   * Validate that the control's value sits on the step grid. Empty values are considered
   * valid here (emptiness and `required` are handled elsewhere).
   * @param control The control to validate
   */
  public validate(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (value === null || value === undefined || value === "") {
      return null;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return null;
    }
    return matchesStep(numeric, this.step, this.stepBase)
      ? null
      : { step: { step: this.step, base: this.stepBase, actual: numeric } };
  }
}
