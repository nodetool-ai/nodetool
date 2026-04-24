/**
 * @jest-environment node
 */
import { sanitizeDisplayText } from "../sanitizeDisplayText";

describe("sanitizeDisplayText", () => {
  describe("base64 data URI replacement", () => {
    it("replaces a base64 data URI with a placeholder", () => {
      const input = "before data:image/png;base64,iVBORw0KGgo= after";
      const result = sanitizeDisplayText(input);
      expect(result).toContain("[image/png base64 omitted,");
      expect(result).toContain("chars]");
      expect(result).toContain("before");
      expect(result).toContain("after");
      expect(result).not.toContain("iVBORw0KGgo=");
    });

    it("replaces multiple data URIs", () => {
      const input =
        "img1: data:image/png;base64,AAAA img2: data:audio/wav;base64,BBBB";
      const result = sanitizeDisplayText(input);
      expect(result).toContain("[image/png base64 omitted,");
      expect(result).toContain("[audio/wav base64 omitted,");
    });

    it("handles data URI without explicit mime type", () => {
      const input = "data:;base64,AAAA";
      const result = sanitizeDisplayText(input);
      expect(result).toContain("[data base64 omitted,");
    });

    it("preserves text that is not a data URI", () => {
      const input = "Hello, world! No base64 here.";
      expect(sanitizeDisplayText(input)).toBe(input);
    });
  });

  describe("truncation", () => {
    it("does not truncate text shorter than maxLength", () => {
      const input = "short text";
      expect(sanitizeDisplayText(input, 100)).toBe(input);
    });

    it("does not truncate text exactly at maxLength", () => {
      const input = "a".repeat(2000);
      expect(sanitizeDisplayText(input)).toBe(input);
    });

    it("truncates text longer than maxLength", () => {
      const input = "a".repeat(2500);
      const result = sanitizeDisplayText(input);
      expect(result).toContain("... (truncated 500 chars)");
      expect(result.length).toBeLessThan(input.length);
    });

    it("uses custom maxLength", () => {
      const input = "a".repeat(50);
      const result = sanitizeDisplayText(input, 10);
      expect(result).toContain("... (truncated 40 chars)");
    });

    it("truncates after sanitizing data URIs", () => {
      const dataUri = "data:image/png;base64," + "A".repeat(5000);
      const result = sanitizeDisplayText(dataUri, 100);
      expect(result).not.toContain("AAAA");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      expect(sanitizeDisplayText("")).toBe("");
    });

    it("handles string that is only a data URI", () => {
      const input = "data:text/plain;base64,SGVsbG8=";
      const result = sanitizeDisplayText(input);
      expect(result).toContain("[text/plain base64 omitted,");
      expect(result).not.toContain("SGVsbG8=");
    });
  });
});
