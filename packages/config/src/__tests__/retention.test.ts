import { describe, it, expect } from "vitest";
import { isAutomaticStorageCleanupEnabled } from "../retention.js";

describe("isAutomaticStorageCleanupEnabled", () => {
  it("is off when the variable is unset", () => {
    expect(isAutomaticStorageCleanupEnabled({})).toBe(false);
  });

  it("is on for 1 and true", () => {
    expect(
      isAutomaticStorageCleanupEnabled({ NODETOOL_STORAGE_AUTO_CLEANUP: "1" })
    ).toBe(true);
    expect(
      isAutomaticStorageCleanupEnabled({
        NODETOOL_STORAGE_AUTO_CLEANUP: " TRUE "
      })
    ).toBe(true);
  });

  it("is off for 0, false, and anything else", () => {
    for (const value of ["0", "false", "", "yes please"]) {
      expect(
        isAutomaticStorageCleanupEnabled({
          NODETOOL_STORAGE_AUTO_CLEANUP: value
        })
      ).toBe(false);
    }
  });
});
