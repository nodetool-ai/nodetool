/**
 * @jest-environment node
 */

import { normalizeNodeError, hasNodeError, nodeErrorToDisplayString } from "../ErrorStore";

describe("normalizeNodeError", () => {
  it("returns undefined for null", () => {
    expect(normalizeNodeError(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(normalizeNodeError(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeNodeError("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizeNodeError("   ")).toBeUndefined();
  });

  it('returns undefined for "null" string (case-insensitive)', () => {
    expect(normalizeNodeError("null")).toBeUndefined();
    expect(normalizeNodeError("Null")).toBeUndefined();
    expect(normalizeNodeError("NULL")).toBeUndefined();
  });

  it('returns undefined for "undefined" string (case-insensitive)', () => {
    expect(normalizeNodeError("undefined")).toBeUndefined();
    expect(normalizeNodeError("Undefined")).toBeUndefined();
    expect(normalizeNodeError("UNDEFINED")).toBeUndefined();
  });

  it("trims and returns non-empty strings", () => {
    expect(normalizeNodeError("  error message  ")).toBe("error message");
  });

  it("returns meaningful strings unchanged", () => {
    expect(normalizeNodeError("Connection failed")).toBe("Connection failed");
  });

  it("returns undefined for Error with empty message", () => {
    expect(normalizeNodeError(new Error(""))).toBeUndefined();
    expect(normalizeNodeError(new Error("   "))).toBeUndefined();
  });

  it("returns Error objects with non-empty messages", () => {
    const err = new Error("Something broke");
    expect(normalizeNodeError(err)).toBe(err);
  });

  it("returns record objects as-is", () => {
    const obj = { message: "error", code: 500 };
    expect(normalizeNodeError(obj)).toBe(obj);
  });
});

describe("hasNodeError", () => {
  it("returns false for null/undefined/empty", () => {
    expect(hasNodeError(null)).toBe(false);
    expect(hasNodeError(undefined)).toBe(false);
    expect(hasNodeError("")).toBe(false);
    expect(hasNodeError("null")).toBe(false);
    expect(hasNodeError("undefined")).toBe(false);
  });

  it("returns true for real errors", () => {
    expect(hasNodeError("Something went wrong")).toBe(true);
    expect(hasNodeError(new Error("fail"))).toBe(true);
    expect(hasNodeError({ message: "error" })).toBe(true);
  });
});

describe("nodeErrorToDisplayString", () => {
  it("returns empty string for falsy values", () => {
    expect(nodeErrorToDisplayString(null)).toBe("");
    expect(nodeErrorToDisplayString(undefined)).toBe("");
    expect(nodeErrorToDisplayString("")).toBe("");
    expect(nodeErrorToDisplayString("null")).toBe("");
  });

  it("returns string errors directly", () => {
    expect(nodeErrorToDisplayString("Connection timeout")).toBe("Connection timeout");
  });

  it("returns Error.message for Error objects", () => {
    expect(nodeErrorToDisplayString(new Error("Something broke"))).toBe("Something broke");
  });

  it("returns message field from record objects", () => {
    expect(nodeErrorToDisplayString({ message: "Custom error", code: 42 })).toBe("Custom error");
  });

  it("JSON.stringifies objects without a message field", () => {
    const obj = { code: 500, details: "internal" };
    expect(nodeErrorToDisplayString(obj)).toBe(JSON.stringify(obj));
  });
});
