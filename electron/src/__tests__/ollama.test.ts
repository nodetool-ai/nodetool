// Mock the config module
jest.mock("../config", () => ({
  getOllamaPath: jest.fn().mockReturnValue("/mock/ollama/binary"),
  getOllamaModelsPath: jest.fn().mockReturnValue("/mock/ollama/models"),
}));

// Mock the logger module
jest.mock("../logger", () => ({
  logMessage: jest.fn(),
}));

// Mock the server module (dynamic import)
const mockIsOllamaResponsive = jest.fn().mockResolvedValue(true);
const mockIsOllamaRunning = jest.fn().mockResolvedValue(false);

jest.mock("../server", () => ({
  isOllamaResponsive: mockIsOllamaResponsive,
  isOllamaRunning: mockIsOllamaRunning,
}));

import {
  DEFAULT_OLLAMA_PORT,
  resolveOllamaBinary,
  resolveOllamaModelsDirectory,
  logOllamaMessage,
  checkOllamaAvailability,
  isBundledOllamaRunning,
} from "../ollama";
import { getOllamaPath, getOllamaModelsPath } from "../config";
import { logMessage } from "../logger";

describe("ollama", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("DEFAULT_OLLAMA_PORT", () => {
    it("should be 11435", () => {
      expect(DEFAULT_OLLAMA_PORT).toBe(11435);
    });
  });

  describe("resolveOllamaBinary", () => {
    it("should return the Ollama binary path from config", () => {
      const result = resolveOllamaBinary();

      expect(result).toBe("/mock/ollama/binary");
      expect(getOllamaPath).toHaveBeenCalled();
    });
  });

  describe("resolveOllamaModelsDirectory", () => {
    it("should return the Ollama models directory from config", () => {
      const result = resolveOllamaModelsDirectory();

      expect(result).toBe("/mock/ollama/models");
      expect(getOllamaModelsPath).toHaveBeenCalled();
    });
  });

  describe("logOllamaMessage", () => {
    it("should log message with ollama namespace prefix at info level by default", () => {
      logOllamaMessage("Test message");

      expect(logMessage).toHaveBeenCalledWith("[ollama] Test message", "info");
    });

    it("should log message with warn level", () => {
      logOllamaMessage("Warning message", "warn");

      expect(logMessage).toHaveBeenCalledWith("[ollama] Warning message", "warn");
    });

    it("should log message with error level", () => {
      logOllamaMessage("Error message", "error");

      expect(logMessage).toHaveBeenCalledWith("[ollama] Error message", "error");
    });
  });

  describe("checkOllamaAvailability", () => {
    it("should check if Ollama is responsive on default port", async () => {
      mockIsOllamaResponsive.mockResolvedValueOnce(true);

      const result = await checkOllamaAvailability();

      expect(result).toBe(true);
      expect(mockIsOllamaResponsive).toHaveBeenCalledWith(DEFAULT_OLLAMA_PORT);
    });

    it("should check if Ollama is responsive on custom port", async () => {
      mockIsOllamaResponsive.mockResolvedValueOnce(true);

      const result = await checkOllamaAvailability(8080);

      expect(result).toBe(true);
      expect(mockIsOllamaResponsive).toHaveBeenCalledWith(8080);
    });

    it("should return false when Ollama is not responsive", async () => {
      mockIsOllamaResponsive.mockResolvedValueOnce(false);

      const result = await checkOllamaAvailability();

      expect(result).toBe(false);
    });
  });

  describe("isBundledOllamaRunning", () => {
    it("should return true when bundled Ollama is running", async () => {
      mockIsOllamaRunning.mockResolvedValueOnce(true);

      const result = await isBundledOllamaRunning();

      expect(result).toBe(true);
      expect(mockIsOllamaRunning).toHaveBeenCalled();
    });

    it("should return false when bundled Ollama is not running", async () => {
      mockIsOllamaRunning.mockResolvedValueOnce(false);

      const result = await isBundledOllamaRunning();

      expect(result).toBe(false);
    });
  });

  describe("default export", () => {
    it("should export all functions", async () => {
      const ollamaModule = await import("../ollama");
      const defaultExport = ollamaModule.default;

      expect(defaultExport).toHaveProperty("DEFAULT_OLLAMA_PORT");
      expect(defaultExport).toHaveProperty("resolveOllamaBinary");
      expect(defaultExport).toHaveProperty("resolveOllamaModelsDirectory");
      expect(defaultExport).toHaveProperty("logOllamaMessage");
      expect(defaultExport).toHaveProperty("checkOllamaAvailability");
      expect(defaultExport).toHaveProperty("isBundledOllamaRunning");
    });
  });
});
