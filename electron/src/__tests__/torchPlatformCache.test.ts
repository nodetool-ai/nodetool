import { getSavedTorchPlatform, getTorchIndexUrl, saveTorchPlatform } from "../torchPlatformCache";
import { readSettings, updateSetting } from "../settings";

jest.mock("../settings");
jest.mock("../logger");

const mockReadSettings = readSettings as jest.MockedFunction<typeof readSettings>;
const mockUpdateSetting = updateSetting as jest.MockedFunction<typeof updateSetting>;

describe("torchPlatformCache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getSavedTorchPlatform", () => {
    it("should return null when no settings are saved", () => {
      mockReadSettings.mockReturnValue({});
      expect(getSavedTorchPlatform()).toBeNull();
    });

    it("should return saved torch platform data", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: "cu129",
          indexUrl: "https://download.pytorch.org/whl/cu129",
          detectedAt: "2024-01-01T00:00:00.000Z",
        },
      });

      const result = getSavedTorchPlatform();
      expect(result).toMatchObject({
        platform: "cu129",
        indexUrl: "https://download.pytorch.org/whl/cu129",
      });
    });

    it("should return null for invalid saved data", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: 123, // Invalid type
          indexUrl: "https://download.pytorch.org/whl/cu129",
        },
      });

      expect(getSavedTorchPlatform()).toBeNull();
    });

    it("should handle settings read errors gracefully", () => {
      mockReadSettings.mockImplementation(() => {
        throw new Error("Failed to read settings");
      });

      expect(getSavedTorchPlatform()).toBeNull();
    });
  });

  describe("getTorchIndexUrl", () => {
    it("should return saved index URL when available", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: "rocm6.2",
          indexUrl: "https://download.pytorch.org/whl/rocm6.2",
        },
      });

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/rocm6.2");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should fallback to CPU when no saved data", () => {
      mockReadSettings.mockReturnValue({});

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/cpu");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should fallback to CPU on macOS when no saved data", () => {
      mockReadSettings.mockReturnValue({});

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/cpu");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });
  });

  describe("saveTorchPlatform", () => {
    it("should save torch platform to settings", () => {
      mockUpdateSetting.mockImplementation(() => {});

      saveTorchPlatform({
        platform: "cu129",
        indexUrl: "https://download.pytorch.org/whl/cu129",
      });

      expect(mockUpdateSetting).toHaveBeenCalledWith("TORCH_PLATFORM_DETECTED", {
        platform: "cu129",
        indexUrl: "https://download.pytorch.org/whl/cu129",
        detectedAt: expect.any(String),
        error: undefined,
      });
    });

    it("should save error in platform result", () => {
      mockUpdateSetting.mockImplementation(() => {});

      saveTorchPlatform({
        platform: "cpu",
        indexUrl: "https://download.pytorch.org/whl/cpu",
        error: "Detection failed",
      });

      expect(mockUpdateSetting).toHaveBeenCalledWith("TORCH_PLATFORM_DETECTED", {
        platform: "cpu",
        indexUrl: "https://download.pytorch.org/whl/cpu",
        detectedAt: expect.any(String),
        error: "Detection failed",
      });
    });
  });
});
