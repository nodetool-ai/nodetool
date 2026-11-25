import { describe, expect, it } from "vitest";
import { isFailedToolResult } from "../src/app-build/tool-loop.js";

describe("isFailedToolResult", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 0],
    ["a string", "error"],
    ["true", true],
    ["an empty array", []],
    ["an array holding an error object", [{ error: "x" }]],
    ["an empty object", {}],
    ["error undefined", { error: undefined }],
    ["error null", { error: null }],
    ["ok true", { ok: true }],
    ["ok undefined", { ok: undefined }],
    ["ok non-boolean falsy", { ok: 0 }],
    ["ok null", { ok: null }],
    ["error null and ok true", { error: null, ok: true }]
  ])("is not a failure for %s", (_label, result) => {
    expect(isFailedToolResult(result)).toBe(false);
  });

  it.each([
    ["an error message", { error: "boom" }],
    ["an empty error message, which tools use as a refusal sentinel", { error: "" }],
    ["error false", { error: false }],
    ["error 0", { error: 0 }],
    ["error NaN", { error: NaN }],
    ["an error object", { error: {} }],
    ["ok false", { ok: false }],
    ["ok false with error null", { ok: false, error: null }],
    ["error alongside ok true", { ok: true, error: "boom" }]
  ])("is a failure for %s", (_label, result) => {
    expect(isFailedToolResult(result)).toBe(true);
  });
});
