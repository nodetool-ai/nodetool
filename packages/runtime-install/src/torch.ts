import { spawn } from "node:child_process";
import { z } from "zod";

import { errorMessage, reportStatus, type RuntimeInstallHost } from "./host.js";
import { condaPythonPath, condaUvPath } from "./paths.js";

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
 * cu126, cu128 and cu130, ROCm 7.2, xpu and cpu. uv takes torch packages
 * (torch, torchvision, torchaudio, torchcodec) only from the `--torch-backend`
 * index. When that index lacks a build the packs need, the pack install
 * retries once with the CPU index and warns (see `python-packs.ts`). Update
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

/**
 * The oldest uv that accepts each `--torch-backend` value. Older uv releases
 * reject the value as a CLI error. Measured by running each uv release from
 * PyPI with each value.
 */
export const MIN_UV_FOR_TORCH_BACKEND: Record<TorchBackend, string> = {
  cpu: "0.6.9",
  cu126: "0.6.9",
  auto: "0.6.9",
  cu128: "0.7.0",
  xpu: "0.8.0",
  cu130: "0.9.3",
  "rocm7.2": "0.11.3",
};

/** The uv the Python runtime installs: one that accepts every backend above. */
export const MIN_UV_VERSION = "0.11.3";

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

function pythonPath(host: RuntimeInstallHost): string {
  return condaPythonPath(host.condaEnvPath(), host.platform);
}

