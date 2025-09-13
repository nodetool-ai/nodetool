import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { openInExplorer, isPathValid } from "../fileExplorer";
import { client } from "../../stores/ApiClient";

// Mock the ApiClient
jest.mock("../../stores/ApiClient", () => ({
  client: {
    POST: jest.fn()
  }
}));

describe("fileExplorer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("isPathValid", () => {
    it("should return false for empty strings", () => {
      expect(isPathValid("")).toBe(false);
      expect(isPathValid(null as any)).toBe(false);
      expect(isPathValid(undefined as any)).toBe(false);
    });

    it("should reject paths with directory traversal", () => {
      expect(isPathValid("../etc/passwd")).toBe(false);
      expect(isPathValid("/home/../../../etc")).toBe(false);
      expect(isPathValid("C:\\Users\\..\\..\\Windows")).toBe(false);
      expect(isPathValid("~/../../root")).toBe(false);
      expect(isPathValid("./../../file")).toBe(false);
    });

    it("should accept valid POSIX absolute paths", () => {
      expect(isPathValid("/home/user/documents")).toBe(true);
      expect(isPathValid("/usr/local/bin")).toBe(true);
      expect(isPathValid("/tmp/file.txt")).toBe(true);
      expect(isPathValid("/")).toBe(false); // Single slash doesn't match pattern
      expect(isPathValid("/a")).toBe(true);
    });

    it("should accept valid Windows absolute paths", () => {
      expect(isPathValid("C:\\Users\\Documents")).toBe(true);
      expect(isPathValid("C:/Users/Documents")).toBe(true);
      expect(isPathValid("D:\\Projects\\app")).toBe(true);
      expect(isPathValid("E:/temp/file.txt")).toBe(true);
      expect(isPathValid("Z:\\")).toBe(false); // Just drive letter with slash
      expect(isPathValid("C:\\a")).toBe(true);
    });

    it("should accept home-relative paths", () => {
      expect(isPathValid("~/Documents")).toBe(true);
      expect(isPathValid("~\\Desktop")).toBe(true);
      expect(isPathValid("~/projects/app")).toBe(true);
      expect(isPathValid("~")).toBe(false); // Just tilde doesn't match
      expect(isPathValid("~/a")).toBe(true);
    });

    it("should reject invalid paths", () => {
      expect(isPathValid("relative/path")).toBe(false);
      expect(isPathValid("./relative")).toBe(false);
      expect(isPathValid("file.txt")).toBe(false);
      expect(isPathValid("C:")).toBe(false);
      expect(isPathValid("C:file.txt")).toBe(false); // Missing slash after colon
      expect(isPathValid("1:/path")).toBe(false); // Invalid drive letter
      expect(isPathValid("CC:/path")).toBe(false); // Two-letter drive
    });

    it("should handle case insensitive Windows drive letters", () => {
      expect(isPathValid("c:\\users")).toBe(true);
      expect(isPathValid("C:\\users")).toBe(true);
      expect(isPathValid("z:/temp")).toBe(true);
      expect(isPathValid("Z:/temp")).toBe(true);
    });
  });

  describe("openInExplorer", () => {
    it("should call API for valid paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;
      mockPost.mockResolvedValueOnce({ data: { success: true } } as any);

      await openInExplorer("/home/user/documents");

      expect(mockPost).toHaveBeenCalledWith("/api/models/open_in_explorer", {
        params: { query: { path: "/home/user/documents" } }
      });
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("should warn and return early for empty paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;

      await openInExplorer("");

      expect(mockPost).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        "[fileExplorer] Tried to open an empty path in explorer."
      );
    });

    it("should warn and return early for invalid paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;

      await openInExplorer("../etc/passwd");

      expect(mockPost).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        "[fileExplorer] Invalid path supplied, refusing to open explorer:",
        "../etc/passwd"
      );
    });

    it("should handle API errors gracefully", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;
      const error = new Error("Network error");
      mockPost.mockRejectedValueOnce(error);

      await openInExplorer("/home/user/documents");

      expect(mockPost).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "[fileExplorer] Failed to open path in explorer:",
        error
      );
    });

    it("should work with Windows paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;
      mockPost.mockResolvedValueOnce({ data: { success: true } } as any);

      await openInExplorer("C:\\Users\\Documents");

      expect(mockPost).toHaveBeenCalledWith("/api/models/open_in_explorer", {
        params: { query: { path: "C:\\Users\\Documents" } }
      });
    });

    it("should work with home-relative paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;
      mockPost.mockResolvedValueOnce({ data: { success: true } } as any);

      await openInExplorer("~/Downloads");

      expect(mockPost).toHaveBeenCalledWith("/api/models/open_in_explorer", {
        params: { query: { path: "~/Downloads" } }
      });
    });

    it("should handle null/undefined paths", async () => {
      const mockPost = client.POST as jest.MockedFunction<typeof client.POST>;

      await openInExplorer(null as any);
      await openInExplorer(undefined as any);

      expect(mockPost).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(2);
    });
  });
});