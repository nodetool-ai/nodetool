import { describe, expect, it } from "vitest";
import {
  isBoolean,
  isCallable,
  isFiniteNumber,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isPositiveNumber,
  isRecord,
  isString
} from "../src/type-predicates.js";

describe("type predicates", () => {
  it("isString accepts only strings", () => {
    expect(isString("")).toBe(true);
    expect(isString("a")).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isString(new String("a"))).toBe(false);
    expect(isString(null)).toBe(false);
    expect(isString(undefined)).toBe(false);
  });

  it("isNonEmptyString rejects the empty string", () => {
    expect(isNonEmptyString("a")).toBe(true);
    expect(isNonEmptyString(" ")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString(0)).toBe(false);
  });

  it("isNumber accepts NaN and Infinity, isFiniteNumber does not", () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(Number.NaN)).toBe(true);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(true);
    expect(isNumber("1")).toBe(false);
    expect(isFiniteNumber(0)).toBe(true);
    expect(isFiniteNumber(Number.NaN)).toBe(false);
    expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("isPositiveNumber excludes zero, negatives and NaN", () => {
    expect(isPositiveNumber(0.5)).toBe(true);
    expect(isPositiveNumber(0)).toBe(false);
    expect(isPositiveNumber(-1)).toBe(false);
    expect(isPositiveNumber(Number.NaN)).toBe(false);
    expect(isPositiveNumber("1")).toBe(false);
  });

  it("isBoolean accepts only booleans", () => {
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(true)).toBe(true);
    expect(isBoolean(0)).toBe(false);
    expect(isBoolean(null)).toBe(false);
  });

  it("isObjectLike accepts arrays, isRecord rejects them", () => {
    expect(isObjectLike({})).toBe(true);
    expect(isObjectLike([])).toBe(true);
    expect(isObjectLike(null)).toBe(false);
    expect(isObjectLike(undefined)).toBe(false);
    expect(isObjectLike("a")).toBe(false);
    expect(isRecord({})).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
  });

  it("isObjectLike narrows an unknown enough to read a field", () => {
    const raw: unknown = { x: 1 };
    expect(isObjectLike(raw) && isNumber(raw.x)).toBe(true);
  });

  it("isCallable keeps the guarded value callable with its own arguments", () => {
    const host: { run?: (n: number) => number } = { run: (n) => n + 1 };
    expect(isCallable(host.run) ? host.run(1) : null).toBe(2);
    expect(isCallable(undefined)).toBe(false);
    expect(isCallable({})).toBe(false);
    expect(isCallable(class {})).toBe(true);
  });
});
