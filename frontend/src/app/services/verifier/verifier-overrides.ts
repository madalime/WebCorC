import { Verifier, VerifierOverrides } from "../../types/Verifier";

/**
 * Merges a sparse {@link VerifierOverrides} record onto the read-only base catalog into the
 * {@link Verifier} list consumers render. Pure — neither argument is mutated.
 *
 * Out-of-range/off-step numeric text passes through unsanitized; `mat-error` surfaces that in
 * the UI instead of this function clamping it. Orphan override entries (unknown verifier or
 * setting ids) are hidden from the merged view but left in the override record itself, since
 * they may belong to a Verifier that's only temporarily offline rather than being stale.
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
      settings: verifier.settings.map((setting) => {
        const overrideInput = override?.settings?.[setting.id];
        return setting.type === "boolean"
          ? { ...setting, input: resolveBooleanInput(verifier.id, setting, overrideInput) }
          : { ...setting, input: resolveStringInput(verifier.id, setting, overrideInput) };
      }),
      variables: verifier.variables,
    };
  });
}

function resolveStringInput(
  verifierId: string,
  setting: Exclude<Verifier["settings"][number], { type: "boolean" }>,
  overrideInput: string | boolean | undefined,
): string {
  const fallback = setting.default ?? "";
  if (overrideInput === undefined) {
    return fallback;
  }
  if (typeof overrideInput !== "string") {
    console.debug(
      `Verifier setting override for "${verifierId}.${setting.id}" (${overrideInput}) is not a string; falling back to default (${fallback}).`,
    );
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

function resolveBooleanInput(
  verifierId: string,
  setting: Extract<Verifier["settings"][number], { type: "boolean" }>,
  overrideInput: string | boolean | undefined,
): boolean {
  if (overrideInput === undefined) {
    return setting.default;
  }
  if (typeof overrideInput !== "boolean") {
    console.debug(
      `Verifier setting override for "${verifierId}.${setting.id}" (${overrideInput}) is not a boolean; falling back to default (${setting.default}).`,
    );
    return setting.default;
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