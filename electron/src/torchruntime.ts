import { spawn } from "child_process";
import { z } from "zod";
import { logMessage } from "./logger";
import { getPythonPath, getProcessEnv, getUVPath } from "./config";
import { emitBootMessage } from "./events";

/**
 * GPU platform detection for the PyTorch install, and the mapping from what
 * torchruntime reports to a PyTorch wheel index.
 *
 * The packs pin torch 2.14.x. download.pytorch.org publishes each torch
 * release only for a few CUDA and ROCm versions, so the platform name
 * torchruntime returns (it can say cu118, cu124, rocm5.2, directml, ...) is
 * not always an index that carries torch 2.14. {@link mapTorchPlatform}
 * turns every value torchruntime 2.x can return into the newest index of the
 * matching family.
 *
 * Assumption, not verified from this build environment (download.pytorch.org
 * was unreachable when this table was written): torch 2.14 is published for
 * cu126, cu128 and cu130, ROCm 7.2, xpu and cpu. If a release drops one of
 * these, the install fails with a resolver error naming the index. It does not
 * fall back to a CPU wheel, because the install passes the index to uv as
 * `--torch-backend`, which takes torch packages only from that index. Update
 * {@link TORCH_INDEX_FAMILIES} when the torch pin moves.
 */

/** A `uv pip install --torch-backend` value, which is also the index name. */
export type TorchBackend =
  | "cpu"
  | "cu126"
  | "cu128"
  | "cu130"
  | "rocm7.2"
  | "xpu"
  | "auto";

/** The newest index of each family that carries the pinned torch. */
export const TORCH_INDEX_FAMILIES = {
  /**
   * NVIDIA cards older than Turing (Maxwell, Pascal, Volta; torchruntime says
   * cu124). CUDA 12.8+ builds no longer ship kernels for them, CUDA 12.6
   * builds still do.
   */
  cudaLegacy: "cu126",
  /** Turing and newer with a CUDA 12 driver (torchruntime says cu128/cu129). */
  cuda12: "cu128",
  /** A CUDA 13 platform (driver 580+). */
  cuda13: "cu130",
  /** AMD Navi 2/3/4 and RDNA APUs on Linux. */
  rocm: "rocm7.2",
  /** Intel Arc and Intel integrated GPUs (Windows and Linux). */
  intel: "xpu",
} as const satisfies Record<string, TorchBackend>;

export interface TorchPlatformMapping {
  /**
   * The `--torch-backend` to install with, or null to use the default PyPI
   * wheels (macOS, where those wheels carry MPS).
   */
  backend: TorchBackend | null;
  /** Why the GPU cannot be used, when the mapping falls back to CPU. */
  warning?: string;
}

/**
 * Map a torchruntime platform name to the PyTorch index to install from.
 * Every value torchruntime 2.x returns is handled; anything unknown maps to
 * CPU with a warning.
 */
export function mapTorchPlatform(platform: string): TorchPlatformMapping {
  const value = platform.trim().toLowerCase();
  if (value === "mps") {
    return { backend: null };
  }
  if (value === "cpu") {
    return { backend: "cpu" };
  }
  if (value === "xpu" || value === "ipex") {
    // ipex (intel-extension-for-pytorch) is superseded by the native xpu build.
    return { backend: TORCH_INDEX_FAMILIES.intel };
  }
  if (value === "directml") {
    return {
      backend: "cpu",
      warning:
        "This GPU is supported by PyTorch only through DirectML, which has no build for the current torch version. Python nodes will run on the CPU.",
    };
  }
  const cuda = /^cu(\d+)$/.exec(value);
  if (cuda) {
    const code = Number(cuda[1]);
    // cu118: Kepler (compute 3.7). No current torch build runs on it.
    if (code < 120) {
      return {
        backend: "cpu",
        warning:
          "This NVIDIA GPU is too old for current PyTorch CUDA builds. Python nodes will run on the CPU.",
      };
    }
    if (code < 128) {
      return { backend: TORCH_INDEX_FAMILIES.cudaLegacy };
    }
    if (code < 130) {
      return { backend: TORCH_INDEX_FAMILIES.cuda12 };
    }
    return { backend: TORCH_INDEX_FAMILIES.cuda13 };
  }
  const rocm = /^rocm(\d+)(?:\.(\d+))?/.exec(value);
  if (rocm) {
    // torchruntime returns rocm6.x for Navi 2/3/4 and RDNA APUs, and rocm4/5
    // for Polaris, Vega and Navi 1, which current ROCm builds do not support.
    if (Number(rocm[1]) >= 6) {
      return { backend: TORCH_INDEX_FAMILIES.rocm };
    }
    return {
      backend: "cpu",
      warning:
        "This AMD GPU is not supported by current PyTorch ROCm builds. Python nodes will run on the CPU.",
    };
  }
  return {
    backend: "cpu",
    warning: `Unrecognised GPU platform '${platform}'. Python nodes will run on the CPU.`,
  };
}

