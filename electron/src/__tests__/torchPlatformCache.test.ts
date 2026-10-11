import {
  getSavedTorchPlatform,
  getTorchBackend,
  saveTorchPlatform,
  torchBackendArgs,
} from "../torchPlatformCache";
import { readSettings, updateSetting } from "../settings";

jest.mock("../settings");
jest.mock("../logger");

const mockReadSettings = jest.mocked(readSettings);
const mockUpdateSetting = jest.mocked(updateSetting);

describe("torchPlatformCache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSavedTorchPlatform", () => {
    it("returns null when nothing is saved", () => {
      mockReadSettings.mockReturnValue({});
      expect(getSavedTorchPlatform()).toBeNull();
    });

    it("derives the backend from the saved platform with the current mapping", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: "cu124",
          // An index saved by an older version is ignored.
          indexUrl: "https://download.pytorch.org/whl/cu124",
          detectedAt: "2024-01-01T00:00:00.000Z",
        },
      });

      expect(getSavedTorchPlatform()).toMatchObject({
        platform: "cu124",
        backend: "cu126",
        indexUrl: "https://download.pytorch.org/whl/cu126",
      });
    });

    it("ignores a saved failed detection so the next install detects again", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: "cpu",
          indexUrl: "https://download.pytorch.org/whl/cpu",
          error: "torchruntime failed",
        },
      });

      expect(getSavedTorchPlatform()).toBeNull();
      expect(getTorchBackend()).toBeNull();
    });

    it("returns null for invalid saved data", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: { platform: 123 },
      });

      expect(getSavedTorchPlatform()).toBeNull();
    });

    it("handles settings read errors", () => {
      mockReadSettings.mockImplementation(() => {
        throw new Error("Failed to read settings");
      });

      expect(getSavedTorchPlatform()).toBeNull();
    });
  });

  describe("torchBackendArgs", () => {
    it("passes the backend to uv, or nothing for PyPI wheels", () => {
      expect(torchBackendArgs("cu128")).toEqual(["--torch-backend", "cu128"]);
      expect(torchBackendArgs(null)).toEqual([]);
    });
  });

  describe("saveTorchPlatform", () => {
    it("saves the detected platform", () => {
      mockUpdateSetting.mockImplementation(() => {});

      saveTorchPlatform({
        platform: "cu128",
        backend: "cu128",
        indexUrl: "https://download.pytorch.org/whl/cu128",
      });

      expect(mockUpdateSetting).toHaveBeenCalledWith("TORCH_PLATFORM_DETECTED", {
        platform: "cu128",
        detectedAt: expect.any(String),
      });
    });

    it("does not save a failed detection", () => {
      saveTorchPlatform({
        platform: "unknown",
        backend: "auto",
        indexUrl: null,
        error: "Detection failed",
      });

      expect(mockUpdateSetting).not.toHaveBeenCalled();
    });
  });
});
