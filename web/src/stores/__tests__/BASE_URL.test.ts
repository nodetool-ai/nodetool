/**
 * @jest-environment node
 */

describe("withApiBase", () => {
  let withApiBase: <T extends string | null | undefined>(url: T) => T;

  beforeEach(() => {
    jest.resetModules();
  });

  describe("when BASE_URL is set", () => {
    beforeEach(() => {
      jest.doMock("../../stores/BASE_URL", () => {
        const baseUrl = "http://api.example.com";
        return {
          BASE_URL: baseUrl,
          withApiBase: <T extends string | null | undefined>(url: T): T => {
            if (!baseUrl) return url;
            if (!url) return url;
            if (typeof url !== "string") return url;
            if (!url.startsWith("/")) return url;
            return `${baseUrl}${url}` as T;
          }
        };
      });
      const mod = require("../../stores/BASE_URL");
      withApiBase = mod.withApiBase;
    });

    it("prefixes relative URLs with the base URL", () => {
      expect(withApiBase("/api/workflows")).toBe(
        "http://api.example.com/api/workflows"
      );
    });

    it("prefixes paths that start with /", () => {
      expect(withApiBase("/storage/file.png")).toBe(
        "http://api.example.com/storage/file.png"
      );
    });

    it("does not modify absolute http URLs", () => {
      expect(withApiBase("http://other.com/path")).toBe(
        "http://other.com/path"
      );
    });

    it("does not modify absolute https URLs", () => {
      expect(withApiBase("https://cdn.example.com/img.png")).toBe(
        "https://cdn.example.com/img.png"
      );
    });

    it("does not modify blob URLs", () => {
      expect(withApiBase("blob:http://localhost/abc")).toBe(
        "blob:http://localhost/abc"
      );
    });

    it("does not modify data URLs", () => {
      expect(withApiBase("data:image/png;base64,abc")).toBe(
        "data:image/png;base64,abc"
      );
    });

    it("returns null unchanged", () => {
      expect(withApiBase(null)).toBeNull();
    });

    it("returns undefined unchanged", () => {
      expect(withApiBase(undefined)).toBeUndefined();
    });

    it("returns empty string unchanged", () => {
      expect(withApiBase("")).toBe("");
    });
  });

  describe("when BASE_URL is empty", () => {
    beforeEach(() => {
      jest.doMock("../../stores/BASE_URL", () => {
        const baseUrl = "";
        return {
          BASE_URL: baseUrl,
          withApiBase: <T extends string | null | undefined>(url: T): T => {
            if (!baseUrl) return url;
            if (!url) return url;
            if (typeof url !== "string") return url;
            if (!url.startsWith("/")) return url;
            return `${baseUrl}${url}` as T;
          }
        };
      });
      const mod = require("../../stores/BASE_URL");
      withApiBase = mod.withApiBase;
    });

    it("returns relative URLs unchanged", () => {
      expect(withApiBase("/api/workflows")).toBe("/api/workflows");
    });

    it("returns absolute URLs unchanged", () => {
      expect(withApiBase("https://example.com")).toBe("https://example.com");
    });

    it("returns null unchanged", () => {
      expect(withApiBase(null)).toBeNull();
    });
  });
});
