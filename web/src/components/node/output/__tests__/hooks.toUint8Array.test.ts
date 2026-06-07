import { describe, it, expect } from "@jest/globals";
import { toUint8Array } from "../hooks";

describe("toUint8Array", () => {
  describe("falsy inputs return undefined", () => {
    it("returns undefined for undefined", () => {
      expect(toUint8Array(undefined)).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(toUint8Array(null)).toBeUndefined();
    });

    it("returns undefined for 0", () => {
      expect(toUint8Array(0)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(toUint8Array("")).toBeUndefined();
    });
  });

  describe("Uint8Array input", () => {
    it("returns a Uint8Array with the same values", () => {
      const input = new Uint8Array([1, 2, 3]);
      const result = toUint8Array(input);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("returns a copy, not the same reference", () => {
      const input = new Uint8Array([1, 2, 3]);
      const result = toUint8Array(input);
      expect(result).not.toBe(input);
    });

    it("handles an empty Uint8Array", () => {
      const input = new Uint8Array([]);
      const result = toUint8Array(input);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toHaveLength(0);
    });

    it("handles a Uint8Array subarray (offset view) correctly", () => {
      const backing = new Uint8Array([10, 20, 30, 40, 50]);
      const subarray = backing.subarray(1, 4); // [20, 30, 40]
      const result = toUint8Array(subarray);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([20, 30, 40]));
      expect(result).toHaveLength(3);
    });
  });

  describe("other ArrayBufferView input", () => {
    it("converts an Int8Array to Uint8Array with the same byte values", () => {
      const input = new Int8Array([10, 20, 30]);
      const result = toUint8Array(input);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([10, 20, 30]));
    });
  });

  describe("ArrayBuffer input", () => {
    it("wraps an ArrayBuffer in a Uint8Array", () => {
      const buffer = new ArrayBuffer(4);
      const result = toUint8Array(buffer);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toHaveLength(4);
    });
  });

  describe("array of numbers input", () => {
    it("converts a number array to Uint8Array", () => {
      const result = toUint8Array([65, 66, 67]);
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).toEqual(new Uint8Array([65, 66, 67]));
    });
  });

  describe("unsupported types return undefined", () => {
    it("returns undefined for a non-empty string", () => {
      expect(toUint8Array("not a buffer")).toBeUndefined();
    });

    it("returns undefined for a plain object", () => {
      expect(toUint8Array({ foo: "bar" })).toBeUndefined();
    });
  });
});
