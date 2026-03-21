/**
 * @jest-environment node
 */
import * as Binary from "../binary";
const { uint8ArrayToBase64, uint8ArrayToDataUri, base64ErrorImage } = Binary;

describe("binary utilities", () => {
  describe("uint8ArrayToBase64", () => {
    it("converts Uint8Array to base64", () => {
      const arr = new Uint8Array([72, 101, 108, 108, 111]);
      expect(uint8ArrayToBase64(arr)).toBe("SGVsbG8=");
    });

    it("handles empty array", () => {
      const arr = new Uint8Array([]);
      expect(uint8ArrayToBase64(arr)).toBe("");
    });

    it("handles binary data", () => {
      const arr = new Uint8Array([0, 1, 2, 255, 254, 253]);
      const result = uint8ArrayToBase64(arr);
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });

    it("returns fallback image when base64 conversion fails", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const originalBtoa = global.btoa;
      (global as any).btoa = () => {
        throw new Error("fail");
      };
      
      const result = uint8ArrayToBase64(new Uint8Array([1]));
      expect(result).toBe(base64ErrorImage);
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error converting Uint8Array to Base64:",
        expect.any(Error)
      );
      
      global.btoa = originalBtoa;
      consoleSpy.mockRestore();
    });
  });

  describe("uint8ArrayToDataUri", () => {
    it("creates data URI from Uint8Array", () => {
      const arr = new Uint8Array([72, 101, 108, 108, 111]);
      expect(uint8ArrayToDataUri(arr, "text/plain")).toBe(
        "data:text/plain;base64,SGVsbG8="
      );
    });

    it("handles different MIME types", () => {
      const arr = new Uint8Array([137, 80, 78, 71]); // PNG header
      const result = uint8ArrayToDataUri(arr, "image/png");
      expect(result).toMatch(/^data:image\/png;base64,/);
    });

    it("handles empty data", () => {
      const arr = new Uint8Array([]);
      const result = uint8ArrayToDataUri(arr, "text/plain");
      expect(result).toBe("data:text/plain;base64,");
    });

    it("handles conversion failures gracefully", () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();
      const originalBtoa = global.btoa;
      (global as any).btoa = () => {
        throw new Error("fail");
      };
      
      // When uint8ArrayToBase64 fails, it returns base64ErrorImage
      // So uint8ArrayToDataUri will include that in the data URI
      const result = uint8ArrayToDataUri(new Uint8Array([1]), "text/plain");
      expect(result).toBe(`data:text/plain;base64,${base64ErrorImage}`);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        "Error converting Uint8Array to Base64:",
        expect.any(Error)
      );
      
      global.btoa = originalBtoa;
      consoleSpy.mockRestore();
    });
  });

  describe("base64ErrorImage", () => {
    it("should be a valid data URI", () => {
      expect(base64ErrorImage).toMatch(/^data:image\/png;base64,/);
    });
  });
});
