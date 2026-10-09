import {
  detectTorchPlatform,
  fallbackTorchBackend,
  mapTorchPlatform,
  torchIndexUrl,
} from "../torchruntime";
import * as config from "../config";
import { spawn } from "child_process";

jest.mock("child_process");
jest.mock("../logger");
jest.mock("../events");

// The real config module; only the interpreter and uv paths are stubbed.
const mockGetPythonPath = jest.spyOn(config, "getPythonPath");
jest.spyOn(config, "getUVPath").mockReturnValue("/fake/uv");

// `child_process` is jest-mocked in this file. The tests hand `spawn` stub
// processes carrying only the stdout/stderr/exit listeners
// `detectTorchPlatform` subscribes to.
const mockSpawn = jest.mocked(spawn);

/** A process that prints `stdout` and exits with `code` (or emits `error`). */
function fakeProcess(stdout: string, code: number, error?: Error) {
  return {
    stdout: {
      on: jest.fn((event, handler) => {
        if (event === "data" && stdout) {
          handler(Buffer.from(stdout));
        }
      }),
    },
    stderr: { on: jest.fn() },
    on: jest.fn((event, handler) => {
      if (event === "exit") {
        handler(code);
      } else if (event === "error" && error) {
        handler(error);
      }
    }),
  } as never;
}

describe("mapTorchPlatform", () => {
  it.each([
    // NVIDIA: pre-Turing cards keep a CUDA 12.6 build, newer ones CUDA 12.8.
    ["cu124", "cu126"],
    ["cu126", "cu126"],
    ["cu128", "cu128"],
    ["cu129", "cu128"],
    ["cu130", "cu130"],
    ["cu132", "cu130"],
    // AMD on Linux: every ROCm 6+ platform goes to the newest ROCm index.
    ["rocm6.1", "rocm7.2"],
    ["rocm6.2", "rocm7.2"],
    ["rocm6.4", "rocm7.2"],
    // Intel.
    ["xpu", "xpu"],
    ["ipex", "xpu"],
    ["cpu", "cpu"],
  ])("maps %s to the %s index", (platform, backend) => {
    const mapping = mapTorchPlatform(platform);
    expect(mapping.backend).toBe(backend);
    expect(mapping.warning).toBeUndefined();
  });

  it("uses PyPI's default wheels for mps", () => {
    expect(mapTorchPlatform("mps")).toEqual({ backend: null });
  });

  it.each(["cu118", "rocm4.2", "rocm5.2", "rocm5.5", "rocm5.7", "directml", "tpu-v9"])(
    "falls back to CPU with a warning for %s",
    (platform) => {
      const mapping = mapTorchPlatform(platform);
      expect(mapping.backend).toBe("cpu");
      expect(mapping.warning).toEqual(expect.any(String));
    }
  );

  it("names the index URL for each backend", () => {
    expect(torchIndexUrl("cu128")).toBe("https://download.pytorch.org/whl/cu128");
    expect(torchIndexUrl(null)).toBeNull();
    expect(torchIndexUrl("auto")).toBeNull();
  });

  it("lets uv probe the GPU when detection fails, except on macOS", () => {
    expect(fallbackTorchBackend("win32")).toBe("auto");
    expect(fallbackTorchBackend("linux")).toBe("auto");
    expect(fallbackTorchBackend("darwin")).toBeNull();
  });
});

describe("detectTorchPlatform", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPythonPath.mockReturnValue("/fake/python");
  });

  it("maps a detected CUDA platform to its index", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "cu124", "gpu_count": 1}', 0));

    const result = await detectTorchPlatform();

    expect(result).toMatchObject({
      platform: "cu124",
      backend: "cu126",
      indexUrl: "https://download.pytorch.org/whl/cu126",
    });
    expect(result.error).toBeUndefined();
  });

  it("maps DirectML to CPU with a warning instead of failing", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "directml", "gpu_count": 1}', 0));

    const result = await detectTorchPlatform();

    expect(result.platform).toBe("directml");
    expect(result.backend).toBe("cpu");
    expect(result.warning).toEqual(expect.any(String));
    expect(result.error).toBeUndefined();
  });

  it("installs torchruntime with uv, not pip", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "cpu", "gpu_count": 0}', 0));

    await detectTorchPlatform();

    const uvCall = mockSpawn.mock.calls.find((call) => call[0] === "/fake/uv");
    expect(uvCall?.[1]).toEqual(expect.arrayContaining(["pip", "install", "--python", "/fake/python"]));
    expect(mockSpawn.mock.calls.some((call) => (call[1] as string[]).includes("-m"))).toBe(false);
  });

  it("reports an error result on detection error", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"error": "No GPUs found"}', 0));

    const result = await detectTorchPlatform();

    expect(result.error).toBeDefined();
    expect(result.platform).toBe("unknown");
    expect(result.backend).toBe(fallbackTorchBackend());
  });

  it("reports an error result on process error", async () => {
    mockSpawn.mockReturnValue(fakeProcess("", 1, new Error("Process failed")));

    const result = await detectTorchPlatform();

    expect(result.error).toBeDefined();
  });
});
