import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import {
  openInExplorer,
  isPathValid,
  openHuggingfacePath,
  openOllamaPath,
  isFileExplorerAvailable
} from "../fileExplorer";
import { useNotificationStore } from "../../stores/NotificationStore";

const createMockApi = () => ({
  openModelPath: jest.fn(),
  openModelDirectory: jest.fn()
});

describe("fileExplorer", () => {
  const originalWindow = global.window;
  const addNotification = jest.fn();
  const mockApi = createMockApi();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, "warn").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    (useNotificationStore.setState as any)((state: any) => ({
      ...state,
      addNotification
    }));
    (global as any).window = {
      api: mockApi
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    mockApi.openModelPath.mockReset();
    mockApi.openModelDirectory.mockReset();
    addNotification.mockReset();
    if (originalWindow) {
      (global as any).window = originalWindow;
    }
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

  describe("electron integration", () => {
    it("isFileExplorerAvailable reflects window api presence", () => {
      expect(isFileExplorerAvailable()).toBe(true);
      delete (global as any).window.api;
      expect(isFileExplorerAvailable()).toBe(false);
    });
  });

  describe("openInExplorer", () => {
    it("should invoke Electron bridge for valid paths", async () => {
      mockApi.openModelPath.mockResolvedValue({ status: "success" });

      await openInExplorer("/home/user/documents");

      expect(mockApi.openModelPath).toHaveBeenCalledWith("/home/user/documents");
      expect(console.warn).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();
    });

    it("should warn and return early for empty paths", async () => {
      await openInExplorer("");
      expect(mockApi.openModelPath).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        "[fileExplorer] Tried to open an empty path in explorer."
      );
    });

    it("should warn and return early for invalid paths", async () => {
      await openInExplorer("../etc/passwd");

      expect(mockApi.openModelPath).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledWith(
        "[fileExplorer] Invalid path supplied, refusing to open explorer:",
        "../etc/passwd"
      );
    });

    it("should handle Electron errors gracefully", async () => {
      const error = new Error("IPC failure");
      mockApi.openModelPath.mockRejectedValueOnce(error);

      await openInExplorer("/home/user/documents");

      expect(mockApi.openModelPath).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        "[fileExplorer] Failed to open path in explorer:",
        error
      );
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          content: "Could not open folder in file explorer."
        })
      );
    });

    it("should work with Windows paths", async () => {
      mockApi.openModelPath.mockResolvedValue({ status: "success" });

      await openInExplorer("C:\\Users\\Documents");

      expect(mockApi.openModelPath).toHaveBeenCalledWith("C:\\Users\\Documents");
    });

    it("should work with home-relative paths", async () => {
      mockApi.openModelPath.mockResolvedValue({ status: "success" });

      await openInExplorer("~/Downloads");

      expect(mockApi.openModelPath).toHaveBeenCalledWith("~/Downloads");
    });

    it("should handle null/undefined paths", async () => {
      await openInExplorer(null as any);
      await openInExplorer(undefined as any);

      expect(mockApi.openModelPath).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledTimes(2);
    });

    it("should notify when bridge unavailable", async () => {
      delete (global as any).window.api;
      await openInExplorer("/home/user/documents");
      expect(addNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "warning"
        })
      );
    });
  });

  describe("open directory helpers", () => {
    it("opens HuggingFace folder through bridge", async () => {
      mockApi.openModelDirectory.mockResolvedValue({ status: "success" });
      await openHuggingfacePath();
      expect(mockApi.openModelDirectory).toHaveBeenCalledWith("huggingface");
    });

    it("opens Ollama folder through bridge", async () => {
      mockApi.openModelDirectory.mockResolvedValue({ status: "success" });
      await openOllamaPath();
      expect(mockApi.openModelDirectory).toHaveBeenCalledWith("ollama");
    });
  });
});
