import { Directive, Input } from "@angular/core";
import { AbstractControl, NG_VALIDATORS, ValidationErrors, Validator } from "@angular/forms";
import { VerifierSetting } from "../../types/Verifier";

/**
 * Surfaces a setting's `savedValueError` marker (see `types/Verifier.ts`) as a `savedValueError`
 * control error, so it shows through `mat-error`/`immediateErrorStateMatcher` exactly like the
 * other validators (required, number range/step) without waiting for the control to be touched.
 * The marker itself, not `control.value`, is the source of truth — the control's displayed value
 * for a marked setting is already the saved value (or, for a boolean, forced off), not something
 * this validator needs to re-check.
 */
@Directive({
  selector: "[appSavedValueError]",
  standalone: true,
  providers: [{ provide: NG_VALIDATORS, useExisting: SavedValueErrorValidatorDirective, multi: true }],
})
export class SavedValueErrorValidatorDirective implements Validator {
  /** The setting whose `savedValueError` marker is surfaced as a control error. */
  @Input({ alias: "appSavedValueError", required: true })
  public setting!: VerifierSetting;

  public validate(_control: AbstractControl): ValidationErrors | null {
    return this.setting.savedValueError ? { savedValueError: true } : null;
  }
}
