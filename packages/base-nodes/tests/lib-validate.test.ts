/**
 * Tests for lib-validate.ts — text validation & sanitization nodes that
 * replace the old validator.js-powered code snippets.
 */

import { describe, it, expect } from "vitest";
import {
  ValidateEmailNode,
  ValidateURLNode,
  ValidateIPNode,
  ValidateStringNode,
  SanitizeStringNode,
  LIB_VALIDATE_NODES,
  isEmail,
  isURL,
  isIPv4,
  isIPv6,
  isIP,
  isUUID,
  isJSONString,
  isNumeric,
  isAlpha,
  isAlphanumeric,
  escapeHtml,
  normalizeEmail
} from "../src/nodes/lib-validate.js";

// ---------------------------------------------------------------------------
// Pure validators
// ---------------------------------------------------------------------------

describe("isEmail", () => {
  it("accepts common formats", () => {
    expect(isEmail("user@example.com")).toBe(true);
    expect(isEmail("u+tag@sub.example.co.uk")).toBe(true);
  });
  it("rejects obvious junk", () => {
    expect(isEmail("")).toBe(false);
    expect(isEmail("not-an-email")).toBe(false);
    expect(isEmail("a@b")).toBe(false);
    expect(isEmail("a @b.co")).toBe(false);
    expect(isEmail("@b.co")).toBe(false);
  });
  it("trims leading/trailing whitespace", () => {
    expect(isEmail("  user@example.com  ")).toBe(true);
  });
});

describe("isURL", () => {
  it("accepts http/https URLs", () => {
    expect(isURL("https://example.com")).toBe(true);
    expect(isURL("http://example.com/a/b?q=1")).toBe(true);
  });
  it("accepts custom schemes with authority", () => {
    expect(isURL("ftp://ftp.example.com")).toBe(true);
  });
  it("rejects bare hosts and junk", () => {
    expect(isURL("example.com")).toBe(false);
    expect(isURL("not a url")).toBe(false);
    expect(isURL("")).toBe(false);
  });
});

describe("isIPv4/isIPv6/isIP", () => {
  it("accepts valid IPv4", () => {
    expect(isIPv4("192.168.1.1")).toBe(true);
    expect(isIPv4("0.0.0.0")).toBe(true);
    expect(isIPv4("255.255.255.255")).toBe(true);
  });
  it("rejects invalid IPv4", () => {
    expect(isIPv4("256.0.0.0")).toBe(false);
    expect(isIPv4("1.2.3")).toBe(false);
    expect(isIPv4("abc.def.ghi.jkl")).toBe(false);
  });
  it("accepts valid IPv6 (shorthand & compressed)", () => {
    expect(isIPv6("::1")).toBe(true);
    expect(isIPv6("2001:db8::")).toBe(true);
    expect(isIPv6("fe80::1")).toBe(true);
  });
  it("rejects invalid IPv6", () => {
    expect(isIPv6("gggg::1")).toBe(false);
    expect(isIPv6("1::2::3")).toBe(false);
    expect(isIPv6("")).toBe(false);
  });
  it("isIP is the union", () => {
    expect(isIP("1.2.3.4")).toBe(true);
    expect(isIP("::1")).toBe(true);
    expect(isIP("nope")).toBe(false);
  });
});

describe("isUUID", () => {
  it("accepts canonical v4 uuids", () => {
    expect(isUUID("9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d")).toBe(true);
  });
  it("rejects non-uuid shapes", () => {
    expect(isUUID("not-a-uuid")).toBe(false);
    expect(isUUID("")).toBe(false);
  });
});

describe("isJSONString / isNumeric / isAlpha / isAlphanumeric", () => {
  it("isJSONString parses valid JSON", () => {
    expect(isJSONString('{"a":1}')).toBe(true);
    expect(isJSONString("[1,2,3]")).toBe(true);
  });
  it("isJSONString rejects invalid JSON", () => {
    expect(isJSONString("{a:1}")).toBe(false);
    expect(isJSONString("undefined")).toBe(false);
  });
  it("isNumeric accepts integers and floats as strings", () => {
    expect(isNumeric("42")).toBe(true);
    expect(isNumeric("-1.5")).toBe(true);
    expect(isNumeric("abc")).toBe(false);
    expect(isNumeric("")).toBe(false);
  });
  it("isAlpha / isAlphanumeric", () => {
    expect(isAlpha("Hello")).toBe(true);
    expect(isAlpha("Hello1")).toBe(false);
    expect(isAlphanumeric("Hello1")).toBe(true);
    expect(isAlphanumeric("Hello 1")).toBe(false);
  });
});

