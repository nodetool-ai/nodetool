import { promises as fs } from "fs";

// Mock dependencies  
jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

jest.mock("../events", () => ({
  emitUpdateProgress: jest.fn(),
}));

jest.mock("../utils", () => ({
  checkPermissions: jest.fn().mockResolvedValue({ accessible: true, error: null }),
}));

import { downloadFromFile } from "../download";
import { logMessage } from "../logger";
import { checkPermissions } from "../utils";

// Type assertion for mocked fs.promises
const mockReadFile = jest.fn();
(fs.readFile as jest.Mock) = mockReadFile;

describe("download", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("downloadFromFile", () => {
    it("should read file contents and return as string", async () => {
      mockReadFile.mockResolvedValueOnce("file content here");

      const result = await downloadFromFile("/path/to/file.txt");

      expect(result).toBe("file content here");
      expect(mockReadFile).toHaveBeenCalledWith("/path/to/file.txt", "utf8");
    });

    it("should throw error when file read fails", async () => {
      mockReadFile.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(downloadFromFile("/path/to/file.txt")).rejects.toThrow(
        "Failed to read file /path/to/file.txt: Permission denied"
      );
    });

    it("should handle ENOENT errors", async () => {
      const error = new Error("ENOENT: no such file or directory");
      mockReadFile.mockRejectedValueOnce(error);

      await expect(downloadFromFile("/nonexistent/file.txt")).rejects.toThrow(
        "Failed to read file /nonexistent/file.txt: ENOENT: no such file or directory"
      );
    });
  });
});
