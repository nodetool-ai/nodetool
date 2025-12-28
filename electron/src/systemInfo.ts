/**
 * System Information gathering module.
 *
 * Collects system information for display in the About dialog,
 * including OS details, installation paths, and tool versions.
 */

import * as os from "os";
import { app } from "electron";
import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";

import {
  getCondaEnvPath,
  getPythonPath,
  getSystemDataPath,
  getLlamaServerPath,
} from "./config";
import { logMessage, LOG_FILE } from "./logger";
import { SystemInfo } from "./types.d";

const execAsync = promisify(exec);

/**
 * Execute a command and return its output, or null if it fails
 */
async function execCommand(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, { timeout: 10000 });
    return stdout.trim();
  } catch (error) {
    logMessage(`Command failed: ${command} - ${error}`, "warn");
    return null;
  }
}

/**
 * Get Python version from the conda environment
 */
async function getPythonVersion(): Promise<string | null> {
  try {
    const pythonPath = getPythonPath();
    const output = await execCommand(`"${pythonPath}" --version`);
    // Output is like "Python 3.11.0"
    if (output) {
      return output.replace("Python ", "").trim();
    }
    return null;
  } catch (error) {
    logMessage(`Failed to get Python version: ${error}`, "warn");
    return null;
  }
}

/**
 * Get Ollama version if installed
 */
async function getOllamaVersion(): Promise<string | null> {
  try {
    const output = await execCommand("ollama --version");
    // Output format may vary, try to extract version
    if (output) {
      // Parse output like "ollama version is 0.1.23" or just "0.1.23"
      const versionMatch = output.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : output;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if Ollama is installed
 */
async function checkOllamaInstalled(): Promise<boolean> {
  const version = await getOllamaVersion();
  return version !== null;
}

/**
 * Get llama-server version if installed
 */
async function getLlamaServerVersion(): Promise<string | null> {
  try {
    const llamaPath = getLlamaServerPath();
    // Check if file exists first
    await fs.access(llamaPath);
    const output = await execCommand(`"${llamaPath}" --version`);
    if (output) {
      // Try to extract version from output
      const versionMatch = output.match(/version[:\s]+(\S+)/i) || output.match(/(\d+\.\d+\.\d+)/);
      return versionMatch ? versionMatch[1] : output.split("\n")[0];
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if llama-server is installed
 */
async function checkLlamaServerInstalled(): Promise<boolean> {
  try {
    const llamaPath = getLlamaServerPath();
    await fs.access(llamaPath);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get CUDA version if available
 */
async function getCudaVersion(): Promise<string | null> {
  try {
    // Try nvidia-smi first (most reliable)
    const nvidiaSmiOutput = await execCommand("nvidia-smi --query-gpu=driver_version --format=csv,noheader");
    if (nvidiaSmiOutput) {
      // Also try to get CUDA version
      const cudaOutput = await execCommand("nvidia-smi");
      if (cudaOutput) {
        const cudaMatch = cudaOutput.match(/CUDA Version:\s+(\d+\.\d+)/);
        if (cudaMatch) {
          return cudaMatch[1];
        }
      }
      return `Driver ${nvidiaSmiOutput}`;
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if CUDA is available
 */
async function checkCudaAvailable(): Promise<boolean> {
  try {
    const output = await execCommand("nvidia-smi");
    return output !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Get OS version string
 */
function getOsVersion(): string {
  const platform = process.platform;
  const release = os.release();

  switch (platform) {
    case "darwin": {
      // macOS version mapping
      const macVersionMap: Record<string, string> = {
        "24": "Sequoia",
        "23": "Sonoma",
        "22": "Ventura",
        "21": "Monterey",
        "20": "Big Sur",
        "19": "Catalina",
      };
      const majorVersion = release.split(".")[0];
      const macName = macVersionMap[majorVersion] || "";
      return `${release}${macName ? ` (${macName})` : ""}`;
    }
    case "win32":
      return release;
    case "linux":
      return release;
    default:
      return release;
  }
}

/**
 * Get OS name
 */
function getOsName(): string {
  switch (process.platform) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}

/**
 * Gather all system information
 */
export async function getSystemInfo(): Promise<SystemInfo> {
  logMessage("Gathering system information...");

  // Run independent checks in parallel
  const [
    pythonVersion,
    ollamaVersion,
    llamaServerVersion,
    cudaVersion,
    cudaAvailable,
    ollamaInstalled,
    llamaServerInstalled,
  ] = await Promise.all([
    getPythonVersion(),
    getOllamaVersion(),
    getLlamaServerVersion(),
    getCudaVersion(),
    checkCudaAvailable(),
    checkOllamaInstalled(),
    checkLlamaServerInstalled(),
  ]);

  const systemInfo: SystemInfo = {
    // App information
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    // OS information
    os: getOsName(),
    osVersion: getOsVersion(),
    arch: process.arch,
    // Paths
    installPath: app.getPath("exe"),
    condaEnvPath: getCondaEnvPath(),
    dataPath: getSystemDataPath(""),
    logsPath: LOG_FILE,
    // Python and package versions
    pythonVersion,
    // Feature availability
    cudaAvailable,
    cudaVersion,
    ollamaInstalled,
    ollamaVersion,
    llamaServerInstalled,
    llamaServerVersion,
  };

  logMessage(`System info gathered: ${JSON.stringify(systemInfo)}`);
  return systemInfo;
}
