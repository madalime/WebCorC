import { Verifier, VerifierOverrides } from "../../types/Verifier";

/**
 * Merge a sparse {@link VerifierOverrides} record onto a read-only base catalog and
 * produce the {@link Verifier} list consumers render. Pure, side-effect-free.
 *
 * Rules:
 * - `enabled` uses the override when present, unless the base verifier has
 *   `toggleable === false` — in which case the base's `enabled` wins and the rejected
 *   override value is `console.debug`-logged.
 * - Each setting's `input` uses the override string verbatim when present; otherwise
 *   it is seeded from `default ?? ''`. For `select` settings the override must match
 *   one of the current option ids or it falls back to the default (and is logged).
 * - Numeric-text settings pass through as-is (out-of-range / off-step values surface in
 *   the UI via mat-error rather than being sanitized here).
 * - Orphan override entries — for verifier ids not in the base, or setting ids not in
 *   the base verifier's settings — are silently dropped, with a `console.debug` note.
 *   The override record itself is not mutated; the next {@link Verifier} mutation naturally
 *   trims orphans on the next persist since mutators only write ids they know about.
 * - `variables` are copied from the base verbatim.
 */
export function applyOverrides(
  base: Verifier[],
  overrides: VerifierOverrides,
): Verifier[] {
  const baseIds = new Set(base.map((v) => v.id));
  for (const overrideId of Object.keys(overrides)) {
    if (!baseIds.has(overrideId)) {
      console.debug(
        `Verifier override for unknown id "${overrideId}" dropped (not present in base catalog).`,
      );
    }
  }

  return base.map((verifier) => {
    const override = overrides[verifier.id];
    const enabled = resolveEnabled(verifier, override?.enabled);
    const settingIds = new Set(verifier.settings.map((s) => s.id));
    if (override) {
      for (const settingId of Object.keys(override.settings)) {
        if (!settingIds.has(settingId)) {
          console.debug(
            `Verifier setting override for unknown id "${verifier.id}.${settingId}" dropped (not present in base verifier's settings).`,
          );
        }
      }
    }
    return {
      ...verifier,
      enabled,
      settings: verifier.settings.map((setting) => ({
        ...setting,
        input: resolveInput(verifier.id, setting, override?.settings?.[setting.id]),
      })),
      variables: verifier.variables,
    };
  });
}

function resolveInput(
  verifierId: string,
  setting: Verifier["settings"][number],
  overrideInput: string | undefined,
): string {
  const fallback = setting.default ?? "";
  if (overrideInput === undefined) {
    return fallback;
  }
  if (
    setting.type === "select" &&
    !setting.options.some((option) => option.id === overrideInput)
  ) {
    console.debug(
      `Verifier setting override for "${verifierId}.${setting.id}" (${overrideInput}) is not in current options; falling back to default (${fallback}).`,
    );
    return fallback;
  }
  return overrideInput;
}

function resolveEnabled(
  verifier: Verifier,
  overrideEnabled: boolean | undefined,
): boolean {
  if (verifier.toggleable === false) {
    if (overrideEnabled !== undefined && overrideEnabled !== verifier.enabled) {
      console.debug(
        `Verifier "${verifier.id}" is not toggleable; ignoring saved enabled=${overrideEnabled}, using base enabled=${verifier.enabled}.`,
      );
    }
    return verifier.enabled;
  }
  return overrideEnabled !== undefined ? overrideEnabled : verifier.enabled;
}