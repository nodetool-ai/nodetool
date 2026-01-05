import { spawn } from "child_process";
import { logMessage } from "./logger";
import { getPythonPath, getProcessEnv } from "./config";
import { emitBootMessage } from "./events";

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
    "mps": null,
    "cpu": `${PYTORCH_INDEX_BASE}/cpu`,
  };
  
  return indexMap[platform];
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

async function installTorchruntime(): Promise<void> {
  emitBootMessage("Installing torchruntime for GPU detection...");
  logMessage("Installing torchruntime package");

  const pythonPath = getPythonPath();
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

async function detectPlatformWithTorchruntime(): Promise<TorchPlatform> {
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

export async function installTorchWithUvs(): Promise<TorchruntimeDetectionResult> {
  try {
    emitBootMessage("Installing PyTorch with torchruntime...");
    logMessage("Running torchruntime install --uv for automatic GPU detection and torch installation");

    const pythonPath = getPythonPath();

    // First install torchruntime if not already installed
    logMessage("Ensuring torchruntime is installed...");
    const isInstalled = await isTorchruntimeInstalled();
    if (!isInstalled) {
      await installTorchruntime();
    } else {
      logMessage("Torchruntime already installed");
    }

    try {
      const result = await new Promise<TorchruntimeDetectionResult>((resolve, reject) => {
        const installProcess = spawn(
          pythonPath,
          ["-m", "torchruntime", "install", "--uv"],
          {
            env: getProcessEnv(),
            stdio: "pipe",
          }
        );

        let stdout = "";
        let stderr = "";

        installProcess.stdout?.on("data", (data: Buffer) => {
          const output = data.toString();
          stdout += output;
          logMessage(`torchruntime: ${output.trim()}`);
        });

        installProcess.stderr?.on("data", (data: Buffer) => {
          const output = data.toString();
          stderr += output;
          logMessage(`torchruntime: ${output.trim()}`);
        });

        installProcess.on("exit", (code) => {
          if (code === 0) {
            logMessage("PyTorch installation via torchruntime completed successfully");

            const platform = extractPlatformFromOutput(stdout) || "cpu";
            const indexUrl = getPyTorchIndexUrl(platform);

            resolve({
              platform,
              indexUrl,
            });
          } else {
            const errorMsg = `torchruntime install failed (exit code ${code}): ${stderr}`;
            logMessage(errorMsg, "error");
            reject(new Error(errorMsg));
          }
        });

        installProcess.on("error", (error) => {
          const errorMsg = `Failed to run torchruntime install: ${error.message}`;
          logMessage(errorMsg, "error");
          reject(new Error(errorMsg));
        });
      });

      return result;
    } catch (error: any) {
      logMessage(`PyTorch installation process failed: ${error.message}`, "error");
      logMessage("Falling back to CPU-only installation", "warn");

      return {
        platform: "cpu",
        indexUrl: getPyTorchIndexUrl("cpu"),
        error: error.message,
      };
    }
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logMessage(`PyTorch installation failed: ${errorMsg}`, "error");
    logMessage("Falling back to CPU-only installation", "warn");

    return {
      platform: "cpu",
      indexUrl: getPyTorchIndexUrl("cpu"),
      error: errorMsg,
    };
  }
}

function extractPlatformFromOutput(output: string): TorchPlatform | null {
  const platformMatch = output.match(/detected[^\n]*?(cu\d+|rocm[\d.]+|mps|cpu)/i);
  if (platformMatch) {
    const platform = platformMatch[1].toLowerCase();
    const validPlatforms: TorchPlatform[] = [
      "cu118", "cu124", "cu128", "cu129",
      "rocm5.2", "rocm5.7", "rocm6.2", "rocm6.4",
      "mps", "cpu"
    ];
    if (validPlatforms.includes(platform as TorchPlatform)) {
      return platform as TorchPlatform;
    }
  }
  return null;
}

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
