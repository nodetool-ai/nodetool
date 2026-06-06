import { describe, it, expect } from "vitest";
import {
  normalizePlatforms,
  supportsPlatform,
  ALL_PLATFORMS,
  SERVER_PLATFORMS,
  NODE_AND_BROWSER_PLATFORMS,
  DEFAULT_PLATFORMS,
  type Platform
} from "../src/platform.js";

describe("normalizePlatforms", () => {
  it("returns DEFAULT_PLATFORMS for undefined", () => {
    expect(normalizePlatforms(undefined)).toEqual(DEFAULT_PLATFORMS);
  });

  it("returns DEFAULT_PLATFORMS for null", () => {
    expect(normalizePlatforms(null)).toEqual(DEFAULT_PLATFORMS);
  });

  it("returns DEFAULT_PLATFORMS for empty array", () => {
    expect(normalizePlatforms([])).toEqual(DEFAULT_PLATFORMS);
  });

  it("passes through a non-empty array", () => {
    const platforms: readonly Platform[] = ["browser", "edge"];
    expect(normalizePlatforms(platforms)).toEqual(["browser", "edge"]);
  });

  it("preserves a single-element array", () => {
    expect(normalizePlatforms(["workers"])).toEqual(["workers"]);
  });
});

describe("supportsPlatform", () => {
  it("returns true for node when platforms is undefined (default)", () => {
    expect(supportsPlatform(undefined, "node")).toBe(true);
  });

  it("returns false for browser when platforms is undefined (default)", () => {
    expect(supportsPlatform(undefined, "browser")).toBe(false);
  });

  it("returns true when target is in the list", () => {
    expect(supportsPlatform(["node", "browser"], "browser")).toBe(true);
  });

  it("returns false when target is not in the list", () => {
    expect(supportsPlatform(["node", "browser"], "workers")).toBe(false);
  });

  it("returns true for node with null (falls back to default)", () => {
    expect(supportsPlatform(null, "node")).toBe(true);
  });

  it("returns false for edge with empty array (falls back to default)", () => {
    expect(supportsPlatform([], "edge")).toBe(false);
  });
});

describe("platform constants", () => {
  it("ALL_PLATFORMS contains all four platforms", () => {
    expect(ALL_PLATFORMS).toHaveLength(4);
    expect(ALL_PLATFORMS).toContain("node");
    expect(ALL_PLATFORMS).toContain("workers");
    expect(ALL_PLATFORMS).toContain("edge");
    expect(ALL_PLATFORMS).toContain("browser");
  });

  it("SERVER_PLATFORMS excludes browser", () => {
    expect(SERVER_PLATFORMS).toContain("node");
    expect(SERVER_PLATFORMS).toContain("workers");
    expect(SERVER_PLATFORMS).toContain("edge");
    expect(SERVER_PLATFORMS).not.toContain("browser");
  });

  it("NODE_AND_BROWSER_PLATFORMS contains only node and browser", () => {
    expect(NODE_AND_BROWSER_PLATFORMS).toEqual(["node", "browser"]);
  });

  it("DEFAULT_PLATFORMS is node only", () => {
    expect(DEFAULT_PLATFORMS).toEqual(["node"]);
  });
});
