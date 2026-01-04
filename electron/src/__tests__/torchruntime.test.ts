import { detectTorchPlatform, installTorchWithUvs, normalizePlatform } from "../torchruntime";
import { getPythonPath } from "../config";
import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "child_process";

jest.mock("child_process");
jest.mock("../config");
jest.mock("../logger");
jest.mock("../events");

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockGetPythonPath = getPythonPath as jest.MockedFunction<typeof getPythonPath>;

describe("torchruntime", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPythonPath.mockReturnValue("/fake/python");
  });

  describe("normalizePlatform", () => {
    it("should normalize valid platform strings", () => {
      expect(normalizePlatform("cu129")).toBe("cu129");
      expect(normalizePlatform("CU129")).toBe("cu129");
      expect(normalizePlatform("  rocm6.2  ")).toBe("rocm6.2");
      expect(normalizePlatform("cpu")).toBe("cpu");
      expect(normalizePlatform("mps")).toBe("mps");
    });

    it("should return null for invalid platform strings", () => {
      expect(normalizePlatform("invalid")).toBeNull();
      expect(normalizePlatform("")).toBeNull();
      expect(normalizePlatform(undefined)).toBeNull();
    });

    it("should reject directml and xpu platforms", () => {
      expect(normalizePlatform("directml")).toBeNull();
      expect(normalizePlatform("xpu")).toBeNull();
    });
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
      } as unknown as ChildProcessWithoutNullStreams;

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
      } as unknown as ChildProcessWithoutNullStreams;

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
      } as unknown as ChildProcessWithoutNullStreams;

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
      } as unknown as ChildProcessWithoutNullStreams;

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
      } as unknown as ChildProcessWithoutNullStreams;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await detectTorchPlatform();

      // Should fallback to CPU at the top level due to rejection
      expect(result.platform).toBe("cpu");
      expect(result.error).toBeDefined();
    });
  });

  describe("installTorchWithUvs", () => {
    it("should install PyTorch successfully for CUDA platform", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from("Detected CUDA GPU cu129\nInstalling PyTorch for cu129\nDone!\n"));
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
      } as unknown as ChildProcessWithoutNullStreams;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await installTorchWithUvs();

      expect(result.platform).toBe("cu129");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cu129");
      expect(result.error).toBeUndefined();
    });

    it("should install PyTorch successfully for ROCm platform", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from("Detected AMD GPU rocm6.2\nInstalling PyTorch for rocm6.2\nDone!\n"));
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
      } as unknown as ChildProcessWithoutNullStreams;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await installTorchWithUvs();

      expect(result.platform).toBe("rocm6.2");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/rocm6.2");
      expect(result.error).toBeUndefined();
    });

    it("should fallback to CPU when torchruntime install fails", async () => {
      let stderrHandler: ((data: Buffer) => void) | null = null;
      const mockProcess = {
        stdout: {
          on: jest.fn(),
        },
        stderr: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              stderrHandler = handler;
            }
          }),
        },
        on: jest.fn((event, handler) => {
          if (event === "exit") {
            handler(1);
          } else if (event === "error") {
            handler(new Error("Process failed"));
          }
        }),
      } as unknown as ChildProcessWithoutNullStreams;

      mockSpawn.mockReturnValue(mockProcess);

      const resultPromise = installTorchWithUvs();

      // Simulate stderr data
      if (stderrHandler) {
        (stderrHandler as (data: Buffer) => void)(Buffer.from("Error: torchruntime not found\n"));
      }

      const result = await resultPromise;

      expect(result.platform).toBe("cpu");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cpu");
      expect(result.error).toBeDefined();
    });

    it("should handle MPS platform correctly", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from("Detected Apple Silicon MPS\nInstalling PyTorch for MPS\nDone!\n"));
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
      } as unknown as ChildProcessWithoutNullStreams;

      mockSpawn.mockReturnValue(mockProcess);

      const result = await installTorchWithUvs();

      expect(result.platform).toBe("mps");
      expect(result.indexUrl).toBeNull();
      expect(result.error).toBeUndefined();
    });
  });
});
