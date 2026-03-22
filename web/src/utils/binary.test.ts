import {
  uint8ArrayToBase64,
  uint8ArrayToDataUri
} from "./binary";

describe("binary", () => {
  describe("uint8ArrayToBase64", () => {
    it("converts empty array to empty base64", () => {
      const result = uint8ArrayToBase64(new Uint8Array([]));
      expect(result).toBe("");
    });

    it("converts Uint8Array to base64", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToBase64(data);
      expect(result).toBe("SGVsbG8=");
    });

    it("handles binary data", () => {
      const data = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const result = uint8ArrayToBase64(data);
      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("uint8ArrayToDataUri", () => {
    it("creates data URI with correct format", () => {
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      const result = uint8ArrayToDataUri(data, "text/plain");
      expect(result).toBe("data:text/plain;base64,SGVsbG8=");
    });

    it("creates image data URI", () => {
      const data = new Uint8Array([0, 0, 0, 0]); // Minimal PNG-like data
      const result = uint8ArrayToDataUri(data, "image/png");
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it("creates PDF data URI", () => {
      const data = new Uint8Array([37, 80, 68, 70]); // "%PDF"
      const result = uint8ArrayToDataUri(data, "application/pdf");
      expect(result).toBe("data:application/pdf;base64,JVBERg==");
    });
  });
});
