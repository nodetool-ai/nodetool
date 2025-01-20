import { spawn, ChildProcess, exec } from "child_process";
import { dialog, shell, app } from "electron";
import { logMessage } from "./logger";
import {
  getPythonPath,
  getProcessEnv,
  srcPath,
  PID_FILE_PATH,
  LAUNCHD_SERVICE_NAME,
  PLIST_PATH,
  webPath,
} from "./config";
import path from "path";
import { forceQuit } from "./window";
import { emitBootMessage, emitServerStarted, emitServerLog } from "./events";
import { serverState } from "./state";
import fs from "fs/promises";
import net from "net";
import { updateTrayMenu } from "./tray";
import { LOG_FILE } from "./logger";
import { runWorkflow } from "./workflow-window";

interface ServerState {
  initialURL: string;
}

let nodeToolBackendProcess: ChildProcess | null = null;
let recentServerMessages: string[] = [];
const MAX_RECENT_MESSAGES: number = 5;

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .listen(port, "127.0.0.1")
      .once("listening", () => {
        server.close();
        resolve(true);
      })
      .once("error", () => resolve(false));
  });
}

async function showPortInUseError(): Promise<void> {
  dialog.showErrorBox(
    "Port Already in Use",
    "Port 8000 is already in use. Please ensure no other applications are using this port and try again."
  );
  app.quit();
}

async function writePidFile(pid: number): Promise<void> {
  try {
    await fs.writeFile(PID_FILE_PATH, pid.toString());
    logMessage(`Written PID ${pid} to ${PID_FILE_PATH}`);
  } catch (error) {
    logMessage(
      `Failed to write PID file: ${(error as Error).message}`,
      "error"
    );
  }
}

async function killExistingServer(): Promise<void> {
  try {
    const pidContent = await fs.readFile(PID_FILE_PATH, "utf8");
    const pid = parseInt(pidContent, 10);

    if (pid) {
      try {
        logMessage(`Killing existing server process ${pid}`);
        process.kill(pid);

        await new Promise<void>((resolve) => {
          const checkInterval = setInterval(() => {
            try {
              process.kill(pid, 0);
            } catch (e) {
              if ((e as NodeJS.ErrnoException).code === "ESRCH") {
                clearInterval(checkInterval);
                resolve();
              }
            }
          }, 100);

          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 5000);
        });

        logMessage(`Killed existing server process ${pid}`);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          logMessage(
            `Error killing process ${pid}: ${(error as Error).message}`,
            "error"
          );
        }
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logMessage(
        `Error reading PID file: ${(error as Error).message}`,
        "error"
      );
    }
  }
}

async function startServer(): Promise<void> {
  emitBootMessage("Configuring server environment...");

  const pythonExecutablePath = getPythonPath();

  const args = [
    "-m",
    "nodetool.cli",
    "serve",
    "--port",
    "8000",
    "--static-folder",
    webPath,
  ];

  logMessage(`Using command: ${pythonExecutablePath} ${args.join(" ")}`);

  try {
    nodeToolBackendProcess = spawn(pythonExecutablePath, args, {
      stdio: "pipe",
      shell: false,
      env: getProcessEnv(),
      detached: false,
      windowsHide: true,
    });
  } catch (error) {
    forceQuit(`Failed to spawn server process: ${(error as Error).message}`);
    return;
  }

  nodeToolBackendProcess.on("spawn", () => {
    logMessage("NodeTool server starting...");
    emitBootMessage("NodeTool server starting...");
    if (nodeToolBackendProcess?.pid) {
      writePidFile(nodeToolBackendProcess.pid);
    }
  });

  nodeToolBackendProcess.stdout?.on("data", handleServerOutput);
  nodeToolBackendProcess.stderr?.on("data", handleServerOutput);

  nodeToolBackendProcess.on("error", (error) => {
    forceQuit(`Server process error: ${error.message}`);
  });

  nodeToolBackendProcess.on("exit", (code, signal) => {
    logMessage(`Server process exited with code ${code} and signal ${signal}`);
  });
}

