import { Verifier, VerifierOverrides } from "../../types/Verifier";
import { applyOverrides } from "./verifier-overrides";

describe("applyOverrides", () => {
  it("returns base verifiers with each setting's input seeded from its default when no overrides exist", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [
          { id: "withDefault", label: "a", type: "text", required: true, default: "d" },
          { id: "withoutDefault", label: "b", type: "text" },
        ],
        variables: [],
      },
    ];

    const merged = applyOverrides(base, {});

    expect(merged[0].settings[0].input).toBe("d");
    expect(merged[0].settings[1].input).toBe("");
    expect(merged[0].enabled).toBeTrue();
  });

  it("applies an enabled override on a toggleable verifier", () => {
    const base: Verifier[] = [
      { id: "v", label: "V", enabled: false, status_placeholder: "", settings: [], variables: [] },
    ];
    const overrides: VerifierOverrides = { v: { enabled: true, settings: {} } };

    const merged = applyOverrides(base, overrides);

    expect(merged[0].enabled).toBeTrue();
  });

  it("rejects an enabled override on a toggleable:false verifier and logs the rejected value", () => {
    const base: Verifier[] = [
      { id: "v", label: "V", enabled: true, status_placeholder: "", toggleable: false, settings: [], variables: [] },
    ];
    const overrides: VerifierOverrides = { v: { enabled: false, settings: {} } };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged[0].enabled).toBeTrue();
    expect(debug).toHaveBeenCalled();
    const message = debug.calls.mostRecent().args.join(" ");
    expect(message).toContain("v");
    expect(message).toContain("false");
    expect(message).toContain("true");
  });

  it("applies a text setting override verbatim over its default", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [{ id: "s", label: "s", type: "text", default: "d" }],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = { v: { settings: { s: "typed" } } };

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBe("typed");
  });

  it("falls back to the default when a select setting override is not one of the current options", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [
          {
            id: "sel",
            label: "sel",
            type: "select",
            required: true,
            default: "a",
            options: [
              { id: "a", label: "A" },
              { id: "b", label: "B" },
            ],
          },
        ],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = { v: { settings: { sel: "gone" } } };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBe("a");
    expect(debug).toHaveBeenCalled();
    const message = debug.calls.mostRecent().args.join(" ");
    expect(message).toContain("v");
    expect(message).toContain("sel");
    expect(message).toContain("gone");
    expect(message).toContain("a");
  });

  it("seeds a boolean setting from its default and applies a boolean override verbatim", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [
          { id: "seeded", label: "seeded", type: "boolean", default: true },
          { id: "flag", label: "flag", type: "boolean", default: false },
        ],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = { v: { settings: { flag: true } } };

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBeTrue();
    expect(merged[0].settings[1].input).toBeTrue();
  });

  it("falls back to the default when a boolean setting override is not a boolean", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [
          { id: "flag", label: "flag", type: "boolean", default: false },
        ],
        variables: [],
      },
    ];
    // the legacy canonical-string form must be rejected too, not silently coerced
    const overrides: VerifierOverrides = { v: { settings: { flag: "true" } } };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBeFalse();
    expect(debug).toHaveBeenCalled();
    const message = debug.calls.mostRecent().args.join(" ");
    expect(message).toContain("v");
    expect(message).toContain("flag");
    expect(message).toContain("true");
    expect(message).toContain("false");
  });

  it("falls back to the default when a string setting override is not a string", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [{ id: "s", label: "s", type: "text", default: "d" }],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = { v: { settings: { s: true } } };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBe("d");
    expect(debug).toHaveBeenCalled();
    const message = debug.calls.mostRecent().args.join(" ");
    expect(message).toContain("v");
    expect(message).toContain("s");
    expect(message).toContain("d");
  });

  it("passes a numeric text override through verbatim even when out of range", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [
          { id: "n", label: "n", type: "text", valueType: "number", range: { min: 0, max: 10 } },
        ],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = { v: { settings: { n: "20" } } };

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings[0].input).toBe("20");
  });

  it("drops overrides for unknown verifier ids silently and logs a note", () => {
    const base: Verifier[] = [
      { id: "v", label: "V", enabled: true, status_placeholder: "", settings: [], variables: [] },
    ];
    const overrides: VerifierOverrides = {
      ghost: { enabled: false, settings: { s: "x" } },
    };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged.length).toBe(1);
    expect(merged[0].id).toBe("v");
    expect(debug).toHaveBeenCalled();
    expect(debug.calls.mostRecent().args.join(" ")).toContain("ghost");
  });

  it("drops overrides for unknown setting ids within a known verifier and logs a note", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        settings: [{ id: "known", label: "known", type: "text", default: "d" }],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = {
      v: { settings: { known: "kept", unknown: "dropped" } },
    };
    const debug = spyOn(console, "debug");

    const merged = applyOverrides(base, overrides);

    expect(merged[0].settings.length).toBe(1);
    expect(merged[0].settings[0].input).toBe("kept");
    expect(debug).toHaveBeenCalled();
    const message = debug.calls.mostRecent().args.join(" ");
    expect(message).toContain("v");
    expect(message).toContain("unknown");
  });

  it("still applies setting overrides for a toggleable:false verifier even though its enabled override is rejected", () => {
    const base: Verifier[] = [
      {
        id: "v",
        label: "V",
        enabled: true,
        status_placeholder: "",
        toggleable: false,
        settings: [{ id: "s", label: "s", type: "text", default: "d" }],
        variables: [],
      },
    ];
    const overrides: VerifierOverrides = {
      v: { enabled: false, settings: { s: "typed" } },
    };

    const merged = applyOverrides(base, overrides);

    expect(merged[0].enabled).toBeTrue();
    expect(merged[0].settings[0].input).toBe("typed");
  });
});