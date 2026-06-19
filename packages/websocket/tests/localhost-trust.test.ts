import { describe, it, expect } from "vitest";
import {
  parseBoolEnv,
  isLoopbackAddress,
  resolveTrustLocalhost,
  parseTrustedProxies
} from "../src/lib/localhost-trust.js";

describe("parseBoolEnv", () => {
  it("returns undefined for unset/empty/unrecognized", () => {
    expect(parseBoolEnv(undefined)).toBeUndefined();
    expect(parseBoolEnv("")).toBeUndefined();
    expect(parseBoolEnv("   ")).toBeUndefined();
    expect(parseBoolEnv("maybe")).toBeUndefined();
  });

  it("parses truthy values", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " On "]) {
      expect(parseBoolEnv(v)).toBe(true);
    }
  });

  it("parses falsy values", () => {
    for (const v of ["0", "false", "FALSE", "no", "off", " Off "]) {
      expect(parseBoolEnv(v)).toBe(false);
    }
  });
});

describe("isLoopbackAddress", () => {
  it("recognizes loopback addresses", () => {
    expect(isLoopbackAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackAddress("127.1.2.3")).toBe(true);
    expect(isLoopbackAddress("::1")).toBe(true);
    expect(isLoopbackAddress("::ffff:127.0.0.1")).toBe(true);
  });

  it("rejects non-loopback and empty addresses", () => {
    expect(isLoopbackAddress("10.0.0.1")).toBe(false);
    expect(isLoopbackAddress("192.168.1.1")).toBe(false);
    expect(isLoopbackAddress("::ffff:10.0.0.1")).toBe(false);
    expect(isLoopbackAddress("")).toBe(false);
    expect(isLoopbackAddress(null)).toBe(false);
    expect(isLoopbackAddress(undefined)).toBe(false);
  });
});

describe("resolveTrustLocalhost", () => {
  it("defaults off when auth is enforced", () => {
    expect(
      resolveTrustLocalhost({ envValue: undefined, enforceAuth: true })
    ).toBe(false);
  });

  it("defaults on when auth is not enforced", () => {
    expect(
      resolveTrustLocalhost({ envValue: undefined, enforceAuth: false })
    ).toBe(true);
  });

  it("explicit value overrides the default in both directions", () => {
    expect(
      resolveTrustLocalhost({ envValue: "true", enforceAuth: true })
    ).toBe(true);
    expect(
      resolveTrustLocalhost({ envValue: "false", enforceAuth: false })
    ).toBe(false);
  });

  it("falls back to the default for unrecognized values", () => {
    expect(
      resolveTrustLocalhost({ envValue: "garbage", enforceAuth: true })
    ).toBe(false);
  });
});

describe("parseTrustedProxies", () => {
  it("returns an empty list when unset or empty", () => {
    expect(parseTrustedProxies(undefined)).toEqual([]);
    expect(parseTrustedProxies("")).toEqual([]);
    expect(parseTrustedProxies("  ,  ")).toEqual([]);
  });

  it("splits and trims comma-separated entries", () => {
    expect(parseTrustedProxies("127.0.0.1, 10.0.0.0/8 ,::1")).toEqual([
      "127.0.0.1",
      "10.0.0.0/8",
      "::1"
    ]);
  });
});
