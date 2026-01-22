import { isPathValid } from "../fileExplorer";

describe("fileExplorer", () => {
  describe("isPathValid", () => {
    describe("Valid POSIX Paths", () => {
      it("should accept absolute path", () => {
        expect(isPathValid("/home/user")).toBe(true);
      });

      it("should accept absolute path with subdirectories", () => {
        expect(isPathValid("/home/user/documents")).toBe(true);
      });

      it("should accept absolute path with trailing slash", () => {
        expect(isPathValid("/home/user/")).toBe(true);
      });

      it("should accept path with single character after slash", () => {
        expect(isPathValid("/a")).toBe(true);
      });
    });

    describe("Valid Windows Paths", () => {
      it("should accept Windows path with backslash", () => {
        expect(isPathValid("C:\\Users\\User")).toBe(true);
      });

      it("should accept Windows path with forward slash", () => {
        expect(isPathValid("C:/Users/User")).toBe(true);
      });

      it("should accept Windows path with mixed slashes", () => {
        expect(isPathValid("D:/Documents And Settings")).toBe(true);
      });

      it("should accept lowercase drive letter", () => {
        expect(isPathValid("c:\\users\\user")).toBe(true);
      });
    });

    describe("Valid Home-Relative Paths", () => {
      it("should accept home path with forward slash", () => {
        expect(isPathValid("~/Documents")).toBe(true);
      });

      it("should accept home path with subdirectories", () => {
        expect(isPathValid("~/Projects/MyApp")).toBe(true);
      });

      it("should accept home path with backslash", () => {
        expect(isPathValid("~\\Documents")).toBe(true);
      });
    });

    describe("Invalid Paths", () => {
      it("should reject empty string", () => {
        expect(isPathValid("")).toBe(false);
      });

      it("should reject null", () => {
        expect(isPathValid(null as unknown as string)).toBe(false);
      });

      it("should reject undefined", () => {
        expect(isPathValid(undefined as unknown as string)).toBe(false);
      });

      it("should reject relative paths", () => {
        expect(isPathValid("Documents")).toBe(false);
      });

      it("should reject relative paths with slashes", () => {
        expect(isPathValid("./Documents")).toBe(false);
      });

      it("should reject parent directory traversal", () => {
        expect(isPathValid("../Documents")).toBe(false);
      });

      it("should reject path with embedded parent traversal", () => {
        expect(isPathValid("/home/../etc")).toBe(false);
      });

      it("should reject single dot path", () => {
        expect(isPathValid("./")).toBe(false);
      });

      it("should reject tilde without slash", () => {
        expect(isPathValid("~")).toBe(false);
      });

      it("should reject just drive letter", () => {
        expect(isPathValid("C:")).toBe(false);
      });

      it("should reject drive letter without path", () => {
        expect(isPathValid("C:/")).toBe(false);
      });

      it("should reject root path alone", () => {
        expect(isPathValid("/")).toBe(false);
      });
    });

    describe("Edge Cases", () => {
      it("should accept very long paths", () => {
        const longPath = "/" + "a".repeat(1000);
        expect(isPathValid(longPath)).toBe(true);
      });

      it("should accept paths with special characters", () => {
        expect(isPathValid("/home/user/Documents (Copy)")).toBe(true);
      });

      it("should accept paths with hyphens and underscores", () => {
        expect(isPathValid("/home/user/my-project/file_name.txt")).toBe(true);
      });

      it("should accept paths with numbers", () => {
        expect(isPathValid("/home/user/Documents/12345")).toBe(true);
      });

      it("should accept paths with @ symbol", () => {
        expect(isPathValid("/home/user/@myapp")).toBe(true);
      });

      it("should accept paths with colons (non-drive)", () => {
        expect(isPathValid("/home/user/path:with:colons")).toBe(true);
      });
    });
  });
});
