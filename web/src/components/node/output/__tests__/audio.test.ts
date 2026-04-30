/**
 * @jest-environment node
 */
import { base64ToUint8Array, int16ToFloat32 } from "../audio";

describe("audio utilities", () => {
  describe("base64ToUint8Array", () => {
    it("decodes a simple base64 string", () => {
      // "AQID" is base64 for bytes [1, 2, 3]
      const result = base64ToUint8Array("AQID");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it("strips data URI prefix", () => {
      const result = base64ToUint8Array("data:audio/pcm;base64,AQID");
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it("handles empty string", () => {
      const result = base64ToUint8Array("");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it("strips whitespace from base64 input", () => {
      const result = base64ToUint8Array("AQ ID\n");
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it("handles longer payload", () => {
      const bytes = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        bytes[i] = i;
      }
      const b64 = Buffer.from(bytes).toString("base64");
      const result = base64ToUint8Array(b64);
      expect(Array.from(result)).toEqual(Array.from(bytes));
    });
  });

  describe("int16ToFloat32", () => {
    it("converts zero to zero", () => {
      const input = new Int16Array([0]);
      const result = int16ToFloat32(input);
      expect(result).toBeInstanceOf(Float32Array);
      expect(result[0]).toBe(0);
    });

    it("converts max positive (32767) to 1.0", () => {
      const input = new Int16Array([32767]);
      const result = int16ToFloat32(input);
      expect(result[0]).toBeCloseTo(1.0, 5);
    });

    it("converts min negative (-32768) to -1.0", () => {
      const input = new Int16Array([-32768]);
      const result = int16ToFloat32(input);
      expect(result[0]).toBeCloseTo(-1.0, 5);
    });

    it("converts negative values using /32768", () => {
      const input = new Int16Array([-16384]);
      const result = int16ToFloat32(input);
      expect(result[0]).toBeCloseTo(-0.5, 5);
    });

    it("converts positive values using /32767", () => {
      const input = new Int16Array([16384]);
      const result = int16ToFloat32(input);
      // 16384 / 32767 ≈ 0.500015
      expect(result[0]).toBeCloseTo(16384 / 32767, 5);
    });

    it("preserves array length", () => {
      const input = new Int16Array([0, 100, -100, 32767, -32768]);
      const result = int16ToFloat32(input);
      expect(result.length).toBe(5);
    });

    it("handles empty input", () => {
      const input = new Int16Array([]);
      const result = int16ToFloat32(input);
      expect(result.length).toBe(0);
    });
  });
});
