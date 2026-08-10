import { describe, it, expect, afterEach } from "vitest";
import {
  SANDBOX_MODULES_V1_FLAG,
  SANDBOX_MODULES_DISABLED_MESSAGE,
  SANDBOX_MODULES_BROWSER_PARITY_MESSAGE,
  isSandboxModulesV1Enabled,
  getSandboxFeatureFlagSnapshot
} from "../src/sandbox-feature-flags.js";

afterEach(() => {
  delete process.env[SANDBOX_MODULES_V1_FLAG];
});

describe("sandbox module feature flag", () => {
  it("is off when the variable is unset", () => {
    expect(isSandboxModulesV1Enabled({})).toBe(false);
  });

  it("is on only for an exact 1", () => {
    expect(isSandboxModulesV1Enabled({ [SANDBOX_MODULES_V1_FLAG]: "1" })).toBe(
      true
    );
    for (const value of ["true", "yes", "0", "", " 1", "1 "]) {
      expect(
        isSandboxModulesV1Enabled({ [SANDBOX_MODULES_V1_FLAG]: value }),
        value
      ).toBe(false);
    }
  });

  it("reads process.env by default", () => {
    expect(isSandboxModulesV1Enabled()).toBe(false);
    process.env[SANDBOX_MODULES_V1_FLAG] = "1";
    expect(isSandboxModulesV1Enabled()).toBe(true);
  });

  it("reports the flag inventory", () => {
    expect(getSandboxFeatureFlagSnapshot({})).toEqual({ modulesV1: false });
    expect(
      getSandboxFeatureFlagSnapshot({ [SANDBOX_MODULES_V1_FLAG]: "1" })
    ).toEqual({ modulesV1: true });
  });

  it("names the flag in the disabled message and the browser gap", () => {
    expect(SANDBOX_MODULES_DISABLED_MESSAGE).toContain(SANDBOX_MODULES_V1_FLAG);
    expect(SANDBOX_MODULES_BROWSER_PARITY_MESSAGE).toContain(
      "browser runner"
    );
  });
});
