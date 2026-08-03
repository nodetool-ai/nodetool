import { describe, it, expect } from "vitest";
import {
  typesIncompatible,
  valueIncompatibleWithType
} from "../src/type-compat.js";

describe("typesIncompatible", () => {
  it("flags clearly different scalars", () => {
    expect(typesIncompatible("str", "int")).toBe(true);
    expect(typesIncompatible("bool", "str")).toBe(true);
  });

  it("passes identical, numeric, permissive and generic types", () => {
    expect(typesIncompatible("str", "str")).toBe(false);
    expect(typesIncompatible("int", "float")).toBe(false);
    expect(typesIncompatible("str", "any")).toBe(false);
    expect(typesIncompatible("list[str]", "list[int]")).toBe(false);
    expect(typesIncompatible("", "int")).toBe(false);
  });

  // Regression: the editor's connection policy (web/src/utils/TypeHandler.ts)
  // allows these, so the validator must not contradict it.
  it("allows str ↔ enum, matching the editor", () => {
    expect(typesIncompatible("str", "enum")).toBe(false);
    expect(typesIncompatible("enum", "str")).toBe(false);
  });

  it("allows cv ↔ chunk, matching the editor", () => {
    expect(typesIncompatible("cv", "chunk")).toBe(false);
    expect(typesIncompatible("chunk", "cv")).toBe(false);
  });

  it("does not turn the allowed pairs into wildcards", () => {
    expect(typesIncompatible("enum", "int")).toBe(true);
    expect(typesIncompatible("cv", "str")).toBe(true);
    expect(typesIncompatible("chunk", "image")).toBe(true);
  });
});

describe("valueIncompatibleWithType — numbers", () => {
  it("rejects a non-integer in an int slot", () => {
    expect(valueIncompatibleWithType(3.5, "int")).toBe(true);
    expect(valueIncompatibleWithType(3, "int")).toBe(false);
    expect(valueIncompatibleWithType("3", "int")).toBe(true);
  });

  it("rejects non-finite numbers on both numeric types", () => {
    for (const type of ["int", "float"]) {
      expect(valueIncompatibleWithType(Number.NaN, type)).toBe(true);
      expect(valueIncompatibleWithType(Number.POSITIVE_INFINITY, type)).toBe(true);
      expect(valueIncompatibleWithType(Number.NEGATIVE_INFINITY, type)).toBe(true);
    }
  });

  it("accepts whole and fractional values in a float slot", () => {
    expect(valueIncompatibleWithType(3, "float")).toBe(false);
    expect(valueIncompatibleWithType(3.5, "float")).toBe(false);
    expect(valueIncompatibleWithType("3.5", "float")).toBe(true);
  });

  it("leaves null/undefined and containers alone", () => {
    expect(valueIncompatibleWithType(null, "int")).toBe(false);
    expect(valueIncompatibleWithType(undefined, "int")).toBe(false);
    expect(valueIncompatibleWithType(3.5, "list[int]")).toBe(false);
  });
});
