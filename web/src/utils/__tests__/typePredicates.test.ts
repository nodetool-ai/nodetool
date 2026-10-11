import {
  isArray,
  isBoolean,
  isFiniteNumber,
  isFunction,
  isNonEmptyString,
  isNumber,
  isObjectLike,
  isRecord,
  isString
} from "../typePredicates";

describe("typePredicates", () => {
  it("isString and isNonEmptyString", () => {
    expect(isString("")).toBe(true);
    expect(isString(1)).toBe(false);
    expect(isNonEmptyString("a")).toBe(true);
    expect(isNonEmptyString("")).toBe(false);
    expect(isNonEmptyString(null)).toBe(false);
  });

  it("isNumber accepts NaN but isFiniteNumber does not", () => {
    expect(isNumber(NaN)).toBe(true);
    expect(isNumber("1")).toBe(false);
    expect(isFiniteNumber(1)).toBe(true);
    expect(isFiniteNumber(NaN)).toBe(false);
    expect(isFiniteNumber(-Infinity)).toBe(false);
    expect(isFiniteNumber("1")).toBe(false);
  });

  it("isBoolean", () => {
    expect(isBoolean(false)).toBe(true);
    expect(isBoolean(0)).toBe(false);
  });

  it("isArray", () => {
    expect(isArray([])).toBe(true);
    expect(isArray({ length: 0 })).toBe(false);
  });

  it("isRecord excludes null and arrays, isObjectLike excludes only null", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isObjectLike([])).toBe(true);
    expect(isObjectLike({})).toBe(true);
    expect(isObjectLike(null)).toBe(false);
    expect(isObjectLike("x")).toBe(false);
  });

  it("isFunction", () => {
    expect(isFunction(() => 1)).toBe(true);
    expect(isFunction({})).toBe(false);
  });
});
