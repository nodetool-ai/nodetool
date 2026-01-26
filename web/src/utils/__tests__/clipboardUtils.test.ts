import {
  getClipboardType,
  isClipboardSupported,
  getClipboardSupportMessage,
  copyAssetToClipboard
} from "../clipboardUtils";

// Mock loglevel
jest.mock("loglevel", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock fetch
global.fetch = jest.fn();

// Mock FileReader
class MockFileReader {
  onloadend: (() => void) | null = null;
  onerror: ((error: Error) => void) | null = null;
  result: string | null = null;

  readAsDataURL(_blob: Blob) {
    // Simulate successful read
    this.result = "data:image/png;base64,mockdata";
    setTimeout(() => {
      if (this.onloadend) {
        this.onloadend();
      }
    }, 0);
  }
}

(global as any).FileReader = MockFileReader;

describe("clipboardUtils", () => {
  describe("getClipboardType", () => {
    it("identifies image content types", () => {
      expect(getClipboardType("image/png")).toBe("image");
      expect(getClipboardType("image/jpeg")).toBe("image");
      expect(getClipboardType("image/gif")).toBe("image");
      expect(getClipboardType("image/svg+xml")).toBe("image");
      expect(getClipboardType("IMAGE/PNG")).toBe("image"); // case insensitive
    });

    it("identifies text content types", () => {
      expect(getClipboardType("text/plain")).toBe("text");
      expect(getClipboardType("text/csv")).toBe("text");
      expect(getClipboardType("application/json")).toBe("text");
      expect(getClipboardType("application/xml")).toBe("text");
      expect(getClipboardType("application/javascript")).toBe("text");
      expect(getClipboardType("application/typescript")).toBe("text");
    });

    it("handles text/html as text type (due to text/ prefix check)", () => {
      // text/html is matched by text/ check before html check
      expect(getClipboardType("text/html")).toBe("text");
    });

    it("identifies HTML content types", () => {
      // Note: text/html and application/xhtml+xml match other checks first
      // HTML is identified by types that contain "html" but don't match other checks
      expect(getClipboardType("application/html")).toBe("html");
      // application/xhtml+xml contains "xml" so it matches text check
      expect(getClipboardType("application/xhtml+xml")).toBe("text");
    });

    it("identifies video and audio as text (for URL copying)", () => {
      expect(getClipboardType("video/mp4")).toBe("text");
      expect(getClipboardType("video/webm")).toBe("text");
      expect(getClipboardType("audio/mp3")).toBe("text");
      expect(getClipboardType("audio/wav")).toBe("text");
    });

    it("returns unsupported for unknown types", () => {
      expect(getClipboardType("application/pdf")).toBe("unsupported");
      expect(getClipboardType("application/zip")).toBe("unsupported");
      expect(getClipboardType("application/octet-stream")).toBe("unsupported");
    });

    it("handles empty or invalid input", () => {
      expect(getClipboardType("")).toBe("unsupported");
      expect(getClipboardType(null as any)).toBe("unsupported");
      expect(getClipboardType(undefined as any)).toBe("unsupported");
    });

    it("handles edge cases", () => {
      expect(getClipboardType("text/javascript; charset=utf-8")).toBe("text");
      expect(getClipboardType("IMAGE/JPEG")).toBe("image"); // all caps
    });
  });

  describe("isClipboardSupported", () => {
    it("returns true for supported types", () => {
      expect(isClipboardSupported("image/png")).toBe(true);
      expect(isClipboardSupported("text/plain")).toBe(true);
      expect(isClipboardSupported("application/html")).toBe(true); // HTML
      expect(isClipboardSupported("video/mp4")).toBe(true);
      expect(isClipboardSupported("audio/wav")).toBe(true);
    });

    it("returns false for unsupported types", () => {
      expect(isClipboardSupported("application/pdf")).toBe(false);
      expect(isClipboardSupported("application/zip")).toBe(false);
      expect(isClipboardSupported("")).toBe(false);
    });
  });

  describe("getClipboardSupportMessage", () => {
    it("provides message for image types", () => {
      const message = getClipboardSupportMessage("image/png");
      expect(message).toContain("Image");
      expect(message).toContain("Photoshop");
    });

    it("provides message for HTML types", () => {
      const message = getClipboardSupportMessage("application/html");
      expect(message).toContain("HTML");
      expect(message).toContain("editors");
    });

    it("provides message for text types", () => {
      const message = getClipboardSupportMessage("text/plain");
      expect(message).toContain("Text");
      expect(message).toContain("pasted anywhere");
    });

    it("provides specific message for video types", () => {
      const message = getClipboardSupportMessage("video/mp4");
      expect(message).toContain("Media URL");
      expect(message).toContain("metadata");
    });

    it("provides specific message for audio types", () => {
      const message = getClipboardSupportMessage("audio/mp3");
      expect(message).toContain("Media URL");
      expect(message).toContain("metadata");
    });

    it("provides message for unsupported types", () => {
      const message = getClipboardSupportMessage("application/pdf");
      expect(message).toContain("cannot be copied");
    });
  });

  describe("copyAssetToClipboard", () => {
    let mockWriteImage: jest.Mock;
    let mockWriteHTML: jest.Mock;
    let mockWriteText: jest.Mock;

    beforeEach(() => {
      mockWriteImage = jest.fn().mockResolvedValue(undefined);
      mockWriteHTML = jest.fn().mockResolvedValue(undefined);
      mockWriteText = jest.fn().mockResolvedValue(undefined);

      // Ensure proper structure with non-undefined properties
      (window as any).api = {
        clipboard: {
          writeImage: mockWriteImage,
          writeHTML: mockWriteHTML,
          writeText: mockWriteText
        }
      };

      (global.fetch as jest.Mock).mockReset();
    });

    afterEach(() => {
      delete (window as any).api;
    });

    it("throws error when Electron API is not available", async () => {
      delete (window as any).api;

      await expect(
        copyAssetToClipboard("image/png", "data:image/png;base64,test")
      ).rejects.toThrow("Electron API not available");
    });

    it("throws error for unsupported content types", async () => {
      await expect(
        copyAssetToClipboard("application/pdf", "http://example.com/file.pdf")
      ).rejects.toThrow("Unsupported content type");
    });

    describe("image copying", () => {
      it("copies data URL images directly", async () => {
        const dataUrl = "data:image/png;base64,testdata";
        await copyAssetToClipboard("image/png", dataUrl);

        expect(mockWriteImage).toHaveBeenCalledWith(dataUrl);
      });

      it("fetches and converts regular URLs to data URLs", async () => {
        const blob = new Blob(["fake image data"], { type: "image/png" });
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          blob: () => Promise.resolve(blob)
        });

        await copyAssetToClipboard("image/png", "http://example.com/image.png");

        expect(global.fetch).toHaveBeenCalledWith("http://example.com/image.png");
        expect(mockWriteImage).toHaveBeenCalled();
        // The data URL should be the mocked FileReader result
        expect(mockWriteImage).toHaveBeenCalledWith(
          expect.stringContaining("data:image/png;base64")
        );
      });

      it("handles fetch errors for images", async () => {
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Network error"));

        await expect(
          copyAssetToClipboard("image/png", "http://example.com/image.png")
        ).rejects.toThrow();
      });
    });

    describe("HTML copying", () => {
      it("calls writeHTML when available", async () => {
        const htmlContent = "<html><body>Test</body></html>";
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          text: jest.fn().mockResolvedValue(htmlContent)
        });

        // Use application/html which is properly detected as HTML
        await copyAssetToClipboard("application/html", "http://example.com/page.html");

        expect(global.fetch).toHaveBeenCalledWith("http://example.com/page.html");
        expect(mockWriteHTML).toHaveBeenCalledWith(htmlContent);
      });

      it("falls back to writeText when writeHTML is not available", async () => {
        const htmlContent = "<html><body>Test</body></html>";
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          text: jest.fn().mockResolvedValue(htmlContent)
        });

        delete (window as any).api.clipboard.writeHTML;

        await copyAssetToClipboard("application/html", "http://example.com/page.html");

        expect(mockWriteText).toHaveBeenCalledWith(htmlContent);
      });
    });

    describe("text copying", () => {
      it("fetches and copies text content", async () => {
        const textContent = "Hello, world!";
        (global.fetch as jest.Mock).mockResolvedValueOnce({
          text: () => Promise.resolve(textContent)
        });

        await copyAssetToClipboard("text/plain", "http://example.com/file.txt");

        expect(global.fetch).toHaveBeenCalledWith("http://example.com/file.txt");
        expect(mockWriteText).toHaveBeenCalledWith(textContent);
      });

      it("copies video URL with metadata", async () => {
        const videoUrl = "http://example.com/video.mp4";
        const assetName = "My Video";

        await copyAssetToClipboard("video/mp4", videoUrl, assetName);

        expect(mockWriteText).toHaveBeenCalledWith(
          expect.stringContaining("Video: My Video")
        );
        expect(mockWriteText).toHaveBeenCalledWith(
          expect.stringContaining(videoUrl)
        );
      });

      it("copies audio URL with metadata", async () => {
        const audioUrl = "http://example.com/audio.mp3";
        const assetName = "My Audio";

        await copyAssetToClipboard("audio/mp3", audioUrl, assetName);

        expect(mockWriteText).toHaveBeenCalledWith(
          expect.stringContaining("Audio: My Audio")
        );
        expect(mockWriteText).toHaveBeenCalledWith(
          expect.stringContaining(audioUrl)
        );
      });

      it("copies video URL without name", async () => {
        const videoUrl = "http://example.com/video.mp4";

        await copyAssetToClipboard("video/mp4", videoUrl);

        expect(mockWriteText).toHaveBeenCalledWith(videoUrl);
      });

      it("falls back to URL if text fetch fails", async () => {
        const url = "http://example.com/file.txt";
        (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("Not found"));

        await copyAssetToClipboard("text/plain", url);

        expect(mockWriteText).toHaveBeenCalledWith(url);
      });
    });
  });
});
