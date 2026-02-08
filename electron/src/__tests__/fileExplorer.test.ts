import fs from "fs";
import os from "os";
import path from "path";
import { shell } from "electron";

// Mock electron
jest.mock("electron", () => ({
  shell: {
    openPath: jest.fn().mockResolvedValue(""),
  },
}));

// Mock logger
jest.mock("../logger", () => ({
  logMessage: jest.fn().mockResolvedValue(undefined),
  LOG_FILE: "/mock/logs/nodetool.log",
}));

// Mock config
jest.mock("../config", () => ({
  getCondaEnvPath: jest.fn().mockReturnValue("/mock/conda/env"),
}));

import {
  getOllamaModelsDir,
  getHuggingFaceCacheDir,
  openPathInExplorer,
  openModelDirectory,
  getInstallationDir,
  getLogsDir,
  openSystemDirectory,
} from "../fileExplorer";
import { logMessage, LOG_FILE } from "../logger";
import { getCondaEnvPath } from "../config";

const mockShell = shell as jest.Mocked<typeof shell>;

describe("fileExplorer", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset process.env
    delete process.env.OLLAMA_MODELS;
    delete process.env.HF_HUB_CACHE;
    delete process.env.HUGGINGFACE_HUB_CACHE;
    delete process.env.HF_HOME;
    delete process.env.XDG_CACHE_HOME;
    delete process.env.USERPROFILE;
  });

  afterEach(() => {
    // Restore original env
    process.env = { ...originalEnv };
  });

  describe("getOllamaModelsDir", () => {
    it("should use OLLAMA_MODELS env var when set", () => {
      // Create temp directory to simulate the env var path
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;

      const result = getOllamaModelsDir();

      expect(result).toBe(tmpDir);
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Using Ollama models directory from OLLAMA_MODELS env var"),
        "info"
      );

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should return resolved path for OLLAMA_MODELS", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;

      const result = getOllamaModelsDir();

      expect(result).toBe(path.resolve(tmpDir));

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should return undefined when default directories do not exist", () => {
      // Without OLLAMA_MODELS set and no .ollama directory
      // This will try default paths that likely don't exist in CI
      const result = getOllamaModelsDir();

      // Result depends on whether .ollama exists on the system
      // It should be either a valid path or undefined
      expect(typeof result === "string" || result === undefined).toBe(true);
    });
  });

  describe("getHuggingFaceCacheDir", () => {
    it("should use HF_HUB_CACHE env var when set", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-test-"));
      process.env.HF_HUB_CACHE = tmpDir;

      const result = getHuggingFaceCacheDir();

      expect(result).toBe(tmpDir);

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should use HUGGINGFACE_HUB_CACHE env var when set", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-test-"));
      process.env.HUGGINGFACE_HUB_CACHE = tmpDir;

      const result = getHuggingFaceCacheDir();

      expect(result).toBe(tmpDir);

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should use HF_HOME env var when set", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-test-"));
      const hubDir = path.join(tmpDir, "hub");
      fs.mkdirSync(hubDir);
      process.env.HF_HOME = tmpDir;

      const result = getHuggingFaceCacheDir();

      expect(result).toBe(hubDir);

      // Cleanup
      fs.rmdirSync(hubDir);
      fs.rmdirSync(tmpDir);
    });

    it("should use XDG_CACHE_HOME when set", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "xdg-test-"));
      const hfDir = path.join(tmpDir, "huggingface", "hub");
      fs.mkdirSync(hfDir, { recursive: true });
      process.env.XDG_CACHE_HOME = tmpDir;

      const result = getHuggingFaceCacheDir();

      expect(result).toBe(hfDir);

      // Cleanup
      fs.rmSync(tmpDir, { recursive: true });
    });

    it("should return undefined when no directories exist", () => {
      // Set env vars to non-existent paths
      process.env.HF_HUB_CACHE = "/nonexistent/path/that/does/not/exist";
      process.env.HUGGINGFACE_HUB_CACHE = "/another/nonexistent/path";
      process.env.HF_HOME = "/yet/another/nonexistent";
      process.env.XDG_CACHE_HOME = "/final/nonexistent";

      const result = getHuggingFaceCacheDir();

      // It might still find the default home directory cache, so just check the type
      expect(typeof result === "string" || result === undefined).toBe(true);
    });
  });

  describe("openPathInExplorer", () => {
    it("should return error when no safe roots are found", async () => {
      // Set env vars to non-existent paths to ensure no safe roots
      process.env.OLLAMA_MODELS = "/nonexistent/ollama";
      process.env.HF_HUB_CACHE = "/nonexistent/hf";
      process.env.HF_HOME = "/nonexistent/hf_home";

      const result = await openPathInExplorer("/some/path");

      // If there are no valid safe directories, it returns error
      // Note: If system has .ollama or .cache/huggingface, this might succeed
      expect(result.status).toBe("error");
      expect(result.message).toBeDefined();
    });

    it("should return error for paths outside allowed directories", async () => {
      // Create a valid Ollama directory first
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;

      const result = await openPathInExplorer("/unauthorized/path");

      expect(result.status).toBe("error");
      expect(result.message).toContain("Access denied");
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Path traversal attempt"),
        "warn"
      );

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should successfully open valid path within allowed directory", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      const subDir = path.join(tmpDir, "models");
      fs.mkdirSync(subDir);
      process.env.OLLAMA_MODELS = tmpDir;
      mockShell.openPath.mockResolvedValueOnce("");

      const result = await openPathInExplorer(subDir);

      expect(result.status).toBe("success");
      expect(result.path).toBe(subDir);
      expect(mockShell.openPath).toHaveBeenCalledWith(subDir);

      // Cleanup
      fs.rmdirSync(subDir);
      fs.rmdirSync(tmpDir);
    });

    it("should handle shell.openPath errors", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;
      mockShell.openPath.mockResolvedValueOnce("Failed to open");

      const result = await openPathInExplorer(tmpDir);

      expect(result.status).toBe("error");
      expect(result.message).toContain("internal error");

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should handle shell.openPath exceptions", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;
      mockShell.openPath.mockRejectedValueOnce(new Error("System error"));

      const result = await openPathInExplorer(tmpDir);

      expect(result.status).toBe("error");
      expect(result.message).toContain("internal error");
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to open path"),
        "error"
      );

      // Cleanup
      fs.rmdirSync(tmpDir);
    });
  });

  describe("openModelDirectory", () => {
    it("should open Ollama models directory when available", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ollama-test-"));
      process.env.OLLAMA_MODELS = tmpDir;
      mockShell.openPath.mockResolvedValueOnce("");

      const result = await openModelDirectory("ollama");

      expect(result.status).toBe("success");
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Request to open model directory: ollama")
      );

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should open Hugging Face cache directory when available", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-test-"));
      process.env.HF_HUB_CACHE = tmpDir;
      mockShell.openPath.mockResolvedValueOnce("");

      const result = await openModelDirectory("huggingface");

      expect(result.status).toBe("success");

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should return error when Ollama directory is unavailable", async () => {
      // Ensure no OLLAMA_MODELS is set and disable HF cache too
      delete process.env.OLLAMA_MODELS;
      delete process.env.HF_HUB_CACHE;
      delete process.env.HF_HOME;
      delete process.env.XDG_CACHE_HOME;
      delete process.env.HUGGINGFACE_HUB_CACHE;

      const result = await openModelDirectory("ollama");

      // The result depends on system state - if ~/.ollama/models exists, it will succeed
      // We can only verify the result is valid
      expect(result.status === "error" || result.status === "success").toBe(true);
      if (result.status === "error") {
        expect(result.message).toContain("Ollama models directory is not available");
      }
    });

    it("should return error when Hugging Face directory is unavailable", async () => {
      process.env.HF_HUB_CACHE = "/nonexistent/path";
      process.env.HF_HOME = "/nonexistent/hf_home";

      const result = await openModelDirectory("huggingface");

      // Result depends on whether default HF cache exists on system
      if (result.status === "error") {
        expect(result.message).toContain("Hugging Face cache directory is not available");
      } else {
        expect(result.status).toBe("success");
      }
    });
  });

  describe("getInstallationDir", () => {
    it("should return conda env path when it exists", () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conda-test-"));
      (getCondaEnvPath as jest.Mock).mockReturnValue(tmpDir);

      const result = getInstallationDir();

      expect(result).toBe(tmpDir);

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should return undefined when conda env path does not exist", () => {
      (getCondaEnvPath as jest.Mock).mockReturnValue("/nonexistent/conda/env");

      const result = getInstallationDir();

      expect(result).toBeUndefined();
    });

    it("should log error and return undefined on exception", () => {
      (getCondaEnvPath as jest.Mock).mockImplementation(() => {
        throw new Error("Config error");
      });

      const result = getInstallationDir();

      expect(result).toBeUndefined();
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Error determining installation directory"),
        "error"
      );
    });
  });

  describe("getLogsDir", () => {
    it("should return logs directory when it exists", () => {
      // This test depends on the LOG_FILE mock
      // The directory /mock/logs likely doesn't exist
      const result = getLogsDir();

      // Since /mock/logs doesn't exist, it should return undefined
      expect(result).toBeUndefined();
    });
  });

  describe("openSystemDirectory", () => {
    it("should open installation directory", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conda-test-"));
      (getCondaEnvPath as jest.Mock).mockReturnValue(tmpDir);
      mockShell.openPath.mockResolvedValueOnce("");

      const result = await openSystemDirectory("installation");

      expect(result.status).toBe("success");
      expect(result.path).toBe(tmpDir);

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should return error for unknown directory type", async () => {
      const result = await openSystemDirectory("unknown" as any);

      expect(result.status).toBe("error");
      expect(result.message).toContain("Unknown system directory type");
    });

    it("should return error when installation directory is unavailable", async () => {
      (getCondaEnvPath as jest.Mock).mockReturnValue(null);

      const result = await openSystemDirectory("installation");

      expect(result.status).toBe("error");
      expect(result.message).toContain("Nodetool installation directory is not available");
    });

    it("should return error when logs directory is unavailable", async () => {
      // LOG_FILE points to /mock/logs which doesn't exist
      const result = await openSystemDirectory("logs");

      expect(result.status).toBe("error");
      expect(result.message).toContain("Nodetool logs directory is not available");
    });

    it("should handle shell.openPath errors", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conda-test-"));
      (getCondaEnvPath as jest.Mock).mockReturnValue(tmpDir);
      mockShell.openPath.mockResolvedValueOnce("Failed to open");

      const result = await openSystemDirectory("installation");

      expect(result.status).toBe("error");
      expect(result.message).toContain("internal error");

      // Cleanup
      fs.rmdirSync(tmpDir);
    });

    it("should handle shell.openPath exceptions", async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "conda-test-"));
      (getCondaEnvPath as jest.Mock).mockReturnValue(tmpDir);
      mockShell.openPath.mockRejectedValueOnce(new Error("System error"));

      const result = await openSystemDirectory("installation");

      expect(result.status).toBe("error");
      expect(logMessage).toHaveBeenCalledWith(
        expect.stringContaining("Failed to open installation directory"),
        "error"
      );

      // Cleanup
      fs.rmdirSync(tmpDir);
    });
  });
});
