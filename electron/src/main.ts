import {
  app,
  ipcMain,
  dialog,
  shell,
  systemPreferences,
  BrowserWindow,
  globalShortcut,
} from "electron";
import { createWindow, forceQuit, handleActivation } from "./window";
import { setupAutoUpdater } from "./updater";
import { logMessage } from "./logger";
import { initializeBackendServer, stopServer, serverState } from "./server";
import { verifyApplicationPaths, isCondaEnvironmentInstalled } from "./python";
import { installCondaEnvironment } from "./installer";
import { emitBootMessage } from "./events";
import { createTray } from "./tray";
import { createWorkflowWindow } from "./workflow-window";
import { initializeIpcHandlers } from "./ipc";
import { fetchWorkflows } from "./tray";
/**
 * Global application state flags and objects
 */
let isAppQuitting = false;
let mainWindow: BrowserWindow | null = null;

/**
 * Checks and sets up the Python Conda environment
 */
async function checkPythonEnvironment(): Promise<void> {
  emitBootMessage("Checking for Python environment...");
  const hasCondaEnv = await isCondaEnvironmentInstalled();

  logMessage(`Python environment installed: ${hasCondaEnv}`);

  if (!hasCondaEnv) {
    await installCondaEnvironment();
  }
}

/**
 * Initializes the application, verifies paths, and starts required servers
 * @throws {Error} When critical permissions are missing
 */
async function initialize(): Promise<void> {
  try {
    // Verify paths and permissions
    const validationResult = await verifyApplicationPaths();
    if (validationResult.errors.length > 0) {
      const errorMessage =
        "Critical permission errors detected:\n\n" +
        validationResult.errors.join("\n") +
        "\n\nPlease ensure the application has proper permissions to these locations.";

      dialog.showErrorBox("Permission Error", errorMessage);
      app.quit();
      return;
    }

    setupAutoUpdater();
    await checkPythonEnvironment();

    // Set up workflow shortcuts after server starts
    emitBootMessage("Starting NodeTool server...");
    await initializeBackendServer();
    await setupWorkflowShortcuts();
  } catch (error) {
    logMessage(`Initialization error: ${error}`, "error");
    dialog.showErrorBox(
      "Initialization Error",
      `Failed to initialize: ${error}`
    );
    app.quit();
  }
}

// Add new function to set up workflow shortcuts
async function setupWorkflowShortcuts(): Promise<void> {
  try {
    // Fetch workflows from the server
    const workflows = await fetchWorkflows();
    // Register shortcuts for workflows that have them configured
    workflows.forEach((workflow: any) => {
      if (workflow.shortcut) {
        console.log("Setting up shortcut for workflow", workflow);
        globalShortcut.register(workflow.shortcut, () => {
          createWorkflowWindow(workflow.id);
        });
        logMessage(
          `Registered shortcut ${workflow.shortcut} for workflow ${workflow.id}`
        );
      }
    });
  } catch (error) {
    logMessage(`Error setting up workflow shortcuts: ${error}`, "error");
  }
}

/**
 * Checks system media permissions and requests access if needed
 */
async function checkMediaPermissions(): Promise<void> {
  if (process.platform === "win32" || process.platform === "darwin") {
    try {
      logMessage("Starting microphone permission check");
      console.log("Checking microphone permissions...");

      const microphoneStatus =
        systemPreferences.getMediaAccessStatus("microphone");
      logMessage(`Current microphone status: ${microphoneStatus}`);
      console.log(`Detailed microphone status:`, { microphoneStatus });

      if (microphoneStatus !== "granted") {
        logMessage(
          `Microphone not granted, current status: ${microphoneStatus}`
        );

        if (process.platform === "darwin") {
          logMessage("Requesting microphone access on macOS");
          const granted = await systemPreferences.askForMediaAccess(
            "microphone"
          );
          logMessage(`Microphone permission request result: ${granted}`);
          console.log(`macOS permission request result:`, { granted });

          if (!granted) {
            logMessage("Opening system preferences for microphone access");
            shell.openExternal(
              "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone"
            );
          }
        } else if (process.platform === "win32") {
          logMessage("Opening Windows privacy settings for microphone");
          shell.openExternal("ms-settings:privacy-microphone");
        }
      } else {
        logMessage("Microphone permission already granted");
      }
    } catch (error) {
      logMessage(
        `Error handling microphone permissions: ${(error as Error).message}`,
        "error"
      );
      console.error("Detailed permission error:", error);
    }
  } else {
    logMessage(
      `Platform ${process.platform} does not require explicit microphone permissions`
    );
  }
}

app.on("ready", async () => {
  await initializeIpcHandlers();
  await checkMediaPermissions();

  mainWindow = createWindow();

  await createTray();

  // Wait for window to be ready before initializing
  mainWindow.once("ready-to-show", async () => {
    await initialize();
  });

  // Check for --run argument or environment variable
  const runIndex = process.argv.indexOf("--run");
  if (runIndex > -1 && process.argv[runIndex + 1]) {
    const workflowId = process.argv[runIndex + 1];
    logMessage(`Running workflow from command line: ${workflowId}`);
    createWorkflowWindow(workflowId);
    return;
  }
});

ipcMain.handle("update-installed", async () => {
  logMessage("Update installed, updating Python environment");
  await checkPythonEnvironment();
});

interface SaveFileOptions {
  buffer: Buffer;
  defaultPath: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

app.on("before-quit", (event) => {
  if (!isAppQuitting) {
    isAppQuitting = true;
    stopServer();
  }
});

app.on("window-all-closed", () => {
  logMessage("All windows closed");
  if (process.platform !== "darwin") {
    logMessage("Quitting app (not on macOS)");
    app.quit();
  }
});

app.on("activate", handleActivation);

process.on("uncaughtException", (error: Error) => {
  logMessage(`Uncaught Exception: ${error.message}`, "error");
  logMessage(`Stack Trace: ${error.stack}`, "error");
  forceQuit(`Uncaught Exception: ${error.message}`);
});

process.on(
  "unhandledRejection",
  (reason: unknown, promise: Promise<unknown>) => {
    const errorMessage =
      reason instanceof Error ? reason.message : String(reason);
    logMessage(`Unhandled Promise Rejection: ${errorMessage}`, "error");
    if (reason instanceof Error) {
      logMessage(`Stack Trace: ${reason.stack}`, "error");
    }
    forceQuit(`Unhandled Promise Rejection: ${errorMessage}`);
  }
);

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

export { mainWindow, isAppQuitting };
