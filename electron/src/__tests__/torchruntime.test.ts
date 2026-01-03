import { detectTorchPlatform, getDirectMLFlag, normalizePlatform } from "../torchruntime";
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
      expect(normalizePlatform("directml")).toBe("directml");
      expect(normalizePlatform("cpu")).toBe("cpu");
      expect(normalizePlatform("mps")).toBe("mps");
      expect(normalizePlatform("xpu")).toBe("xpu");
    });

    it("should return null for invalid platform strings", () => {
      expect(normalizePlatform("invalid")).toBeNull();
      expect(normalizePlatform("")).toBeNull();
      expect(normalizePlatform(undefined)).toBeNull();
    });
  });

  describe("getDirectMLFlag", () => {
    it("should return --directml for directml platform", () => {
      expect(getDirectMLFlag("directml")).toBe("--directml");
    });

    it("should return null for non-directml platforms", () => {
      expect(getDirectMLFlag("cu129")).toBeNull();
      expect(getDirectMLFlag("rocm6.2")).toBeNull();
      expect(getDirectMLFlag("cpu")).toBeNull();
      expect(getDirectMLFlag("mps")).toBeNull();
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
      expect(result.requiresDirectML).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it("should detect DirectML platform for AMD on Windows", async () => {
      const mockProcess = {
        stdout: {
          on: jest.fn((event, handler) => {
            if (event === "data") {
              handler(Buffer.from('{"platform": "directml", "gpu_count": 1}'));
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

      expect(result.platform).toBe("directml");
      expect(result.indexUrl).toBeNull();
      expect(result.requiresDirectML).toBe(true);
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
      expect(result.requiresDirectML).toBe(false);
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
      expect(result.requiresDirectML).toBe(false);
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
      expect(result.requiresDirectML).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle unknown platforms by falling back to CPU", async () => {
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

      expect(result.platform).toBe("cpu");
      expect(result.indexUrl).toBe("https://download.pytorch.org/whl/cpu");
    });
  });
});
