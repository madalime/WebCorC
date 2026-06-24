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
  value: string;
  /** Human-readable label rendered next to the input. */
  label: string;
  /** Optional longer description of what the setting controls. */
  description?: string;
  /** Current, persisted value of the setting. Seeded from `default` on load. */
  input?: string;
};

/**
 * A single configurable setting of a verifier, rendered as either a free text input
 * or a select dropdown depending on the `type` discriminator.
 */
export type VerifierSetting =
  | (SettingBase & { type: 'text' } & Requiredness)
  | (SettingBase & { type: 'select'; options: { value: string; label: string }[] } & Requiredness);

/**
 * A verifier that can be toggled on or off and optionally configured through its settings.
 */
export interface Verifier {
  value: string;
  label: string;
  enabled: boolean;
  settings?: VerifierSetting[];
}
