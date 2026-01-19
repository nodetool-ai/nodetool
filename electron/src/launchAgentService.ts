/**
 * @module launchAgentService
 * @description Manages macOS LaunchAgent for running the NodeTool backend server as a background service
 *
 * This module provides functionality to install, uninstall, and manage the NodeTool backend server
 * as a macOS LaunchAgent. The LaunchAgent enables the server to run in the background, start
 * automatically at login, and persist independently of the Electron app.
 *
 * Key features:
 * - Installing the server as a LaunchAgent (writes plist, loads with launchctl)
 * - Uninstalling the LaunchAgent (unloads with launchctl, removes plist)
 * - Checking if the LaunchAgent is installed
 * - Getting the current status of the LaunchAgent service
 *
 * Note: This module is macOS-specific and will return appropriate error messages on other platforms.
 */

import { app } from "electron";
import * as path from "path";
import { promises as fsPromises } from "fs";
import { logMessage } from "./logger";
import { exec } from "child_process";
import { promisify } from "util";
import {
  getPythonPath,
  getProcessEnv,
  webPath,
  getCondaEnvPath,
  getOllamaModelsPath,
} from "./config";
import { readSettings } from "./settings";
import type { LaunchAgentStatus, LaunchAgentResult } from "./types.d";

const execAsync = promisify(exec);

// LaunchAgent configuration
const LAUNCH_AGENT_DIR: string = path.join(
  app.getPath("home"),
  "Library/LaunchAgents"
);
const AGENT_LABEL = "ai.nodetool.server";
const PLIST_FILENAME = `${AGENT_LABEL}.plist`;
const PLIST_PATH = path.join(LAUNCH_AGENT_DIR, PLIST_FILENAME);

// Log directory for the LaunchAgent
const LOG_DIR: string = path.join(
  app.getPath("home"),
  "Library/Logs/nodetool"
);

/**
 * Check if running on macOS
 */
function isMacOS(): boolean {
  return process.platform === "darwin";
}

/**
 * Ensures the log directory exists with proper permissions
 */
async function ensureLogDirectory(): Promise<void> {
  try {
    await fsPromises.mkdir(LOG_DIR, { recursive: true, mode: 0o755 });
    logMessage(`Ensured log directory exists at: ${LOG_DIR}`);
  } catch (err) {
    logMessage(
      `Failed to create log directory: ${(err as Error).message}`,
      "error"
    );
    throw err;
  }
}

/**
 * Generates the plist content for the LaunchAgent
 * @param port - The port the server should run on (default: 7777)
 * @returns The plist XML content as a string
 */
