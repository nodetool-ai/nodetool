import { spawn } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectTorchPlatform,
  fallbackTorchBackend,
  getSavedTorchPlatform,
  getTorchBackend,
  mapTorchPlatform,
  saveTorchPlatform,
  torchBackendArgs,
  torchIndexUrl,
} from "../src/torch.js";
import { fakeHost } from "./fake-host.js";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

// The tests hand `spawn` stub processes carrying only the stdout/stderr/exit
// listeners `detectTorchPlatform` subscribes to.
const mockSpawn = vi.mocked(spawn);

/** A process that prints `stdout` and exits with `code` (or emits `error`). */
function fakeProcess(stdout: string, code: number, error?: Error) {
  return {
    stdout: {
      on: vi.fn((event, handler) => {
        if (event === "data" && stdout) {
          handler(Buffer.from(stdout));
        }
      }),
    },
    stderr: { on: vi.fn() },
    on: vi.fn((event, handler) => {
      // Real children emit "exit" and then "close".
      if (event === "exit" || event === "close") {
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
    vi.clearAllMocks();
  });

  it("maps a detected CUDA platform to its index", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "cu124", "gpu_count": 1}', 0));

    const result = await detectTorchPlatform(fakeHost());

    expect(result).toMatchObject({
      platform: "cu124",
      backend: "cu126",
      indexUrl: "https://download.pytorch.org/whl/cu126",
    });
    expect(result.error).toBeUndefined();
  });

  it("reads the result from the last line when torchruntime printed warnings on stdout", async () => {
    mockSpawn.mockReturnValue(
      fakeProcess(
        '[WARNING] Unsupported AMD graphics card: Radeon 610M\n{"platform": "cpu", "gpu_count": 1}\n',
        0
      )
    );

    const result = await detectTorchPlatform(fakeHost());

    expect(result.error).toBeUndefined();
    expect(result).toMatchObject({ platform: "cpu", backend: "cpu" });
  });

  it("keeps torchruntime's own output off stdout in the detection script", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "cpu", "gpu_count": 0}', 0));

    await detectTorchPlatform(fakeHost());

    const script = mockSpawn.mock.calls
      .map((call) => (call[1] as string[])[1])
      .find((arg) => arg?.includes("get_torch_platform"));
    expect(script).toContain("contextlib.redirect_stdout(sys.stderr)");
  });

  it("maps DirectML to CPU with a warning instead of failing", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "directml", "gpu_count": 1}', 0));

    const result = await detectTorchPlatform(fakeHost());

    expect(result.platform).toBe("directml");
    expect(result.backend).toBe("cpu");
    expect(result.warning).toEqual(expect.any(String));
    expect(result.error).toBeUndefined();
  });

  it("installs torchruntime with uv, not pip", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"platform": "cpu", "gpu_count": 0}', 0));

    await detectTorchPlatform(fakeHost());

    const uvCall = mockSpawn.mock.calls.find((call) => call[0] === "/fake/env/bin/uv");
    expect(uvCall?.[1]).toEqual(expect.arrayContaining(["pip", "install", "--python", "/fake/env/bin/python"]));
    expect(mockSpawn.mock.calls.some((call) => (call[1] as string[]).includes("-m"))).toBe(false);
  });

  it("reports an error result on detection error", async () => {
    mockSpawn.mockReturnValue(fakeProcess('{"error": "No GPUs found"}', 0));

    const result = await detectTorchPlatform(fakeHost());

    expect(result.error).toBeDefined();
    expect(result.platform).toBe("unknown");
    expect(result.backend).toBe(fallbackTorchBackend("linux"));
  });

  it("reports an error result on process error", async () => {
    mockSpawn.mockReturnValue(fakeProcess("", 1, new Error("Process failed")));

    const result = await detectTorchPlatform(fakeHost());

    expect(result.error).toBe("Failed to install torchruntime (exit code 1): ");
  });
});

describe("saved torch platform", () => {
  it("returns null when nothing is saved", () => {
    expect(getSavedTorchPlatform(fakeHost())).toBeNull();
  });

  it("derives the backend from the saved platform with the current mapping", () => {
    const host = fakeHost();
    host.saved.set("TORCH_PLATFORM_DETECTED", {
      platform: "cu124",
      // An index saved by an older version is ignored.
      indexUrl: "https://download.pytorch.org/whl/cu124",
      detectedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(getSavedTorchPlatform(host)).toMatchObject({
      platform: "cu124",
      backend: "cu126",
      indexUrl: "https://download.pytorch.org/whl/cu126",
    });
  });

  it("ignores a saved failed detection so the next install detects again", () => {
    const host = fakeHost();
    host.saved.set("TORCH_PLATFORM_DETECTED", {
      platform: "cpu",
      indexUrl: "https://download.pytorch.org/whl/cpu",
      error: "torchruntime failed",
    });
    expect(getSavedTorchPlatform(host)).toBeNull();
    expect(getTorchBackend(host)).toBeNull();
  });

  it("returns null for invalid saved data", () => {
    const host = fakeHost();
    host.saved.set("TORCH_PLATFORM_DETECTED", { platform: 123 });
    expect(getSavedTorchPlatform(host)).toBeNull();
  });

  it("handles settings read errors", () => {
    const host = fakeHost({
      settings: {
        read: () => {
          throw new Error("Failed to read settings");
        },
        write: () => {},
      },
    });
    expect(getSavedTorchPlatform(host)).toBeNull();
  });

  it("passes the backend to uv, or nothing for PyPI wheels", () => {
    expect(torchBackendArgs("cu128")).toEqual(["--torch-backend", "cu128"]);
    expect(torchBackendArgs(null)).toEqual([]);
  });

  it("saves the detected platform", () => {
    const host = fakeHost();
    saveTorchPlatform(host, {
      platform: "cu128",
      backend: "cu128",
      indexUrl: "https://download.pytorch.org/whl/cu128",
    });
    expect(host.saved.get("TORCH_PLATFORM_DETECTED")).toEqual({
      platform: "cu128",
      detectedAt: expect.any(String),
    });
  });

  it("does not save a failed detection", () => {
    const host = fakeHost();
    saveTorchPlatform(host, { platform: "unknown", backend: "auto", indexUrl: null, error: "Detection failed" });
    expect(host.saved.size).toBe(0);
  });
});