/** Backend to use when detection itself failed: uv's own GPU probe off macOS. */
export function fallbackTorchBackend(
  platform: NodeJS.Platform = process.platform
): TorchBackend | null {
  return platform === "darwin" ? null : "auto";
}

const PYTORCH_INDEX_BASE = "https://download.pytorch.org/whl";

/** The index URL a backend installs from, for logs and the UI. */
export function torchIndexUrl(backend: TorchBackend | null): string | null {
  if (backend === null || backend === "auto") {
    return null;
  }
  return `${PYTORCH_INDEX_BASE}/${backend}`;
}

export interface TorchruntimeDetectionResult {
  /** What torchruntime reported (for example `cu124` or `directml`). */
  platform: string;
  /** The `--torch-backend` derived from `platform`, null for PyPI wheels. */
  backend: TorchBackend | null;
  indexUrl: string | null;
  warning?: string;
  detectedAt?: string;
  /** Set when detection failed. A failed result is never saved. */
  error?: string;
}

async function isTorchruntimeInstalled(): Promise<boolean> {
  try {
    const pythonPath = getPythonPath();
    
    return new Promise((resolve) => {
      const checkProcess = spawn(
        pythonPath,
        ["-c", "import torchruntime; print('installed')"],
        {
          env: getProcessEnv(),
          stdio: "pipe",
          // Prevent a console window from flashing on Windows.
          windowsHide: true,
        }
      );

      let output = "";
      checkProcess.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.on("close", (code) => {
        resolve(code === 0 && output.includes("installed"));
      });

      checkProcess.on("error", () => {
        resolve(false);
      });
    });
  } catch (error) {
    logMessage(`Error checking torchruntime installation: ${error}`, "error");
    return false;
  }
}

async function installTorchruntime(): Promise<void> {
  emitBootMessage("Installing torchruntime for GPU detection...");
  logMessage("Installing torchruntime package");

  const pythonPath = getPythonPath();
  const torchruntimeSpec = "torchruntime~=2.0";

  return new Promise((resolve, reject) => {
    // The Python runtime ships uv, not pip, so install through uv into the
    // runtime's interpreter.
    const installProcess = spawn(
      getUVPath(),
      ["pip", "install", "--python", pythonPath, "--quiet", torchruntimeSpec],
      {
        env: getProcessEnv(),
        stdio: "pipe",
        // Prevent a console window from flashing on Windows.
        windowsHide: true,
      }
    );

    let stderr = "";
    installProcess.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    installProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      logMessage(`torchruntime install: ${output.trim()}`);
    });

    installProcess.on("close", (code) => {
      if (code === 0) {
        logMessage("Torchruntime installed successfully");
        resolve();
      } else {
        const errorMsg = `Failed to install torchruntime (exit code ${code}): ${stderr}`;
        logMessage(errorMsg, "error");
        reject(new Error(errorMsg));
      }
    });

    installProcess.on("error", (error) => {
      const errorMsg = `Failed to spawn uv for torchruntime: ${error.message}`;
      logMessage(errorMsg, "error");
      reject(new Error(errorMsg));
    });
  });
}

