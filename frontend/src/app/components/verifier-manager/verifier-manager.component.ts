import { Component } from '@angular/core';
import {Accordion, AccordionContent, AccordionHeader, AccordionPanel} from "primeng/accordion";
import {ToggleSwitch} from "primeng/toggleswitch";
import {FormsModule} from "@angular/forms";
import {MatError, MatFormField, MatInput, MatLabel} from "@angular/material/input";
import {MatOption, MatSelect} from "@angular/material/select";
import { Verifier, VerifierSetting } from "../../types/Verifier";
import { VerifierService } from "../../services/verifier/verifier.service";
import { StepValidatorDirective } from "../../services/verifier/step-validator.directive";

@Component({
  selector: 'app-verifier-manager',
  imports: [
    Accordion,
    AccordionContent,
    AccordionHeader,
    AccordionPanel,
    ToggleSwitch,
    FormsModule,
    MatFormField,
    MatInput,
    MatLabel,
    MatError,
    MatSelect,
    MatOption,
    StepValidatorDirective
  ],
  templateUrl: './verifier-manager.component.html',
  standalone: true,
  styleUrl: './verifier-manager.component.css',
})
/**
 * Component to manage the available verifiers, each verifier can be enabled or disabled via a toggle and,
 * when it has settings, configured through an expandable accordion section.
 * The verifier list and all of its state (enabled flag, settings input values) live in the shared
 * {@link VerifierService} signal, so the side menu and bottom menu placements stay in sync. Settings inputs
 * bind one-way and route every change back through the service, mirroring the condition editor.
 * @link https://primeng.org/accordion
 */
export class VerifierManagerComponent {

  private _expandedSections: string[] = [];

  public constructor(private _verifierService: VerifierService) {}

  /**
   * Handle the toggle of a verifier. Updates the shared enabled state through the
   * service and collapses the section when the verifier is switched off.
   * @param item The toggled verifier
   * @param enabled The new enabled state from the toggle
   */
  public onToggle(item: Verifier, enabled: boolean) {
    this._verifierService.setEnabled(item.value, enabled);
    if (!enabled) {
      // collapse when switched off
      this._expandedSections = this._expandedSections.filter(v => v !== item.value);
    }
  }

  /**
   * Persist a settings input change to the shared service, keeping it the single source of
   * truth across every consuming component. Numeric inputs bind through Angular's
   * `NumberValueAccessor`, which emits a `number` (or `null` when empty/unparseable); both
   * are coerced to the canonical string the model stores, so emptiness is always `''`.
   * Invalid values are persisted on purpose: the field flags them via `mat-error` and the
   * service's `verifiersValid` gate blocks their use, so the model never lies about its view.
   * @param item The verifier owning the setting
   * @param setting The setting that changed
   * @param value The new input value as reported by the bound control
   */
  public onSettingChange(item: Verifier, setting: VerifierSetting, value: string | number | null) {
    this._verifierService.updateSetting(item.value, setting.value, value == null ? '' : String(value));
  }

  /**
   * Update the set of expanded accordion sections, keeping only verifiers that are enabled and have settings.
   * A disabled or settings-less section can never be opened, so it never stays in the active set.
   * @param expandedSections The currently expanded section values as reported by the accordion
   */
  public updateExpandedSections(expandedSections: string | number | string[] | number[] | null | undefined) {
    const sections = Array.isArray(expandedSections) ? expandedSections.map(String) : [];
    // a disabled or settings-less Section can never be opened, so it never stays in the active set
    this._expandedSections = sections.filter(section => this.isEnabled(section) && this.hasSettings(section));
  }

  /**
   * Check whether the verifier with the given value is enabled.
   * @param name The value of the verifier to check
   */
  private isEnabled(name: string): boolean {
    return this._verifierService.verifiers().find(item => item.value === name)?.enabled ?? false;
  }

  /**
   * Check whether the verifier with the given value has any settings.
   * @param name The value of the verifier to check
   */
  private hasSettings(name: string): boolean {
    return (this._verifierService.verifiers().find(item => item.value === name)?.settings?.length ?? 0) > 0;
  }

  /**
   * Getter for the verifiers, sourced from the shared service signal.
   */
  public get items() : Verifier[] {
    return this._verifierService.verifiers();
  }

  /**
   * Getter for the values of the currently expanded accordion sections
   */
  public get expandedSections() : string[] {
    return this._expandedSections
  }
}
