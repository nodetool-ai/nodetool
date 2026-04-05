import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getApiKey, isRefSet } from "../src/kie-base.js";

// ---------------------------------------------------------------------------
// getApiKey
// ---------------------------------------------------------------------------
describe("getApiKey", () => {
  const originalEnv = process.env.KIE_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.KIE_API_KEY = originalEnv;
    } else {
      delete process.env.KIE_API_KEY;
    }
  });

  it("returns key from secrets object", () => {
    expect(getApiKey({ KIE_API_KEY: "secret-from-secrets" })).toBe(
      "secret-from-secrets"
    );
  });

  it("falls back to process.env", () => {
    process.env.KIE_API_KEY = "env-key";
    expect(getApiKey({})).toBe("env-key");
  });

  it("prefers secrets over process.env", () => {
    process.env.KIE_API_KEY = "env-key";
    expect(getApiKey({ KIE_API_KEY: "secrets-key" })).toBe("secrets-key");
  });

  it("throws when key is not configured", () => {
    delete process.env.KIE_API_KEY;
    expect(() => getApiKey({})).toThrow("KIE_API_KEY is not configured");
  });

  it("throws when secrets is empty and env is not set", () => {
    delete process.env.KIE_API_KEY;
    expect(() => getApiKey({})).toThrow("KIE_API_KEY is not configured");
  });
});

// ---------------------------------------------------------------------------
// isRefSet
// ---------------------------------------------------------------------------
describe("isRefSet", () => {
  it("returns true when ref has data", () => {
    expect(isRefSet({ data: "base64data" })).toBe(true);
  });

  it("returns true when ref has uri", () => {
    expect(isRefSet({ uri: "https://example.com/image.png" })).toBe(true);
  });

  it("returns true when ref has both data and uri", () => {
    expect(isRefSet({ data: "data", uri: "uri" })).toBe(true);
  });

  it("returns false for null", () => {
    expect(isRefSet(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isRefSet(undefined)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isRefSet("string")).toBe(false);
    expect(isRefSet(42)).toBe(false);
    expect(isRefSet(true)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isRefSet({})).toBe(false);
  });

  it("returns false when data and uri are empty", () => {
    expect(isRefSet({ data: "", uri: "" })).toBe(false);
  });

  it("returns false when data and uri are null", () => {
    expect(isRefSet({ data: null, uri: null })).toBe(false);
  });
});
