import { Component } from '@angular/core';
import {Accordion, AccordionContent, AccordionHeader, AccordionPanel} from "primeng/accordion";
import {ToggleSwitch} from "primeng/toggleswitch";
import {FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators} from "@angular/forms";
import {MatFormField, MatInput, MatLabel} from "@angular/material/input";
import {MatOption, MatSelect} from "@angular/material/select";

/**
 * A single configurable setting of a verifier item, rendered as either a free text input
 * or a select dropdown depending on the `type` discriminator.
 */
type ItemSettings =
  | ({ value: string; label: string; description?: string; type: 'text' })
  | ({ value: string; label: string; description?: string;  type: 'select'; options: { value: string; label: string }[] })

/**
 * A verifier that can be toggled on or off and optionally configured through its settings.
 */
interface Item {
  value: string;
  label: string;
  enabled: boolean;
  settings?: ItemSettings[];
}

@Component({
  selector: 'app-verifier-manager',
  imports: [
    Accordion,
    AccordionContent,
    AccordionHeader,
    AccordionPanel,
    ToggleSwitch,
    FormsModule,
    ReactiveFormsModule,
    MatFormField,
    MatInput,
    MatLabel,
    MatSelect,
    MatOption
  ],
  templateUrl: './verifier-manager.component.html',
  standalone: true,
  styleUrl: './verifier-manager.component.css',
})
/**
 * Component to manage the available verifiers, each verifier can be enabled or disabled via a toggle and,
 * when it has settings, configured through an expandable accordion section.
 * Each verifier's settings map one to one to a reactive form group, grouped together under the verifier's value.
 * @link https://primeng.org/accordion
 * @link https://angular.dev/guide/forms/reactive-forms
 */
export class VerifierManagerComponent {

  private _expandedSections: string[] = [];
  private _items: Item[] = [
    { value: '1', label: 'Energy efficiency', enabled: true, settings: [{ value: 'model', label: 'select model', description: 'Energy efficiency prediction model', type: 'select', options: [{ value: 'model1', label: 'Model 1'}, {value: 'model2', label: 'Model 2' }] }, { value: 'max_threshold', label: 'max threshold', description: 'Maximum allowed energy to be consumed', type: 'text'}] },
    { value: '2', label: 'Security', enabled: true, settings: [{ value: 'test_value', label: 'test_label', type: 'text'}] },
    { value: '3', label: 'Maintainability', enabled: false },
  ];
  private _form : FormGroup = this._fb.group(
    Object.fromEntries(
      this._items.map(item => [
        item.value,
        this._fb.group(
          Object.fromEntries(
            (item.settings ?? []).map(setting => [
              setting.value,
              this._fb.control('', Validators.required),
            ]),
          ),
        ),
      ]),
    ),
  );

  public constructor(private _fb : FormBuilder) {}

  /**
   * Handle the toggle of a verifier. When the verifier is switched off its accordion section is collapsed
   * by removing it from the expanded sections.
   * @param item The toggled verifier with its value and the new enabled state
   */
  public onToggle(item: { value: string; enabled: boolean }) {
    if (!item.enabled) {
      // collapse when switched off
      this._expandedSections = this._expandedSections.filter(v => v !== item.value);
    }
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
    return this._items.find(item => item.value === name)?.enabled ?? false;
  }

  /**
   * Check whether the verifier with the given value has any settings.
   * @param name The value of the verifier to check
   */
  private hasSettings(name: string): boolean {
    return (this._items.find(item => item.value === name)?.settings?.length ?? 0) > 0;
  }

  /**
   * Getter for the verifiers
   */
  public get items() : Item[] {
    return this._items;
  }

  /**
   * Getter for the values of the currently expanded accordion sections
   */
  public get expandedSections() : string[] {
    return this._expandedSections
  }

  /**
   * Getter for the form holding the settings of every verifier
   */
  public get form() : FormGroup {
    return this._form
  }
}
