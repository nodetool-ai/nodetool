import { getSavedTorchPlatform, getTorchIndexUrl } from "../torchPlatformCache";
import { readSettings } from "../settings";

jest.mock("../settings");
jest.mock("../logger");

const mockReadSettings = readSettings as jest.MockedFunction<typeof readSettings>;

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
          requiresDirectML: false,
          detectedAt: "2024-01-01T00:00:00.000Z",
        },
      });

      const result = getSavedTorchPlatform();
      expect(result).toMatchObject({
        platform: "cu129",
        indexUrl: "https://download.pytorch.org/whl/cu129",
        requiresDirectML: false,
      });
    });

    it("should return null for invalid saved data", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: 123, // Invalid type
          indexUrl: "https://download.pytorch.org/whl/cu129",
          requiresDirectML: false,
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
          requiresDirectML: false,
        },
      });

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/rocm6.2");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should fallback to CUDA on non-macOS when no saved data", () => {
      mockReadSettings.mockReturnValue({});

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "linux" });

      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/cu126");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should return null for macOS when no saved data", () => {
      mockReadSettings.mockReturnValue({});

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "darwin" });

      expect(getTorchIndexUrl()).toBeNull();

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should handle DirectML platform with null indexUrl", () => {
      mockReadSettings.mockReturnValue({
        TORCH_PLATFORM_DETECTED: {
          platform: "directml",
          indexUrl: null,
          requiresDirectML: true,
        },
      });

      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", { value: "win32" });

      // Should fall back to default behavior since indexUrl is null
      expect(getTorchIndexUrl()).toBe("https://download.pytorch.org/whl/cu126");

      Object.defineProperty(process, "platform", { value: originalPlatform });
    });
  });
});
