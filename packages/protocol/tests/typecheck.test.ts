/**
 * Tests for T-META-3: Type validation.
 */
import { describe, it, expect } from "vitest";
import { validateType } from "../src/typecheck.js";

describe("T-META-3: validateType", () => {
  describe("int", () => {
    it("accepts integer number", () => {
      expect(validateType(42, "int")).toEqual({ valid: true });
    });

    it("rejects float for int", () => {
      const r = validateType(3.14, "int");
      expect(r.valid).toBe(false);
      expect(r.error).toBeDefined();
    });

    it("rejects string for int", () => {
      expect(validateType("x", "int").valid).toBe(false);
    });

    it("accepts zero", () => {
      expect(validateType(0, "int")).toEqual({ valid: true });
    });

    it("accepts negative integer", () => {
      expect(validateType(-5, "int")).toEqual({ valid: true });
    });
  });

  describe("float / number", () => {
    it("accepts float number", () => {
      expect(validateType(3.14, "float")).toEqual({ valid: true });
    });

    it("accepts integer as float", () => {
      expect(validateType(42, "float")).toEqual({ valid: true });
    });

    it("rejects string for float", () => {
      expect(validateType("x", "float").valid).toBe(false);
    });

    it("accepts number type", () => {
      expect(validateType(3.14, "number")).toEqual({ valid: true });
    });

    it("rejects boolean for number", () => {
      expect(validateType(true, "number").valid).toBe(false);
    });
  });

  describe("str / string", () => {
    it("accepts string", () => {
      expect(validateType("hello", "str")).toEqual({ valid: true });
    });

    it("accepts empty string", () => {
      expect(validateType("", "str")).toEqual({ valid: true });
    });

    it("rejects number for str", () => {
      expect(validateType(42, "str").valid).toBe(false);
    });

    it("accepts string type alias", () => {
      expect(validateType("hello", "string")).toEqual({ valid: true });
    });
  });

  describe("bool / boolean", () => {
    it("accepts true", () => {
      expect(validateType(true, "bool")).toEqual({ valid: true });
    });

    it("accepts false", () => {
      expect(validateType(false, "bool")).toEqual({ valid: true });
    });

    it("rejects number for bool", () => {
      expect(validateType(1, "bool").valid).toBe(false);
    });

    it("accepts boolean type alias", () => {
      expect(validateType(true, "boolean")).toEqual({ valid: true });
    });
  });

  describe("list[X]", () => {
    it("accepts valid list[int]", () => {
      expect(validateType([1, 2, 3], "list[int]")).toEqual({ valid: true });
    });

    it("rejects mixed list for list[int]", () => {
      const r = validateType([1, "x"], "list[int]");
      expect(r.valid).toBe(false);
    });

    it("accepts empty array for list[int]", () => {
      expect(validateType([], "list[int]")).toEqual({ valid: true });
    });

    it("rejects non-array for list[int]", () => {
      expect(validateType(42, "list[int]").valid).toBe(false);
    });

    it("validates nested list[str]", () => {
      expect(validateType(["a", "b"], "list[str]")).toEqual({ valid: true });
    });

    it("rejects invalid nested list[str]", () => {
      expect(validateType(["a", 1], "list[str]").valid).toBe(false);
    });

    it("validates list[float]", () => {
      expect(validateType([1.1, 2.2], "list[float]")).toEqual({ valid: true });
    });
  });

  describe("any", () => {
    it("accepts number", () => {
      expect(validateType(42, "any")).toEqual({ valid: true });
    });

    it("accepts string", () => {
      expect(validateType("hello", "any")).toEqual({ valid: true });
    });

    it("accepts null", () => {
      expect(validateType(null, "any")).toEqual({ valid: true });
    });

    it("accepts undefined", () => {
      expect(validateType(undefined, "any")).toEqual({ valid: true });
    });

    it("accepts array", () => {
      expect(validateType([1, "a"], "any")).toEqual({ valid: true });
    });

    it("accepts object", () => {
      expect(validateType({ a: 1 }, "any")).toEqual({ valid: true });
    });
  });

  describe("edge cases", () => {
    it("rejects null for int", () => {
      expect(validateType(null, "int").valid).toBe(false);
    });

    it("rejects undefined for str", () => {
      expect(validateType(undefined, "str").valid).toBe(false);
    });

    it("unknown type passes (no validation possible)", () => {
      expect(validateType({ foo: 1 }, "ImageRef")).toEqual({ valid: true });
    });
  });
});
