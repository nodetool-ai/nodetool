import { describe, it, expect } from "vitest";

import { isFiniteNumber, isJsonObject } from "../src/json-wire.js";

describe("isJsonObject", () => {
  it("accepts a plain object", () => {
    expect(isJsonObject({ a: 1 })).toBe(true);
    expect(isJsonObject({})).toBe(true);
  });

  it("rejects null, arrays, and primitives", () => {
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject([{ a: 1 }])).toBe(false);
    expect(isJsonObject("object")).toBe(false);
    expect(isJsonObject(1)).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });
});

describe("isFiniteNumber", () => {
  it("accepts finite numbers, zero included", () => {
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(-3.5)).toBe(true);
  });

  it("rejects non-finite numbers and numeric strings", () => {
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isFiniteNumber("12")).toBe(false);
    expect(isFiniteNumber(null)).toBe(false);
  });
});