function handleServerOutput(data: Buffer): void {
  const output = data.toString().trim();
  if (output) {
    logMessage(output);
    recentServerMessages.push(output);
    if (recentServerMessages.length > MAX_RECENT_MESSAGES) {
      recentServerMessages.shift();
    }
  }

  if (output.includes("Address already in use")) {
    logMessage("Port is blocked, quitting application", "error");
    dialog.showErrorBox(
      "Server Error",
      "The server cannot start because the port is already in use. Please close any applications using the port and try again."
    );
    app.quit();
  }

  if (output.includes("ModuleNotFoundError")) {
    logMessage("Python module not found error", "error");
    dialog.showErrorBox(
      "Server Error",
      "Failed to start server due to missing Python module. Please try reinstalling the application."
    );
    app.quit();
  }

  if (output.includes("Application startup complete.")) {
    logMessage("Server startup complete");
    emitBootMessage("Loading application...");
    emitServerStarted();
    updateTrayMenu();
  }
  emitServerLog(output);
}

async function ensureOllamaIsRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://localhost:11434/api/version");
    return response && response.status === 200;
  } catch (error) {
    await showOllamaInstallDialog();
    return false;
  }
}

async function showOllamaInstallDialog(): Promise<void> {
  const downloadUrl = "https://ollama.com/download";
  const response = await dialog.showMessageBox({
    type: "info",
    title: "Ollama Required",
    message: "Ollama is required to run AI models locally",
    detail:
      "Ollama is an open-source tool that allows NodeTool to run AI models locally on your machine. This provides better privacy and performance compared to cloud-based solutions.\n\nPlease download and install Ollama to continue using NodeTool's AI features.",
    buttons: ["Download Ollama", "Cancel"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response.response === 0) {
    await shell.openExternal(downloadUrl);
  }
}

async function createLaunchdPlist(): Promise<void> {
  const pythonPath = getPythonPath();
  const binPath = path.dirname(pythonPath);
  const logPath = path.join(app.getPath("logs"), "nodetool-server.log");
  const errorLogPath = path.join(
    app.getPath("logs"),
    "nodetool-server-error.log"
  );

  try {
    await fs.unlink(logPath).catch(() => {});
    await fs.unlink(errorLogPath).catch(() => {});
    logMessage("Cleaned up existing log files");
  } catch (error) {
    logMessage(
      `Error cleaning up log files: ${(error as Error).message}`,
      "warn"
    );
  }

  await fs.mkdir(app.getPath("logs"), { recursive: true });
  await fs.mkdir(path.dirname(logPath), { recursive: true });

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCHD_SERVICE_NAME}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${pythonPath}</string>
        <string>-m</string>
        <string>nodetool.cli</string>
        <string>serve</string>
        <string>--port</string>
        <string>8000</string>
        <string>--static-folder</string>
        <string>${webPath}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${app.getAppPath()}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONPATH</key>
        <string>${srcPath}</string>
        <key>PATH</key>
        <string>${binPath}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${errorLogPath}</string>
</dict>
</plist>`;

  await fs.writeFile(PLIST_PATH, plistContent);
  await fs.chmod(PLIST_PATH, 0o644);
}

async function startServerWithLaunchd(): Promise<void> {
  try {
    await createLaunchdPlist();
    logMessage("Starting server with launchd...");

    const { stdout, stderr } = await new Promise<{
      stdout: string;
      stderr: string;
    }>((resolve, reject) => {
      console.log("launchctl", ["load", PLIST_PATH]);
      const process = spawn("launchctl", ["load", PLIST_PATH]);
      let stdout = "",
        stderr = "";

      process.stdout?.on("data", (data) => (stdout += data));
      process.stderr?.on("data", (data) => (stderr += data));

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(
            new Error(`launchctl load failed with code ${code}: ${stderr}`)
          );
        }
      });
    });

    if (stderr) {
      logMessage(`launchctl warning: ${stderr}`, "warn");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const isRunning = await isServerRunningViaLaunchd();
    if (!isRunning) {
      const logPath = path.join(app.getPath("logs"), "nodetool-server.log");
      const errorLogPath = path.join(
        app.getPath("logs"),
        "nodetool-server-error.log"
      );

      try {
        const serviceLog = await fs.readFile(logPath, "utf8");
        const errorLog = await fs.readFile(errorLogPath, "utf8");

        logMessage("=== Launchd Service Logs ===");
        logMessage(serviceLog);
        logMessage("=== Launchd Error Logs ===");
        logMessage(errorLog);
      } catch (logError) {
        logMessage(
          `Failed to read launchd logs: ${(logError as Error).message}`,
          "error"
        );
      }

      return;
    }

    logMessage("Server started successfully via launchd");
    emitBootMessage("Server started, waiting for availability...");
  } catch (error) {
    logMessage(
      `Failed to start server with launchd: ${
        (error as Error).message
      }. Falling back to direct Python server process`,
      "warn"
    );
    await startServer();
  }
}

async function stopServerWithLaunchd(): Promise<void> {
  try {
    await spawn("launchctl", ["remove", LAUNCHD_SERVICE_NAME]);
    await fs.unlink(PLIST_PATH);
  } catch (error) {
    logMessage(
      `Error stopping launchd service: ${(error as Error).message}`,
      "error"
    );
  }
}

async function isServerRunningViaLaunchd(): Promise<boolean> {
  try {
    return new Promise<boolean>((resolve) => {
      exec(
        `launchctl list ${LAUNCHD_SERVICE_NAME}`,
        (error, stdout, stderr) => {
          if (!error && stdout && !stdout.includes("Could not find service")) {
            logMessage("Server is running via launchd");
            resolve(true);
          } else {
            exec(
              `launchctl error ${LAUNCHD_SERVICE_NAME}`,
              (errError, errStdout, errStderr) => {
                if (errStdout) {
                  logMessage(`Launchd service error: ${errStdout}`, "error");
                }
                logMessage("Server is not running via launchd");
                resolve(false);
              }
            );
          }
        }
      );
    });
  } catch (error) {
    logMessage(
      `Error checking launchd status: ${(error as Error).message}`,
      "error"
    );
    return false;
  }
}

async function isServerRunning(): Promise<boolean> {
  if (process.platform === "darwin") {
    return await isServerRunningViaLaunchd();
  } else {
    return nodeToolBackendProcess !== null;
  }
}

async function initializeBackendServer(): Promise<void> {
  try {
    try {
      const response = await fetch("http://127.0.0.1:8000/health");
      if (response.ok) {
        logMessage("Server already running and healthy, connecting...");
        emitServerStarted();
        return;
      }
    } catch (error) {
      logMessage("Health check failed, proceeding with server startup");
    }

    if (process.platform !== "darwin") {
      return startServer();
    }

    const isRunning = await isServerRunningViaLaunchd();
    if (isRunning) {
      logMessage("Server already running, connecting...");
      await waitForServer();
      return;
    }

    await killExistingServer();
    const isPortFree = await isPortAvailable(8000);
    if (!isPortFree) {
      await showPortInUseError();
      return;
    }

    await ensureOllamaIsRunning();
    await startServer();
    await waitForServer();
  } catch (error) {
    forceQuit(`Critical error starting server: ${(error as Error).message}`);
  }
}

async function waitForServer(timeout: number = 30000): Promise<void> {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      const response = await fetch("http://127.0.0.1:8000/health");
      if (response.ok) {
        logMessage(
          "Server endpoint is available at http://127.0.0.1:8000/health"
        );
        emitServerStarted();
        return;
      }
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Server failed to become available");
}

async function stopServer(): Promise<void> {
  logMessage("Initiating graceful shutdown");

  try {
    if (nodeToolBackendProcess) {
      logMessage("Stopping server process");
      nodeToolBackendProcess.kill("SIGTERM");

      await new Promise<void>((resolve, reject) => {
        nodeToolBackendProcess?.on("exit", () => {
          fs.unlink(PID_FILE_PATH).catch(() => {});
          resolve();
        });
        nodeToolBackendProcess?.on("error", reject);

        setTimeout(() => {
          if (nodeToolBackendProcess && !nodeToolBackendProcess.killed) {
            nodeToolBackendProcess.kill("SIGKILL");
          }
          resolve();
        }, 5000);
      });
    }
  } catch (error) {
    logMessage(`Error during shutdown: ${(error as Error).message}`, "error");
  }

  logMessage("Graceful shutdown complete");
}

export function getServerState() {
  return serverState;
}

export function openLogFile() {
  return shell.showItemInFolder(LOG_FILE);
}

export async function runApp(workflowId: string) {
  logMessage(`Running app with workflow ID: ${workflowId}`);
  return runWorkflow(workflowId);
}

export {
  serverState,
  initializeBackendServer,
  stopServer,
  webPath,
  LAUNCHD_SERVICE_NAME,
  isServerRunning,
};
