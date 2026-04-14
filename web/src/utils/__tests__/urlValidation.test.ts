import { describe, it, expect } from "@jest/globals";
import {
  validateAssetUrl,
  validateFetchUrl,
  sanitizeImageUrl
} from "../urlValidation";

describe("urlValidation", () => {
  describe("validateAssetUrl", () => {
    describe("returns false for empty / non-string inputs", () => {
      it("rejects null", () => {
        expect(validateAssetUrl(null)).toBe(false);
      });

      it("rejects undefined", () => {
        expect(validateAssetUrl(undefined)).toBe(false);
      });

      it("rejects empty string", () => {
        expect(validateAssetUrl("")).toBe(false);
      });
    });

    describe("returns true for allowed protocols", () => {
      it("accepts http URLs", () => {
        expect(validateAssetUrl("http://example.com/image.jpg")).toBe(true);
      });

      it("accepts https URLs", () => {
        expect(validateAssetUrl("https://example.com/image.png")).toBe(true);
      });

      it("accepts blob URLs", () => {
        expect(
          validateAssetUrl("blob:http://localhost/550e8400-e29b-41d4-a716-446655440000")
        ).toBe(true);
      });
    });

    describe("returns false for disallowed protocols", () => {
      it("rejects javascript: URLs", () => {
        expect(validateAssetUrl("javascript:alert('xss')")).toBe(false);
      });

      it("rejects data: URLs", () => {
        expect(validateAssetUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
      });

      it("rejects ftp: URLs", () => {
        expect(validateAssetUrl("ftp://files.example.com/file.png")).toBe(false);
      });

      it("rejects vbscript: URLs", () => {
        expect(validateAssetUrl("vbscript:MsgBox('hi')")).toBe(false);
      });
    });

    describe("injection-attempt rejection", () => {
      it("rejects URLs that contain 'javascript:' as a substring", () => {
        expect(validateAssetUrl("https://evil.com/path?url=javascript:alert(1)")).toBe(
          false
        );
      });

      it("rejects URLs that contain 'data:' as a substring", () => {
        expect(validateAssetUrl("https://evil.com/path?url=data:text/html,hi")).toBe(false);
      });
    });

    describe("rejects other blocked schemes", () => {
      it("rejects file: URLs", () => {
        expect(validateAssetUrl("file:///etc/passwd")).toBe(false);
      });
    });
  });

  describe("validateFetchUrl", () => {
    describe("returns false for empty / non-string inputs", () => {
      it("rejects null", () => {
        expect(validateFetchUrl(null)).toBe(false);
      });

      it("rejects undefined", () => {
        expect(validateFetchUrl(undefined)).toBe(false);
      });

      it("rejects empty string", () => {
        expect(validateFetchUrl("")).toBe(false);
      });
    });

    describe("accepts external http/https URLs", () => {
      it("accepts https to public host", () => {
        expect(validateFetchUrl("https://api.example.com/endpoint")).toBe(true);
      });

      it("accepts http to public host", () => {
        expect(validateFetchUrl("http://api.example.com/data")).toBe(true);
      });
    });

    describe("blocks non-http/https protocols", () => {
      it("rejects ftp", () => {
        expect(validateFetchUrl("ftp://files.example.com/file")).toBe(false);
      });

      it("rejects blob", () => {
        expect(
          validateFetchUrl("blob:http://localhost/550e8400-e29b-41d4-a716-446655440000")
        ).toBe(false);
      });
    });

    describe("blocks private/internal hosts (SSRF prevention)", () => {
      it("rejects localhost by name", () => {
        expect(validateFetchUrl("http://localhost/api")).toBe(false);
      });

      it("rejects 127.0.0.1", () => {
        expect(validateFetchUrl("http://127.0.0.1/api")).toBe(false);
      });

      it("rejects 192.168.x.x private range", () => {
        expect(validateFetchUrl("http://192.168.1.1/resource")).toBe(false);
      });

      it("rejects 10.x.x.x private range", () => {
        expect(validateFetchUrl("http://10.0.0.1/resource")).toBe(false);
      });

      it("rejects 172.16.x.x private range", () => {
        expect(validateFetchUrl("http://172.16.0.1/resource")).toBe(false);
      });

      it("rejects 169.254.x.x link-local addresses", () => {
        expect(validateFetchUrl("http://169.254.169.254/metadata")).toBe(false);
      });

      it("rejects .local mDNS domains", () => {
        expect(validateFetchUrl("http://printer.local/settings")).toBe(false);
      });
    });

    describe("blocks injection attempts", () => {
      it("rejects URLs containing 'javascript:'", () => {
        expect(
          validateFetchUrl("https://evil.com?q=javascript:alert(1)")
        ).toBe(false);
      });

      it("rejects URLs containing 'data:'", () => {
        expect(validateFetchUrl("https://evil.com?q=data:text/html,hi")).toBe(false);
      });
    });

    describe("returns false for syntactically invalid URLs", () => {
      it("rejects non-URL strings", () => {
        expect(validateFetchUrl("not a url")).toBe(false);
      });
    });
  });

  describe("sanitizeImageUrl", () => {
    it("returns the URL when it passes validation", () => {
      expect(sanitizeImageUrl("https://cdn.example.com/photo.jpg")).toBe(
        "https://cdn.example.com/photo.jpg"
      );
    });

    it("returns undefined for null input", () => {
      expect(sanitizeImageUrl(null)).toBeUndefined();
    });

    it("returns undefined for undefined input", () => {
      expect(sanitizeImageUrl(undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(sanitizeImageUrl("")).toBeUndefined();
    });

    it("returns undefined for a javascript: URL", () => {
      expect(sanitizeImageUrl("javascript:alert('xss')")).toBeUndefined();
    });

    it("returns the blob URL when valid", () => {
      const blobUrl = "blob:http://localhost/abc123";
      expect(sanitizeImageUrl(blobUrl)).toBe(blobUrl);
    });
  });
});