async function isTorchruntimeInstalled(host: RuntimeInstallHost): Promise<boolean> {
  try {
    const python = pythonPath(host);
    return await new Promise((resolve) => {
      const checkProcess = spawn(python, ["-c", "import torchruntime; print('installed')"], {
        env: host.processEnv(),
        stdio: "pipe",
        // Prevent a console window from flashing on Windows.
        windowsHide: true,
      });
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
    host.log("error", `Error checking torchruntime installation: ${errorMessage(error)}`);
    return false;
  }
}

async function installTorchruntime(host: RuntimeInstallHost): Promise<void> {
  reportStatus(host, "Installing torchruntime for GPU detection...");
  host.log("info", "Installing torchruntime package");
  const python = pythonPath(host);
  const torchruntimeSpec = "torchruntime~=2.0";

  return new Promise((resolve, reject) => {
    // The Python runtime ships uv, not pip, so install through uv into the
    // runtime's interpreter.
    const installProcess = spawn(
      condaUvPath(host.condaEnvPath(), host.platform),
      ["pip", "install", "--python", python, "--quiet", torchruntimeSpec],
      {
        env: host.processEnv(),
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
      host.log("info", `torchruntime install: ${data.toString().trim()}`);
    });
    installProcess.on("close", (code) => {
      if (code === 0) {
        host.log("info", "Torchruntime installed successfully");
        resolve();
      } else {
        const message = `Failed to install torchruntime (exit code ${code}): ${stderr}`;
        host.log("error", message);
        reject(new Error(message));
      }
    });
    installProcess.on("error", (error) => {
      const message = `Failed to spawn uv for torchruntime: ${error.message}`;
      host.log("error", message);
      reject(new Error(message));
    });
  });
}

const detectionResultSchema = z.object({
  platform: z.string().nullish(),
  gpu_count: z.number().optional(),
  error: z.string().optional()
});

const DETECTION_SCRIPT = `
import contextlib
import torchruntime
import json
import sys

try:
    if not hasattr(torchruntime, 'device_db') or not hasattr(torchruntime, 'platform_detection'):
        raise AttributeError("torchruntime API structure has changed")

    # torchruntime prints "[WARNING] ..." lines on stdout. Keep stdout for
    # the JSON result.
    with contextlib.redirect_stdout(sys.stderr):
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

async function detectPlatformWithTorchruntime(host: RuntimeInstallHost): Promise<string> {
  return new Promise((resolve, reject) => {
    const detectionProcess = spawn(pythonPath(host), ["-c", DETECTION_SCRIPT], {
      env: host.processEnv(),
      stdio: "pipe",
      // Prevent a console window from flashing on Windows.
      windowsHide: true,
    });
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
        const message = `Torchruntime detection failed (exit code ${code}): ${stderr}`;
        host.log("error", message);
        reject(new Error(message));
        return;
      }
      try {
        // The JSON result is the last line. Anything a library printed on
        // stdout before it is not part of the result.
        const lastLine = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).pop() ?? "";
        const parsed = detectionResultSchema.safeParse(JSON.parse(lastLine));
        if (!parsed.success) {
          reject(new Error(`Unexpected torchruntime output: ${stdout}`));
          return;
        }
        const result = parsed.data;
        if (result.error) {
          host.log("error", `Torchruntime detection error: ${result.error}`);
          reject(new Error(result.error));
          return;
        }
        if (!result.platform) {
          reject(new Error(`torchruntime returned no platform: ${stdout}`));
          return;
        }
        host.log("info", `Detected torch platform: ${result.platform} (GPUs: ${result.gpu_count})`);
        resolve(result.platform);
      } catch (parseError) {
        host.log("error", `Failed to parse torchruntime output: ${errorMessage(parseError)}`);
        reject(new Error(`Failed to parse detection result: ${stdout}`));
      }
    });
    detectionProcess.on("error", (error) => {
      const message = `Failed to run torchruntime detection: ${error.message}`;
      host.log("error", message);
      reject(new Error(message));
    });
  });
}

/**
 * Detect the GPU platform with torchruntime, installing it first when the
 * Python runtime lacks it. A failure returns the fallback backend with
 * `error` set instead of throwing.
 */
export async function detectTorchPlatform(host: RuntimeInstallHost): Promise<TorchruntimeDetectionResult> {
  try {
    reportStatus(host, "Detecting GPU hardware...");
    host.log("info", "Starting GPU platform detection with torchruntime");
    if (!(await isTorchruntimeInstalled(host))) {
      host.log("info", "Torchruntime not found, installing...");
      await installTorchruntime(host);
    } else {
      host.log("info", "Torchruntime is already installed");
    }

    const platform = await detectPlatformWithTorchruntime(host);
    const { backend, warning } = mapTorchPlatform(platform);
    const indexUrl = torchIndexUrl(backend);
    host.log("info", `Platform detection complete: ${platform} -> ${backend ?? "PyPI default"}`);
    if (warning) {
      host.log("warn", warning);
      host.status?.(warning);
    }
    const result: TorchruntimeDetectionResult = { platform, backend, indexUrl };
    if (warning) {
      result.warning = warning;
    }
    return result;
  } catch (error: unknown) {
    const message = errorMessage(error);
    const backend = fallbackTorchBackend(host.platform);
    host.log("error", `GPU detection failed: ${message}`);
    host.log(
      "warn",
      backend === "auto"
        ? "Letting uv pick the PyTorch index from the installed GPU driver"
        : "Using the default PyPI torch wheels"
    );
    return { platform: "unknown", backend, indexUrl: torchIndexUrl(backend), error: message };
  }
}

const TORCH_PLATFORM_SETTING_KEY = "TORCH_PLATFORM_DETECTED";

interface SavedTorchData {
  platform: string;
  error?: unknown;
  detectedAt?: string;
}

function isSavedTorchData(value: unknown): value is SavedTorchData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return typeof obj.platform === "string" && obj.platform.length > 0;
}

/**
 * The last successful GPU detection, or null when none is saved.
 *
 * Only the platform torchruntime reported is stored. The backend and index
 * are derived from it on every read, so a new mapping in a later release
 * applies without a re-detection. An entry that recorded a failed detection
 * (older versions saved those as `cpu`) is ignored, so the next install
 * detects again.
 */
export function getSavedTorchPlatform(host: RuntimeInstallHost): TorchruntimeDetectionResult | null {
  try {
    const saved = host.settings.read(TORCH_PLATFORM_SETTING_KEY);
    if (!isSavedTorchData(saved)) {
      if (saved) {
        host.log("warn", "Invalid torch platform data in settings, ignoring");
      }
      return null;
    }
    if (saved.error) {
      host.log("warn", "Saved torch platform came from a failed detection, ignoring");
      return null;
    }
    const { backend, warning } = mapTorchPlatform(saved.platform);
    const result: TorchruntimeDetectionResult = {
      platform: saved.platform,
      backend,
      indexUrl: torchIndexUrl(backend),
    };
    if (warning) {
      result.warning = warning;
    }
    if (saved.detectedAt) {
      result.detectedAt = saved.detectedAt;
    }
    return result;
  } catch (error: unknown) {
    host.log("warn", `Failed to read saved torch platform: ${errorMessage(error)}`);
    return null;
  }
}

/**
 * The `--torch-backend` for package installs: the saved detection's backend,
 * or null (default PyPI wheels) when nothing has been detected yet.
 */
export function getTorchBackend(host: RuntimeInstallHost): TorchBackend | null {
  return getSavedTorchPlatform(host)?.backend ?? null;
}

/** uv arguments that route torch packages to the detected PyTorch index. */
export function torchBackendArgs(backend: TorchBackend | null): string[] {
  return backend ? ["--torch-backend", backend] : [];
}

/**
 * Save a successful detection. A result that carries `error` is not saved:
 * persisting a failed detection pinned CPU torch for good.
 */
export function saveTorchPlatform(host: RuntimeInstallHost, result: TorchruntimeDetectionResult): void {
  if (result.error) {
    host.log("warn", `Not saving failed torch platform detection: ${result.error}`);
    return;
  }
  try {
    host.settings.write(TORCH_PLATFORM_SETTING_KEY, {
      platform: result.platform,
      detectedAt: new Date().toISOString(),
    });
    host.log("info", `Saved torch platform: ${result.platform}`);
  } catch (error: unknown) {
    host.log("error", `Failed to save torch platform: ${errorMessage(error)}`);
  }
}
