import { spawn } from "child_process";
import { logMessage } from "./logger";
import { getPythonPath, getProcessEnv } from "./config";
import { emitBootMessage } from "./events";

/**
 * Torchruntime Integration Module
 * 
 * This module integrates torchruntime to automatically detect GPU hardware
 * and determine the appropriate PyTorch installation index URL.
 * 
 * Torchruntime supports:
 * - NVIDIA GPUs (CUDA 11.8, 12.4, 12.8, 12.9)
 * - AMD GPUs (ROCm 5.2, 5.7, 6.2, 6.4)
 * - Apple Silicon (MPS)
 * - CPU-only fallback
 */

export type TorchPlatform = 
  | "cu118" | "cu124" | "cu128" | "cu129"  // NVIDIA CUDA
  | "rocm5.2" | "rocm5.7" | "rocm6.2" | "rocm6.4"  // AMD ROCm
  | "mps"  // Apple Silicon
  | "cpu";  // CPU fallback

export interface TorchruntimeDetectionResult {
  platform: TorchPlatform;
  indexUrl: string | null;
  detectedAt?: string;
  error?: string;
}

const PYTORCH_INDEX_BASE = "https://download.pytorch.org/whl";

/**
 * Map torchruntime platform to PyTorch index URL
 */
function getPyTorchIndexUrl(platform: TorchPlatform): string | null {
  const indexMap: Record<TorchPlatform, string | null> = {
    "cu118": `${PYTORCH_INDEX_BASE}/cu118`,
    "cu124": `${PYTORCH_INDEX_BASE}/cu124`,
    "cu128": `${PYTORCH_INDEX_BASE}/cu128`,
    "cu129": `${PYTORCH_INDEX_BASE}/cu129`,
    "rocm5.2": `${PYTORCH_INDEX_BASE}/rocm5.2`,
    "rocm5.7": `${PYTORCH_INDEX_BASE}/rocm5.7`,
    "rocm6.2": `${PYTORCH_INDEX_BASE}/rocm6.2`,
    "rocm6.4": `${PYTORCH_INDEX_BASE}/rocm6.4`,
    "mps": null,  // Apple MPS uses PyPI default
    "cpu": `${PYTORCH_INDEX_BASE}/cpu`,
  };
  
  return indexMap[platform];
}

/**
 * Check if torchruntime is installed
 */
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
        }
      );

      let output = "";
      checkProcess.stdout?.on("data", (data: Buffer) => {
        output += data.toString();
      });

      checkProcess.on("exit", (code) => {
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

/**
 * Install torchruntime package
 */
async function installTorchruntime(): Promise<void> {
  emitBootMessage("Installing torchruntime for GPU detection...");
  logMessage("Installing torchruntime package");

  const pythonPath = getPythonPath();
  
  // Use version ~=2.0 to get latest 2.x with automatic updates
  // This allows bug fixes and PCI database updates while avoiding breaking changes
  const torchruntimeSpec = "torchruntime~=2.0";
  
  return new Promise((resolve, reject) => {
    const installProcess = spawn(
      pythonPath,
      ["-m", "pip", "install", "--quiet", torchruntimeSpec],
      {
        env: getProcessEnv(),
        stdio: "pipe",
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

    installProcess.on("exit", (code) => {
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
      const errorMsg = `Failed to spawn pip for torchruntime: ${error.message}`;
      logMessage(errorMsg, "error");
      reject(new Error(errorMsg));
    });
  });
}

/**
 * Detect GPU platform using torchruntime
 */
async function detectPlatformWithTorchruntime(): Promise<TorchPlatform> {
  const pythonPath = getPythonPath();
  
  // Wrap torchruntime API calls in try-catch to handle potential API changes
  const detectionScript = `
import torchruntime
import json
import sys

try:
    # Check for required APIs
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

    detectionProcess.on("exit", (code) => {
      if (code !== 0) {
        const errorMsg = `Torchruntime detection failed (exit code ${code}): ${stderr}`;
        logMessage(errorMsg, "error");
        reject(new Error(errorMsg));
        return;
      }

      try {
        const result = JSON.parse(stdout.trim());
        
        if (result.error) {
          logMessage(`Torchruntime detection error: ${result.error}`, "error");
          reject(new Error(result.error));
          return;
        }

        const platform = result.platform as TorchPlatform;
        logMessage(`Detected torch platform: ${platform} (GPUs: ${result.gpu_count})`);
        
        // Validate platform
        const validPlatforms: TorchPlatform[] = [
          "cu118", "cu124", "cu128", "cu129",
          "rocm5.2", "rocm5.7", "rocm6.2", "rocm6.4",
          "mps", "cpu"
        ];
        
        if (!validPlatforms.includes(platform)) {
          const error = `Unknown platform '${platform}' detected by torchruntime`;
          logMessage(error, "warn");
          reject(new Error(error));
          return;
        }
        
        resolve(platform);
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

/**
 * Main function to detect GPU and determine PyTorch installation parameters
 * Returns the torch platform, index URL, and DirectML requirement
 */
export async function detectTorchPlatform(): Promise<TorchruntimeDetectionResult> {
  try {
    emitBootMessage("Detecting GPU hardware...");
    logMessage("Starting GPU platform detection with torchruntime");

    // Check if torchruntime is installed, install if needed
    const isInstalled = await isTorchruntimeInstalled();
    if (!isInstalled) {
      logMessage("Torchruntime not found, installing...");
      await installTorchruntime();
    } else {
      logMessage("Torchruntime is already installed");
    }

    // Detect platform
    const platform = await detectPlatformWithTorchruntime();
    const indexUrl = getPyTorchIndexUrl(platform);

    logMessage(`Platform detection complete: ${platform}`);
    if (indexUrl) {
      logMessage(`PyTorch index URL: ${indexUrl}`);
    } else {
      logMessage("Using default PyPI index (no extra index needed)");
    }

    return {
      platform,
      indexUrl,
    };
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logMessage(`GPU detection failed: ${errorMsg}`, "error");
    logMessage("Falling back to CPU-only installation", "warn");
    
    return {
      platform: "cpu",
      indexUrl: getPyTorchIndexUrl("cpu"),
      error: errorMsg,
    };
  }
}

/**
 * Validate and normalize platform string from environment variable
 */
export function normalizePlatform(platformStr: string | undefined): TorchPlatform | null {
  if (!platformStr) {
    return null;
  }

  const normalized = platformStr.toLowerCase().trim();
  const validPlatforms: TorchPlatform[] = [
    "cu118", "cu124", "cu128", "cu129",
    "rocm5.2", "rocm5.7", "rocm6.2", "rocm6.4",
    "mps", "cpu"
  ];

  if (validPlatforms.includes(normalized as TorchPlatform)) {
    return normalized as TorchPlatform;
  }

  logMessage(`Invalid platform string '${platformStr}', ignoring`, "warn");
  return null;
}
