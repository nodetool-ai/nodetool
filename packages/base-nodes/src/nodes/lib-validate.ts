/**
 * Text validation and sanitization nodes — pure-JS implementations.
 *
 * These replace the old `validator.js`-powered code snippets so the JS
 * sandbox can stay lib-free. The checks aim for "good-enough for workflow
 * use" rather than RFC-complete.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";

// ---------------------------------------------------------------------------
// Shared validators
// ---------------------------------------------------------------------------

// Practical email regex — rejects obvious garbage, accepts the common forms.
// Local part: letters/digits/._%+- . Domain: letters/digits/.- with an
// alphanumeric TLD of ≥2 characters.
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z][A-Za-z0-9-]*$/;

// Basic UUID v1-v5 shape.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const IPV4_SEGMENT_RE = /^(25[0-5]|2[0-4]\d|1\d\d|\d{1,2})$/;

const ALPHA_RE = /^[A-Za-z]+$/;
const ALPHANUMERIC_RE = /^[A-Za-z0-9]+$/;

export function isEmail(value: string): boolean {
  return typeof value === "string" && EMAIL_RE.test(value.trim());
}

export function isURL(value: string): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const u = new URL(value);
    // WHATWG URL accepts weird protocols — require http(s) or a scheme with authority
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && u.host.length > 0;
  } catch {
    return false;
  }
}

export function isIPv4(value: string): boolean {
  if (typeof value !== "string") return false;
  const parts = value.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => IPV4_SEGMENT_RE.test(p));
}

export function isIPv6(value: string): boolean {
  if (typeof value !== "string") return false;
  // Accept fully-written, "::"-compressed, and IPv4-suffixed forms.
  if (value.length < 2 || value.indexOf(":") === -1) return false;
  const groups = value.split("::");
  if (groups.length > 2) return false;
  const parts = value.replace("::", ":x:").split(":");
  // each chunk must be 1-4 hex chars (or our placeholder)
  return parts.every((p) => p === "" || p === "x" || /^[0-9a-fA-F]{1,4}$/.test(p));
}

export function isIP(value: string): boolean {
  return isIPv4(value) || isIPv6(value);
}

export function isUUID(value: string): boolean {
  return typeof value === "string" && UUID_RE.test(value);
}

export function isJSONString(value: string): boolean {
  if (typeof value !== "string") return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function isNumeric(value: string): boolean {
  if (typeof value !== "string" || value.trim() === "") return false;
  return !Number.isNaN(Number(value));
}

export function isAlpha(value: string): boolean {
  return typeof value === "string" && ALPHA_RE.test(value);
}

export function isAlphanumeric(value: string): boolean {
  return typeof value === "string" && ALPHANUMERIC_RE.test(value);
}

/** HTML-entity-escape `&`, `<`, `>`, `"`, `'` and `/`. Matches validator.escape. */
export function escapeHtml(value: string): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/** Lowercase + strip leading/trailing whitespace. Good enough for common normalisation. */
export function normalizeEmail(value: string): string {
  if (typeof value !== "string") return "";
  const v = value.trim().toLowerCase();
  return isEmail(v) ? v : "";
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export class ValidateEmailNode extends BaseNode {
  static readonly nodeType = "lib.validate.Email";
  static readonly title = "Validate Email";
  static readonly description =
    "Check whether a value is a syntactically valid email address.\n    validate, email, check";
  static readonly metadataOutputTypes = { output: "bool" };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: isEmail(String(this.value ?? "")) };
  }
}

export class ValidateURLNode extends BaseNode {
  static readonly nodeType = "lib.validate.URL";
  static readonly title = "Validate URL";
  static readonly description =
    "Check whether a value is a syntactically valid absolute URL.\n    validate, url, link, check";
  static readonly metadataOutputTypes = { output: "bool" };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: isURL(String(this.value ?? "")) };
  }
}

export class ValidateIPNode extends BaseNode {
  static readonly nodeType = "lib.validate.IP";
  static readonly title = "Validate IP Address";
  static readonly description =
    "Check whether a value is a valid IPv4 or IPv6 address.\n    validate, ip, ipv4, ipv6, address, network";
  static readonly metadataOutputTypes = {
    is_ip: "bool",
    is_ipv4: "bool",
    is_ipv6: "bool"
  };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const v = String(this.value ?? "");
    return {
      is_ip: isIP(v),
      is_ipv4: isIPv4(v),
      is_ipv6: isIPv6(v)
    };
  }
}

export class ValidateStringNode extends BaseNode {
  static readonly nodeType = "lib.validate.String";
  static readonly title = "Validate String";
  static readonly description =
    "Run several common string checks at once and return one bool per check.\n    validate, check, email, url, uuid, json, number";
  static readonly metadataOutputTypes = {
    is_email: "bool",
    is_url: "bool",
    is_uuid: "bool",
    is_json: "bool",
    is_numeric: "bool",
    is_alpha: "bool",
    is_alphanumeric: "bool"
  };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const v = String(this.value ?? "");
    return {
      is_email: isEmail(v),
      is_url: isURL(v),
      is_uuid: isUUID(v),
      is_json: isJSONString(v),
      is_numeric: isNumeric(v),
      is_alpha: isAlpha(v),
      is_alphanumeric: isAlphanumeric(v)
    };
  }
}

export class SanitizeStringNode extends BaseNode {
  static readonly nodeType = "lib.validate.Sanitize";
  static readonly title = "Sanitize String";
  static readonly description =
    "HTML-escape, trim, and lowercase/normalise a string. Also emits the normalised email when applicable.\n    sanitize, escape, html, xss, clean, trim";
  static readonly metadataOutputTypes = {
    escaped: "str",
    trimmed: "str",
    normalized_email: "str"
  };

  @prop({ type: "str", default: "", title: "Value" })
  declare value: any;

  async process(): Promise<Record<string, unknown>> {
    const v = String(this.value ?? "");
    return {
      escaped: escapeHtml(v),
      trimmed: v.trim(),
      normalized_email: normalizeEmail(v)
    };
  }
}

export const LIB_VALIDATE_NODES = [
  ValidateEmailNode,
  ValidateURLNode,
  ValidateIPNode,
  ValidateStringNode,
  SanitizeStringNode
] as const;
