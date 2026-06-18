/**
 * Tests for getByteLimitEnv — the shared byte-size limit parser.
 *
 * A malformed override must fall back to the safe default rather than
 * resolving to NaN/0 and disabling the cap it guards.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { getByteLimitEnv } from "../src/byte-limits.js";
import { resetEnvironment } from "../src/environment.js";

const KEY = "NODETOOL_TEST_BYTE_LIMIT";
const FALLBACK = 1024;

describe("getByteLimitEnv", () => {
  beforeEach(() => {
    resetEnvironment();
    delete process.env[KEY];
  });

  afterEach(() => {
    delete process.env[KEY];
    resetEnvironment();
  });

  it("returns the fallback when unset", () => {
    expect(getByteLimitEnv(KEY, FALLBACK)).toBe(FALLBACK);
  });

  it("returns the fallback for a blank value", () => {
    process.env[KEY] = "   ";
    expect(getByteLimitEnv(KEY, FALLBACK)).toBe(FALLBACK);
  });

  it("parses a valid positive integer", () => {
    process.env[KEY] = "2048";
    expect(getByteLimitEnv(KEY, FALLBACK)).toBe(2048);
  });

  it("floors a fractional value", () => {
    process.env[KEY] = "2048.9";
    expect(getByteLimitEnv(KEY, FALLBACK)).toBe(2048);
  });

  it.each(["unlimited", "0", "-1", "NaN", "Infinity"])(
    "returns the fallback for invalid value %j",
    (value) => {
      process.env[KEY] = value;
      expect(getByteLimitEnv(KEY, FALLBACK)).toBe(FALLBACK);
    }
  );
});