function generatePlistContent(port: number = 7777): string {
  const pythonPath = getPythonPath();
  const processEnv = getProcessEnv();
  const condaEnvPath = getCondaEnvPath();
  const ollamaModelsPath = getOllamaModelsPath();

  // Determine model backend from settings
  let modelBackend = "ollama";
  try {
    const settings = readSettings();
    const configuredBackend = settings["MODEL_BACKEND"];
    if (
      typeof configuredBackend === "string" &&
      (configuredBackend === "ollama" ||
        configuredBackend === "llama_cpp" ||
        configuredBackend === "none")
    ) {
      modelBackend = configuredBackend;
    }
  } catch (error) {
    logMessage(
      `Failed to read settings for model backend, defaulting to ${modelBackend}: ${error}`,
      "warn"
    );
  }

  // Build environment variables for the plist
  const envDict = `
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>${processEnv.PATH}</string>
        <key>PYTHONPATH</key>
        <string>${processEnv.PYTHONPATH}</string>
        <key>PYTHONUNBUFFERED</key>
        <string>1</string>
        <key>PYTHONNOUSERSITE</key>
        <string>1</string>
        <key>OLLAMA_API_URL</key>
        <string>http://127.0.0.1:11435</string>
        <key>OLLAMA_MODELS</key>
        <string>${ollamaModelsPath}</string>
        <key>CONDA_PREFIX</key>
        <string>${condaEnvPath}</string>
        <key>MODEL_BACKEND</key>
        <string>${modelBackend}</string>
    </dict>`;

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${pythonPath}</string>
        <string>-m</string>
        <string>nodetool.cli</string>
        <string>serve</string>
        <string>--port</string>
        <string>${port}</string>
        <string>--static-folder</string>
        <string>${webPath}</string>
    </array>
    ${envDict}
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${path.join(LOG_DIR, "server.out.log")}</string>
    <key>StandardErrorPath</key>
    <string>${path.join(LOG_DIR, "server.err.log")}</string>
    <key>WorkingDirectory</key>
    <string>${path.dirname(pythonPath)}</string>
    <key>ThrottleInterval</key>
    <integer>10</integer>
</dict>
</plist>`;

  return plistContent;
}

/**
 * Checks if the LaunchAgent plist file exists
 */
async function isPlistInstalled(): Promise<boolean> {
  try {
    await fsPromises.access(PLIST_PATH);
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the status of the LaunchAgent using launchctl
 */
async function getServiceStatus(): Promise<LaunchAgentStatus> {
  const status: LaunchAgentStatus = {
    installed: false,
    running: false,
    label: AGENT_LABEL,
    plistPath: PLIST_PATH,
  };

  if (!isMacOS()) {
    status.error = "LaunchAgent is only supported on macOS";
    return status;
  }

  // Check if plist file exists
  status.installed = await isPlistInstalled();

  if (!status.installed) {
    return status;
  }

  try {
    // Use launchctl list to check if the service is loaded and get its status
    const { stdout } = await execAsync(`launchctl list`);
    const lines = stdout.split("\n");

    for (const line of lines) {
      if (line.includes(AGENT_LABEL)) {
        status.running = true;
        // Parse the PID from the output (format: "PID\tStatus\tLabel")
        const parts = line.trim().split(/\s+/);
        if (parts[0] && parts[0] !== "-") {
          const pid = parseInt(parts[0], 10);
          if (!isNaN(pid)) {
            status.pid = pid;
          }
        }
        break;
      }
    }
  } catch (error) {
    logMessage(
      `Error checking LaunchAgent status: ${(error as Error).message}`,
      "warn"
    );
  }

  return status;
}

/**
 * Installs the NodeTool server as a macOS LaunchAgent
 * @param port - The port the server should run on (default: 7777)
 * @returns Result object indicating success or failure
 */
async function installLaunchAgent(port: number = 7777): Promise<LaunchAgentResult> {
  if (!isMacOS()) {
    return {
      success: false,
      message: "LaunchAgent installation is only supported on macOS",
    };
  }

  try {
    logMessage(`Installing LaunchAgent for NodeTool server on port ${port}`);

    // Ensure the LaunchAgents directory exists
    await fsPromises.mkdir(LAUNCH_AGENT_DIR, { recursive: true });

    // Ensure log directory exists
    await ensureLogDirectory();

    // Check if already installed and unload first if so
    const currentStatus = await getServiceStatus();
    if (currentStatus.installed && currentStatus.running) {
      logMessage("LaunchAgent already running, unloading before reinstall...");
      try {
        await execAsync(`launchctl unload "${PLIST_PATH}"`);
        // Small delay to ensure clean unload
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logMessage(
          `Warning: Failed to unload existing LaunchAgent: ${(error as Error).message}`,
          "warn"
        );
      }
    }

    // Generate and write the plist file
    const plistContent = generatePlistContent(port);
    await fsPromises.writeFile(PLIST_PATH, plistContent, { mode: 0o644 });
    logMessage(`Wrote LaunchAgent plist to ${PLIST_PATH}`);

    // Load the LaunchAgent using launchctl
    try {
      await execAsync(`launchctl load "${PLIST_PATH}"`);
      logMessage("LaunchAgent loaded successfully");
    } catch (error) {
      const errorMessage = (error as Error).message;
      logMessage(`Error loading LaunchAgent: ${errorMessage}`, "error");
      return {
        success: false,
        message: `Failed to load LaunchAgent: ${errorMessage}`,
      };
    }

    // Get the updated status
    const status = await getServiceStatus();

    return {
      success: true,
      message: `NodeTool server LaunchAgent installed successfully. The server will start automatically at login.`,
      status,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    logMessage(`Failed to install LaunchAgent: ${errorMessage}`, "error");
    return {
      success: false,
      message: `Failed to install LaunchAgent: ${errorMessage}`,
    };
  }
}

/**
 * Uninstalls the NodeTool server LaunchAgent
 * @returns Result object indicating success or failure
 */
async function uninstallLaunchAgent(): Promise<LaunchAgentResult> {
  if (!isMacOS()) {
    return {
      success: false,
      message: "LaunchAgent uninstallation is only supported on macOS",
    };
  }

  try {
    logMessage("Uninstalling LaunchAgent for NodeTool server");

    const currentStatus = await getServiceStatus();

    if (!currentStatus.installed) {
      return {
        success: true,
        message: "LaunchAgent is not installed",
        status: currentStatus,
      };
    }

    // Unload the LaunchAgent if it's running
    if (currentStatus.running) {
      try {
        await execAsync(`launchctl unload "${PLIST_PATH}"`);
        logMessage("LaunchAgent unloaded successfully");
        // Small delay to ensure clean unload
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logMessage(
          `Warning: Failed to unload LaunchAgent: ${(error as Error).message}`,
          "warn"
        );
      }
    }

    // Remove the plist file
    try {
      await fsPromises.unlink(PLIST_PATH);
      logMessage(`Removed LaunchAgent plist from ${PLIST_PATH}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logMessage(
          `Error removing plist file: ${(error as Error).message}`,
          "error"
        );
      }
    }

    // Get the updated status
    const status = await getServiceStatus();

    return {
      success: true,
      message: "NodeTool server LaunchAgent uninstalled successfully",
      status,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    logMessage(`Failed to uninstall LaunchAgent: ${errorMessage}`, "error");
    return {
      success: false,
      message: `Failed to uninstall LaunchAgent: ${errorMessage}`,
    };
  }
}

