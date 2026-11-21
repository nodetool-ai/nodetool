import { describe, expect, it } from "vitest";
import { compareVersions, isPreReleaseVersion } from "../src/versions.js";

describe("compareVersions (PEP 440 ordering)", () => {
  it.each([
    ["1.0", "1.0.0"],
    ["1", "1.0.0"],
    ["0.7", "0.7.0"],
    ["1.0a1", "1.0.0a1"]
  ])("treats %s and %s as equal", (a, b) => {
    expect(compareVersions(a, b)).toBe(0);
    expect(compareVersions(b, a)).toBe(0);
  });

  it.each([
    ["1.0.dev1", "1.0a1"],
    ["1.0.dev1", "1.0b1"],
    ["1.0a1", "1.0b1"],
    ["1.0b1", "1.0rc1"],
    ["1.0rc1", "1.0"],
    ["1.0", "1.0.post1"],
    ["1.0rc1", "1.0.post1"],
    ["1.0.post1", "1.0.1"],
    ["1.0.post1", "1.0.post2"],
    ["1.0.9", "1.0.10"],
    ["1.0", "1.0.1"],
    ["1.0a1.dev1", "1.0a1"]
  ] as [string, string][])("orders %s below %s", (lower, higher) => {
    expect(compareVersions(lower, higher)).toBeLessThan(0);
    expect(compareVersions(higher, lower)).toBeGreaterThan(0);
  });

  it("sorts a mixed list into PEP 440 order", () => {
    const sorted = ["1.0.post1", "1.0", "1.0rc1", "1.0.dev1", "1.0a1", "1.0b2", "0.9"].sort(
      compareVersions
    );
    expect(sorted).toEqual(["0.9", "1.0.dev1", "1.0a1", "1.0b2", "1.0rc1", "1.0", "1.0.post1"]);
  });
});

describe("isPreReleaseVersion", () => {
  it.each(["1.0a1", "1.0b2", "1.0rc1", "1.0.dev3", "1.0.0-beta1"])("%s is a pre-release", (v) => {
    expect(isPreReleaseVersion(v)).toBe(true);
  });
  it.each(["1.0", "1.0.post1", "2.3.4"])("%s is a release", (v) => {
    expect(isPreReleaseVersion(v)).toBe(false);
  });
});
