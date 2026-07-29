import {
  getClipboardType,
  isClipboardSupported,
  getClipboardSupportMessage
} from "./clipboardUtils";

describe("clipboardUtils", () => {
  describe("getClipboardType", () => {
    it("returns 'image' for image MIME types", () => {
      expect(getClipboardType("image/png")).toBe("image");
      expect(getClipboardType("image/jpeg")).toBe("image");
      expect(getClipboardType("image/webp")).toBe("image");
      expect(getClipboardType("image/svg+xml")).toBe("image");
    });

    it("returns 'text' for text MIME types", () => {
      expect(getClipboardType("text/plain")).toBe("text");
      expect(getClipboardType("text/csv")).toBe("text");
      expect(getClipboardType("text/markdown")).toBe("text");
    });

    it("returns 'text' for code-related MIME types", () => {
      expect(getClipboardType("application/json")).toBe("text");
      expect(getClipboardType("application/xml")).toBe("text");
      expect(getClipboardType("application/javascript")).toBe("text");
      expect(getClipboardType("application/typescript")).toBe("text");
    });

    it("returns 'text' for video and audio types", () => {
      expect(getClipboardType("video/mp4")).toBe("text");
      expect(getClipboardType("audio/mpeg")).toBe("text");
      expect(getClipboardType("video/webm")).toBe("text");
      expect(getClipboardType("audio/wav")).toBe("text");
    });

    it("returns 'text' for text/html (matches text/ prefix first)", () => {
      expect(getClipboardType("text/html")).toBe("text");
    });

    it("returns 'text' for xhtml+xml (xml match takes precedence over html)", () => {
      expect(getClipboardType("application/xhtml+xml")).toBe("text");
    });

    it("returns 'unsupported' for empty or unknown types", () => {
      expect(getClipboardType("")).toBe("unsupported");
      expect(getClipboardType("application/octet-stream")).toBe("unsupported");
      expect(getClipboardType("application/pdf")).toBe("unsupported");
    });

    it("is case-insensitive", () => {
      expect(getClipboardType("IMAGE/PNG")).toBe("image");
      expect(getClipboardType("Text/Plain")).toBe("text");
    });
  });

  describe("isClipboardSupported", () => {
    it("returns true for supported types", () => {
      expect(isClipboardSupported("image/png")).toBe(true);
      expect(isClipboardSupported("text/plain")).toBe(true);
      expect(isClipboardSupported("video/mp4")).toBe(true);
    });

    it("returns false for unsupported types", () => {
      expect(isClipboardSupported("application/octet-stream")).toBe(false);
      expect(isClipboardSupported("")).toBe(false);
    });
  });

  describe("getClipboardSupportMessage", () => {
    it("returns image message for image types", () => {
      expect(getClipboardSupportMessage("image/png")).toBe(
        "Image can be pasted into any image editor"
      );
    });

    it("returns text message for text types", () => {
      expect(getClipboardSupportMessage("text/plain")).toBe(
        "Text content can be pasted anywhere"
      );
    });

    it("returns media message for video/audio types", () => {
      expect(getClipboardSupportMessage("video/mp4")).toBe(
        "Media URL and metadata will be copied as text"
      );
      expect(getClipboardSupportMessage("audio/mpeg")).toBe(
        "Media URL and metadata will be copied as text"
      );
    });

    it("returns unsupported message for unknown types", () => {
      expect(getClipboardSupportMessage("application/octet-stream")).toBe(
        "This content type cannot be copied to clipboard"
      );
    });
  });
});
