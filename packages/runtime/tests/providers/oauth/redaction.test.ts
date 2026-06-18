import { describe, it, expect } from "vitest";
import { redactToken, redactObject } from "../../../src/providers/oauth/redaction.js";

describe("redactToken", () => {
  it("collapses short or empty values entirely", () => {
    expect(redactToken("")).toBe("<redacted>");
    expect(redactToken(null)).toBe("<redacted>");
    expect(redactToken("short")).toBe("<redacted>");
  });

  it("keeps a short non-reversible prefix for longer values", () => {
    const out = redactToken("sk-1234567890abcdef");
    expect(out).toContain("<redacted>");
    expect(out).not.toContain("567890abcdef");
    expect(out.startsWith("sk-1")).toBe(true);
  });
});

describe("redactObject", () => {
  it("scrubs sensitive keys at any depth", () => {
    const input = {
      token_type: "Bearer",
      access_token: "secret-a",
      nested: { refresh_token: "secret-b", scope: "openid" },
      list: [{ code: "secret-c" }]
    };
    const out = redactObject(input) as Record<string, unknown>;
    expect(out.token_type).toBe("Bearer");
    expect(out.access_token).toBe("<redacted>");
    expect((out.nested as Record<string, unknown>).refresh_token).toBe("<redacted>");
    expect((out.nested as Record<string, unknown>).scope).toBe("openid");
    expect((out.list as Array<Record<string, unknown>>)[0].code).toBe("<redacted>");
  });

  it("does not throw on circular structures", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => redactObject(a)).not.toThrow();
    const out = redactObject(a) as Record<string, unknown>;
    expect(out.self).toBe("[Circular]");
  });
});
