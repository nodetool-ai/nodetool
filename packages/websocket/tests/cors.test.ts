/**
 * Tests for cors.ts — config-driven origin allow-listing shared by the
 * global fastifyCors plugin, the storage endpoint, and the MCP HTTP server.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  corsOriginDelegate,
  isOriginAllowed,
  resetCorsConfig,
  resolveAllowedOrigin
} from "../src/cors.js";

const ENV_KEY = "NODETOOL_ALLOWED_ORIGINS";

beforeEach(() => {
  delete process.env[ENV_KEY];
  resetCorsConfig();
});

afterEach(() => {
  delete process.env[ENV_KEY];
  resetCorsConfig();
});

describe("isOriginAllowed — defaults", () => {
  it("allows a missing origin (non-browser clients, same-origin)", () => {
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed(null)).toBe(true);
    expect(isOriginAllowed("")).toBe(true);
  });

  it("allows localhost / 127.0.0.1 / [::1] on any port", () => {
    expect(isOriginAllowed("http://localhost:3000")).toBe(true);
    expect(isOriginAllowed("http://localhost:7777")).toBe(true);
    expect(isOriginAllowed("https://localhost")).toBe(true);
    expect(isOriginAllowed("http://127.0.0.1:5173")).toBe(true);
    expect(isOriginAllowed("http://[::1]:7777")).toBe(true);
  });

  it("allows the Electron renderer (file://)", () => {
    expect(isOriginAllowed("file://")).toBe(true);
    expect(isOriginAllowed("file:///index.html")).toBe(true);
  });

  it("rejects unknown remote origins", () => {
    expect(isOriginAllowed("https://evil.example.com")).toBe(false);
    expect(isOriginAllowed("http://attacker.test")).toBe(false);
    // look-alike that must not match the localhost pattern
    expect(isOriginAllowed("http://localhost.evil.com")).toBe(false);
    expect(isOriginAllowed("http://127.0.0.1.evil.com")).toBe(false);
  });
});

describe("isOriginAllowed — NODETOOL_ALLOWED_ORIGINS", () => {
  it("allows exact origins listed in the env var", () => {
    process.env[ENV_KEY] = "https://app.example.com, https://studio.example.com";
    resetCorsConfig();
    expect(isOriginAllowed("https://app.example.com")).toBe(true);
    expect(isOriginAllowed("https://studio.example.com")).toBe(true);
    expect(isOriginAllowed("https://other.example.com")).toBe(false);
  });

  it("treats `*` as allow-all (opt-in for trusted deployments)", () => {
    process.env[ENV_KEY] = "*";
    resetCorsConfig();
    expect(isOriginAllowed("https://anything.example.com")).toBe(true);
  });

  it("still allows the built-in defaults alongside configured origins", () => {
    process.env[ENV_KEY] = "https://app.example.com";
    resetCorsConfig();
    expect(isOriginAllowed("http://localhost:3000")).toBe(true);
  });
});

describe("resolveAllowedOrigin", () => {
  it("reflects an allowed origin", () => {
    expect(resolveAllowedOrigin("http://localhost:3000")).toBe(
      "http://localhost:3000"
    );
  });

  it("returns null for a disallowed origin (header omitted)", () => {
    expect(resolveAllowedOrigin("https://evil.example.com")).toBeNull();
  });

  it("returns null for a missing origin", () => {
    expect(resolveAllowedOrigin(undefined)).toBeNull();
    expect(resolveAllowedOrigin(null)).toBeNull();
  });
});

describe("corsOriginDelegate", () => {
  it("permits allowed origins", () => {
    let result: boolean | undefined;
    corsOriginDelegate("http://localhost:3000", (_err, allow) => {
      result = allow;
    });
    expect(result).toBe(true);
  });

  it("rejects disallowed origins", () => {
    let result: boolean | undefined;
    corsOriginDelegate("https://evil.example.com", (_err, allow) => {
      result = allow;
    });
    expect(result).toBe(false);
  });

  it("permits requests with no origin header", () => {
    let result: boolean | undefined;
    corsOriginDelegate(undefined, (_err, allow) => {
      result = allow;
    });
    expect(result).toBe(true);
  });
});