describe("escapeHtml / normalizeEmail", () => {
  it("escapes HTML-sensitive characters", () => {
    expect(escapeHtml('<a href="x">&y</a>')).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;y&lt;&#x2F;a&gt;"
    );
  });
  it("normalizeEmail lowercases and trims", () => {
    expect(normalizeEmail("  User@Example.COM  ")).toBe("user@example.com");
  });
  it("normalizeEmail returns empty string for invalid input", () => {
    expect(normalizeEmail("not-an-email")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

describe("ValidateEmailNode", () => {
  it("returns true for a valid email", async () => {
    const node = new ValidateEmailNode({ value: "a@b.co" });
    expect(await node.process()).toEqual({ output: true });
  });
  it("returns false for garbage", async () => {
    const node = new ValidateEmailNode({ value: "nope" });
    expect(await node.process()).toEqual({ output: false });
  });
});

describe("ValidateURLNode", () => {
  it("returns true for https URLs", async () => {
    const node = new ValidateURLNode({ value: "https://example.com" });
    expect(await node.process()).toEqual({ output: true });
  });
  it("returns false for bare hostnames", async () => {
    const node = new ValidateURLNode({ value: "example.com" });
    expect(await node.process()).toEqual({ output: false });
  });
});

describe("ValidateIPNode", () => {
  it("reports ipv4", async () => {
    const node = new ValidateIPNode({ value: "192.168.1.1" });
    expect(await node.process()).toEqual({
      is_ip: true,
      is_ipv4: true,
      is_ipv6: false
    });
  });
  it("reports ipv6", async () => {
    const node = new ValidateIPNode({ value: "::1" });
    expect(await node.process()).toEqual({
      is_ip: true,
      is_ipv4: false,
      is_ipv6: true
    });
  });
});

describe("ValidateStringNode", () => {
  it("returns a full set of boolean flags", async () => {
    const node = new ValidateStringNode({
      value: "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"
    });
    const out = await node.process();
    expect(out.is_uuid).toBe(true);
    expect(out.is_email).toBe(false);
    expect(out.is_url).toBe(false);
    expect(out.is_json).toBe(false);
    expect(out.is_numeric).toBe(false);
    expect(out.is_alpha).toBe(false);
    expect(out.is_alphanumeric).toBe(false);
  });
});

describe("SanitizeStringNode", () => {
  it("escapes html, trims, and normalises email-like input", async () => {
    const node = new SanitizeStringNode({
      value: "  <b>User@Example.COM</b>  "
    });
    const out = await node.process();
    expect(out.escaped).toBe(
      "  &lt;b&gt;User@Example.COM&lt;&#x2F;b&gt;  "
    );
    expect(out.trimmed).toBe("<b>User@Example.COM</b>");
    expect(out.normalized_email).toBe("");
  });
  it("returns a normalised email for plain input", async () => {
    const node = new SanitizeStringNode({ value: "  Foo@BAR.com  " });
    const out = await node.process();
    expect(out.normalized_email).toBe("foo@bar.com");
  });
});

// ---------------------------------------------------------------------------
// Export bundle
// ---------------------------------------------------------------------------

describe("LIB_VALIDATE_NODES export", () => {
  it("includes exactly the exported classes", () => {
    expect(LIB_VALIDATE_NODES).toHaveLength(5);
    const types = LIB_VALIDATE_NODES.map((n) => n.nodeType);
    expect(types).toEqual([
      "lib.validate.Email",
      "lib.validate.URL",
      "lib.validate.IP",
      "lib.validate.String",
      "lib.validate.Sanitize"
    ]);
  });
});
