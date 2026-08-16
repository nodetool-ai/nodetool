import { detectTorchPlatform } from "../torchruntime";
import * as config from "../config";
import { spawn } from "child_process";

jest.mock("child_process");
jest.mock("../logger");
jest.mock("../events");

// The real config module; only the interpreter path is stubbed.
const mockGetPythonPath = jest.spyOn(config, "getPythonPath");

// SAFETY: `child_process` is jest-mocked in this file, so `spawn` is a
// `jest.fn()`; the tests hand it stub processes with only the stdout/stderr/
// exit listeners `detectTorchPlatform` subscribes to.
const mockSpawn = spawn as jest.Mock;

describe("torchruntime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPythonPath.mockReturnValue("/fake/python");
  });

  describe("detectTorchPlatform", () => {
    it("should detect CUDA platform successfully", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from('{"platform": "cu129", "gpu_count": 1}'));
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      expect(result.platform).toBe("cu129");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cu129");
      expect(result.error).toBeUndefined();
    });

    it("should detect ROCm platform for AMD on Linux", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from('{"platform": "rocm6.2", "gpu_count": 1}'));
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      expect(result.platform).toBe("rocm6.2");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/rocm6.2");
    });

    it("should fallback to CPU on detection error", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from('{"error": "No GPUs found"}'));
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      expect(result.platform).toBe("cpu");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cpu");
      expect(result.error).toBeDefined();
    });

    it("should fallback to CPU on process error", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn(),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(1);
          } else if (event === "error") {
            handler(new Error("Process failed"));
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      expect(result.platform).toBe("cpu");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cpu");
      expect(result.error).toBeDefined();
    });

    it("should reject unknown platforms", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from('{"platform": "unknown-platform", "gpu_count": 1}'));
            }
          }),
        },
        stderr: {
          on: jest.fn(),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      // Should fallback to CPU at the top level due to rejection
      expect(result.platform).toBe("cpu");
      expect(result.error).toBeDefined();
    });
  });
});