/**
 * Starts the LaunchAgent service (if installed but not running)
 * @returns Result object indicating success or failure
 */
async function startLaunchAgent(): Promise<LaunchAgentResult> {
  if (!isMacOS()) {
    return {
      success: false,
      message: "LaunchAgent is only supported on macOS",
    };
  }

  const currentStatus = await getServiceStatus();

  if (!currentStatus.installed) {
    return {
      success: false,
      message: "LaunchAgent is not installed. Please install it first.",
      status: currentStatus,
    };
  }

  if (currentStatus.running) {
    return {
      success: true,
      message: "LaunchAgent is already running",
      status: currentStatus,
    };
  }

  try {
    await execAsync(`launchctl load "${PLIST_PATH}"`);
    logMessage("LaunchAgent started successfully");

    // Small delay to allow service to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const status = await getServiceStatus();
    return {
      success: true,
      message: "LaunchAgent started successfully",
      status,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    logMessage(`Failed to start LaunchAgent: ${errorMessage}`, "error");
    return {
      success: false,
      message: `Failed to start LaunchAgent: ${errorMessage}`,
    };
  }
}

/**
 * Stops the LaunchAgent service (if running)
 * @returns Result object indicating success or failure
 */
async function stopLaunchAgent(): Promise<LaunchAgentResult> {
  if (!isMacOS()) {
    return {
      success: false,
      message: "LaunchAgent is only supported on macOS",
    };
  }

  const currentStatus = await getServiceStatus();

  if (!currentStatus.installed) {
    return {
      success: false,
      message: "LaunchAgent is not installed",
      status: currentStatus,
    };
  }

  if (!currentStatus.running) {
    return {
      success: true,
      message: "LaunchAgent is not running",
      status: currentStatus,
    };
  }

  try {
    await execAsync(`launchctl unload "${PLIST_PATH}"`);
    logMessage("LaunchAgent stopped successfully");

    // Small delay to allow service to stop
    await new Promise((resolve) => setTimeout(resolve, 500));

    const status = await getServiceStatus();
    return {
      success: true,
      message: "LaunchAgent stopped successfully",
      status,
    };
  } catch (error) {
    const errorMessage = (error as Error).message;
    logMessage(`Failed to stop LaunchAgent: ${errorMessage}`, "error");
    return {
      success: false,
      message: `Failed to stop LaunchAgent: ${errorMessage}`,
    };
  }
}

/**
 * Gets the path to the LaunchAgent log files
 */
function getLaunchAgentLogPaths(): { stdout: string; stderr: string } {
  return {
    stdout: path.join(LOG_DIR, "server.out.log"),
    stderr: path.join(LOG_DIR, "server.err.log"),
  };
}

export {
  installLaunchAgent,
  uninstallLaunchAgent,
  startLaunchAgent,
  stopLaunchAgent,
  getServiceStatus,
  isPlistInstalled,
  getLaunchAgentLogPaths,
  AGENT_LABEL,
  PLIST_PATH,
  LOG_DIR,
};
