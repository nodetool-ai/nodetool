import { downloadPreviewAssets } from "../downloadPreviewAssets";
import { createAssetFile } from "../createAssetFile";

const mockCreateAssetFile = createAssetFile as jest.Mock;

jest.mock("../createAssetFile");

describe("downloadPreviewAssets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws error when no content available to download", async () => {
    await expect(
      downloadPreviewAssets({ nodeId: "test-node" })
    ).rejects.toThrow("No content available to download");
  });

  it("throws error when createAssetFile returns empty array", async () => {
    mockCreateAssetFile.mockResolvedValue([]);

    await expect(
      downloadPreviewAssets({
        nodeId: "test-node",
        previewValue: { data: "test" },
      })
    ).rejects.toThrow("No assets generated for download");
  });

  it("calls createAssetFile with previewValue", async () => {
    const mockFile = new File(["test"], "test.txt", { type: "text/plain" });
    mockCreateAssetFile.mockResolvedValue([{ file: mockFile, filename: "test.txt" }]);

    try {
      await downloadPreviewAssets({
        nodeId: "test-node",
        previewValue: { data: "test" },
      });
    } catch (_e) {
    }

    expect(mockCreateAssetFile).toHaveBeenCalledWith({ data: "test" }, "test-node");
  });

  it("calls createAssetFile with rawResult.output", async () => {
    const mockFile = new File(["test"], "test.txt", { type: "text/plain" });
    mockCreateAssetFile.mockResolvedValue([{ file: mockFile, filename: "test.txt" }]);

    try {
      await downloadPreviewAssets({
        nodeId: "test-node",
        rawResult: { output: "raw output" },
      });
    } catch (_e) {
    }

    expect(mockCreateAssetFile).toHaveBeenCalledWith("raw output", "test-node");
  });

  it("calls createAssetFile with rawResult directly", async () => {
    const mockFile = new File(["test"], "test.txt", { type: "text/plain" });
    mockCreateAssetFile.mockResolvedValue([{ file: mockFile, filename: "test.txt" }]);

    try {
      await downloadPreviewAssets({
        nodeId: "test-node",
        rawResult: "raw result string",
      });
    } catch (_e) {
    }

    expect(mockCreateAssetFile).toHaveBeenCalledWith("raw result string", "test-node");
  });

  it("prefers previewValue over rawResult", async () => {
    const mockFile = new File(["test"], "test.txt", { type: "text/plain" });
    mockCreateAssetFile.mockResolvedValue([{ file: mockFile, filename: "test.txt" }]);

    try {
      await downloadPreviewAssets({
        nodeId: "test-node",
        previewValue: "preview value",
        rawResult: { output: "raw output" },
      });
    } catch (_e) {
    }

    expect(mockCreateAssetFile).toHaveBeenCalledWith("preview value", "test-node");
  });

  it("falls back to URI when createAssetFile fails with URI available", async () => {
    mockCreateAssetFile.mockRejectedValue(new Error("Failed to create asset"));

    const mockAnchor = {
      href: "",
      download: "",
      click: jest.fn(),
    };

    const createElementSpy = jest.spyOn(document, "createElement").mockReturnValue(mockAnchor as unknown as HTMLAnchorElement);
    const appendChildSpy = jest.spyOn(document.body, "appendChild").mockImplementation();
    const removeChildSpy = jest.spyOn(document.body, "removeChild").mockImplementation();

    const consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();

    await downloadPreviewAssets({
      nodeId: "test-node",
      previewValue: { uri: "http://example.com/file.txt" },
    });

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "[downloadPreviewAssets] Falling back to direct URI download due to error",
      expect.any(Error)
    );
    expect(mockAnchor.href).toBe("http://example.com/file.txt");
    expect(mockAnchor.download).toBe("file.txt");
    expect(mockAnchor.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it("rethrows error when createAssetFile fails and no URI available", async () => {
    mockCreateAssetFile.mockRejectedValue(new Error("Creation failed"));

    await expect(
      downloadPreviewAssets({
        nodeId: "test-node",
        previewValue: { data: "test" },
      })
    ).rejects.toThrow("Creation failed");
  });
});
