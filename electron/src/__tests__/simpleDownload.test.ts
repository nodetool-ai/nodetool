import { promises as fs } from "fs";
import { downloadFromFile } from "../download";

// Mock fs
jest.mock("fs", () => ({
  promises: {
    readFile: jest.fn(),
  },
}));

const mockFs = fs as jest.Mocked<typeof fs>;

describe("downloadFromFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should read file and return contents", async () => {
    const mockContent = "file content";
    mockFs.readFile.mockResolvedValue(mockContent);

    const result = await downloadFromFile("/test/path.txt");

    expect(result).toBe(mockContent);
    expect(mockFs.readFile).toHaveBeenCalledWith("/test/path.txt", "utf8");
  });

  it("should throw error with custom message on file read error", async () => {
    const originalError = new Error("ENOENT: no such file");
    mockFs.readFile.mockRejectedValue(originalError);

    await expect(downloadFromFile("/nonexistent/file.txt")).rejects.toThrow(
      "Failed to read file /nonexistent/file.txt: ENOENT: no such file"
    );
  });
});