const detectionResultSchema = z.object({
  platform: z.string().nullish(),
  gpu_count: z.number().optional(),
  error: z.string().optional()
});

async function detectPlatformWithTorchruntime(): Promise<string> {
  const pythonPath = getPythonPath();
  
  const detectionScript = `
import torchruntime
import json
import sys

try:
    if not hasattr(torchruntime, 'device_db') or not hasattr(torchruntime, 'platform_detection'):
        raise AttributeError("torchruntime API structure has changed")
    
    gpus = torchruntime.device_db.get_gpus()
    platform = torchruntime.platform_detection.get_torch_platform(gpus)
    print(json.dumps({"platform": platform, "gpu_count": len(gpus)}))
except AttributeError as e:
    print(json.dumps({"error": f"torchruntime API error: {str(e)}"}), file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(json.dumps({"error": str(e)}), file=sys.stderr)
    sys.exit(1)
`;

  return new Promise((resolve, reject) => {
    const detectionProcess = spawn(
      pythonPath,
      ["-c", detectionScript],
      {
        env: getProcessEnv(),
        stdio: "pipe",
        // Prevent a console window from flashing on Windows.
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";

    detectionProcess.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    detectionProcess.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    detectionProcess.on("close", (code) => {
      if (code !== 0) {
        const errorMsg = `Torchruntime detection failed (exit code ${code}): ${stderr}`;
        logMessage(errorMsg, "error");
        reject(new Error(errorMsg));
        return;
      }

      try {
        const parsed = detectionResultSchema.safeParse(JSON.parse(stdout.trim()));
        if (!parsed.success) {
          reject(new Error(`Unexpected torchruntime output: ${stdout}`));
          return;
        }
        const result = parsed.data;

        if (result.error) {
          logMessage(`Torchruntime detection error: ${result.error}`, "error");
          reject(new Error(result.error));
          return;
        }

        if (!result.platform) {
          reject(new Error(`torchruntime returned no platform: ${stdout}`));
          return;
        }
        logMessage(`Detected torch platform: ${result.platform} (GPUs: ${result.gpu_count})`);
        resolve(result.platform);
      } catch (parseError) {
        logMessage(`Failed to parse torchruntime output: ${parseError}`, "error");
        reject(new Error(`Failed to parse detection result: ${stdout}`));
      }
    });

    detectionProcess.on("error", (error) => {
      const errorMsg = `Failed to run torchruntime detection: ${error.message}`;
      logMessage(errorMsg, "error");
      reject(new Error(errorMsg));
    });
  });
}

export async function detectTorchPlatform(): Promise<TorchruntimeDetectionResult> {
  try {
    emitBootMessage("Detecting GPU hardware...");
    logMessage("Starting GPU platform detection with torchruntime");

    const isInstalled = await isTorchruntimeInstalled();
    if (!isInstalled) {
      logMessage("Torchruntime not found, installing...");
      await installTorchruntime();
    } else {
      logMessage("Torchruntime is already installed");
    }

    const platform = await detectPlatformWithTorchruntime();
    const { backend, warning } = mapTorchPlatform(platform);
    const indexUrl = torchIndexUrl(backend);

    logMessage(`Platform detection complete: ${platform} -> ${backend ?? "PyPI default"}`);
    if (warning) {
      logMessage(warning, "warn");
      emitBootMessage(warning);
    }

    const result: TorchruntimeDetectionResult = { platform, backend, indexUrl };
    if (warning) {
      result.warning = warning;
    }
    return result;
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const backend = fallbackTorchBackend();
    logMessage(`GPU detection failed: ${errorMsg}`, "error");
    logMessage(
      backend === "auto"
        ? "Letting uv pick the PyTorch index from the installed GPU driver"
        : "Using the default PyPI torch wheels",
      "warn"
    );

    return {
      platform: "unknown",
      backend,
      indexUrl: torchIndexUrl(backend),
      error: errorMsg,
    };
  }
}
