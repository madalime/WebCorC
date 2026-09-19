import { nodeStateFor } from "./abstract-statement";
import { FUNCTIONAL_VERIFIER_ID } from "../Verifier";

describe("nodeStateFor", () => {
  it("returns the caller's verified state when isProven", () => {
    expect(nodeStateFor(true, undefined, "verified-all")).toBe("verified-all");
    expect(
      nodeStateFor(true, { [FUNCTIONAL_VERIFIER_ID]: { proven: false } }, "verified-functional"),
    ).toBe("verified-functional");
  });

  it("returns failed-non-functional when not proven but func itself proved the statement", () => {
    const verifiers = { [FUNCTIONAL_VERIFIER_ID]: { proven: true } };
    expect(nodeStateFor(false, verifiers, "verified-all")).toBe("failed-non-functional");
  });

  it("returns failed when not proven and func did not prove the statement", () => {
    const verifiers = { [FUNCTIONAL_VERIFIER_ID]: { proven: false } };
    expect(nodeStateFor(false, verifiers, "verified-all")).toBe("failed");
  });

  it("returns failed when not proven and there is no func entry or no verifiers map at all", () => {
    expect(nodeStateFor(false, {}, "verified-all")).toBe("failed");
    expect(nodeStateFor(false, undefined, "verified-all")).toBe("failed");
  });
});
