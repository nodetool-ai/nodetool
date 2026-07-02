import { describe, it, expect } from "vitest";
import {
  parseBoolEnv,
  isLoopbackAddress,
  resolveTrustLocalhost,
  parseTrustedProxies,
  parseTrustedLocalNetworks,
  isIpInCidr,
  isTrustedLocalAddress
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

describe("parseTrustedLocalNetworks", () => {
  it("parses like the proxy list", () => {
    expect(parseTrustedLocalNetworks(undefined)).toEqual([]);
    expect(parseTrustedLocalNetworks("172.16.0.0/12, 0.0.0.0/0")).toEqual([
      "172.16.0.0/12",
      "0.0.0.0/0"
    ]);
  });
});

describe("isIpInCidr", () => {
  it("matches the wildcard ranges against anything", () => {
    expect(isIpInCidr("172.17.0.1", "0.0.0.0/0")).toBe(true);
    expect(isIpInCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(isIpInCidr("2001:db8::1", "::/0")).toBe(true);
  });

  it("matches the Docker bridge range (the real fix)", () => {
    // Docker rewrites published-port sources to the bridge gateway.
    expect(isIpInCidr("172.17.0.1", "172.16.0.0/12")).toBe(true);
    expect(isIpInCidr("172.31.255.254", "172.16.0.0/12")).toBe(true);
    // Node often reports the IPv4-mapped IPv6 form for bridged peers.
    expect(isIpInCidr("::ffff:172.18.0.1", "172.16.0.0/12")).toBe(true);
  });

  it("rejects addresses outside the range", () => {
    expect(isIpInCidr("192.168.1.5", "172.16.0.0/12")).toBe(false);
    expect(isIpInCidr("172.15.0.1", "172.16.0.0/12")).toBe(false);
    expect(isIpInCidr("172.32.0.1", "172.16.0.0/12")).toBe(false);
  });

  it("treats a bare IP as a /32", () => {
    expect(isIpInCidr("10.1.2.3", "10.1.2.3")).toBe(true);
    expect(isIpInCidr("10.1.2.4", "10.1.2.3")).toBe(false);
  });

  it("returns false for empty/malformed input", () => {
    expect(isIpInCidr(null, "0.0.0.0/0")).toBe(false);
    expect(isIpInCidr("172.17.0.1", "")).toBe(false);
    expect(isIpInCidr("172.17.0.1", "172.16.0.0/99")).toBe(false);
  });

  it("rejects a trailing-slash CIDR instead of degrading to /0", () => {
    expect(isIpInCidr("8.8.8.8", "172.16.0.0/")).toBe(false);
    expect(isIpInCidr("172.17.0.1", "172.16.0.0/")).toBe(false);
  });
});

describe("isTrustedLocalAddress", () => {
  it("is true when any configured network matches", () => {
    const nets = parseTrustedLocalNetworks("10.0.0.0/8, 172.16.0.0/12");
    expect(isTrustedLocalAddress("172.17.0.1", nets)).toBe(true);
    expect(isTrustedLocalAddress("10.9.9.9", nets)).toBe(true);
    expect(isTrustedLocalAddress("192.168.1.1", nets)).toBe(false);
  });

  it("is false with no configured networks", () => {
    expect(isTrustedLocalAddress("172.17.0.1", [])).toBe(false);
  });
});
