/**
 * Tests for T-MSG-7: Wrap primitives.
 */
import { describe, it, expect } from "vitest";
import { wrapPrimitive, unwrapPrimitive } from "../src/wrap-primitives.js";

describe("T-MSG-7: wrapPrimitive / unwrapPrimitive", () => {
  describe("wrapPrimitive", () => {
    it("wraps integer", () => {
      expect(wrapPrimitive(42)).toEqual({ type: "int", value: 42 });
    });

    it("wraps negative integer", () => {
      expect(wrapPrimitive(-7)).toEqual({ type: "int", value: -7 });
    });

    it("wraps zero as int", () => {
      expect(wrapPrimitive(0)).toEqual({ type: "int", value: 0 });
    });

    it("wraps float", () => {
      expect(wrapPrimitive(3.14)).toEqual({ type: "float", value: 3.14 });
    });

    it("wraps string", () => {
      expect(wrapPrimitive("hello")).toEqual({ type: "str", value: "hello" });
    });

    it("wraps empty string", () => {
      expect(wrapPrimitive("")).toEqual({ type: "str", value: "" });
    });

    it("wraps true", () => {
      expect(wrapPrimitive(true)).toEqual({ type: "bool", value: true });
    });

    it("wraps false", () => {
      expect(wrapPrimitive(false)).toEqual({ type: "bool", value: false });
    });
  });

  describe("unwrapPrimitive", () => {
    it("unwraps int", () => {
      expect(unwrapPrimitive({ type: "int", value: 42 })).toBe(42);
    });

    it("unwraps float", () => {
      expect(unwrapPrimitive({ type: "float", value: 3.14 })).toBe(3.14);
    });

    it("unwraps str", () => {
      expect(unwrapPrimitive({ type: "str", value: "hello" })).toBe("hello");
    });

    it("unwraps bool", () => {
      expect(unwrapPrimitive({ type: "bool", value: true })).toBe(true);
    });

    it("unwraps false bool", () => {
      expect(unwrapPrimitive({ type: "bool", value: false })).toBe(false);
    });
  });

  describe("round-trip", () => {
    it("round-trips integer", () => {
      expect(unwrapPrimitive(wrapPrimitive(42))).toBe(42);
    });

    it("round-trips float", () => {
      expect(unwrapPrimitive(wrapPrimitive(3.14))).toBe(3.14);
    });

    it("round-trips string", () => {
      expect(unwrapPrimitive(wrapPrimitive("hello"))).toBe("hello");
    });

    it("round-trips boolean", () => {
      expect(unwrapPrimitive(wrapPrimitive(true))).toBe(true);
    });

    it("round-trips zero", () => {
      expect(unwrapPrimitive(wrapPrimitive(0))).toBe(0);
    });

    it("round-trips empty string", () => {
      expect(unwrapPrimitive(wrapPrimitive(""))).toBe("");
    });

    it("round-trips false", () => {
      expect(unwrapPrimitive(wrapPrimitive(false))).toBe(false);
    });
  });
});
