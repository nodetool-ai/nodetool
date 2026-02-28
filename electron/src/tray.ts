import { Tray, Menu, app, BrowserWindow, shell } from "electron";
import path from "path";
import { logMessage, LOG_FILE } from "./logger";
import { getMainWindow } from "./state";
import { createPackageManagerWindow, createWindow, createLogViewerWindow, createSettingsWindow } from "./window";
import { execSync } from "child_process";
import {
  stopServer,
  initializeBackendServer,
  isServerRunning,
  getServerState,
  isOllamaRunning,
  isLlamaServerRunning,
  startOllamaService,
  stopOllamaService,
  startLlamaCppService,
  stopLlamaCppService,
  isOllamaResponsive,
  isLlamaServerResponsive,
} from "./server";
import { fetchWorkflows } from "./api";
import {
  readSettings,
  readSettingsAsync,
  updateSetting,
  getModelServiceStartupSettings,
  updateModelServiceStartupSettings,
} from "./settings";
import { createMiniAppWindow, createChatWindow } from "./workflowWindow";
import type { Workflow } from "./types";
import { EventEmitter } from "events";

let trayInstance: Electron.Tray | null = null;

function formatNodeToolStatus(connected: boolean, port?: number): string {
  return connected
    ? `NodeTool: Running${port ? ` on ${port}` : ""}`
    : "NodeTool: Stopped";
}

function formatModelServiceStatus(
  name: string,
  running: boolean,
  externalManaged: boolean | undefined,
  port?: number
): string {
  if (running) {
    return `${name}: Running${port ? ` on ${port}` : ""} (managed)`;
  }
  if (externalManaged) {
    return `${name}: Running externally${port ? ` on ${port}` : ""}`;
  }
  return `${name}: Stopped`;
}

async function detectOllamaStatus(
  preferredPort?: number,
): Promise<{ running: boolean; external: boolean; port?: number }> {
  const candidatePorts = Array.from(
    new Set([preferredPort, 11434, 11435].filter((value): value is number => typeof value === "number"))
  );
  for (const port of candidatePorts) {
    if (await isOllamaResponsive(port)) {
      return {
        running: true,
        external: true,
        port,
      };
    }
  }
  return { running: false, external: false, port: preferredPort };
}

async function detectLlamaStatus(
  preferredPort?: number,
): Promise<{ running: boolean; external: boolean; port?: number }> {
  const candidatePorts = Array.from(
    new Set([preferredPort, 8080].filter((value): value is number => typeof value === "number"))
  );
  for (const port of candidatePorts) {
    if (await isLlamaServerResponsive(port)) {
      return {
        running: true,
        external: true,
        port,
      };
    }
  }
  return { running: false, external: false, port: preferredPort };
}

/**
 * Internal event emitter for main-process events.
 * Used to notify the tray when server state changes.
 */
export const trayEvents = new EventEmitter();

// Event types for type safety
export const TrayEventTypes = {
  SERVER_STATE_CHANGED: "server-state-changed",
  WORKFLOWS_CHANGED: "workflows-changed",
} as const;

/**
 * Subscribe to server state changes and update the tray menu.
 * This is the event-driven alternative to polling.
 */
function subscribeToServerEvents(): void {
  trayEvents.on(TrayEventTypes.SERVER_STATE_CHANGED, () => {
    logMessage("Tray: received server state change event", "info");
    void updateTrayMenu();
  });
  
  trayEvents.on(TrayEventTypes.WORKFLOWS_CHANGED, () => {
    logMessage("Tray: received workflows change event", "info");
    void updateTrayMenu();
  });
  
  logMessage("Tray: subscribed to server events", "info");
}

/**
 * Emit a server state change event to trigger tray updates.
 * Call this whenever the server state changes.
 */
export function emitServerStateChanged(): void {
  trayEvents.emit(TrayEventTypes.SERVER_STATE_CHANGED);
}

/**
 * Emit a workflows change event to trigger tray updates.
 * Call this when workflows are created, updated, or deleted.
 */
export function emitWorkflowsChanged(): void {
  trayEvents.emit(TrayEventTypes.WORKFLOWS_CHANGED);
}

/**
 * Cleanup function to remove event listeners.
 */
export function cleanupTrayEvents(): void {
  trayEvents.removeAllListeners();
  logMessage("Tray: cleaned up event listeners", "info");
}

/**
 * Module for managing the system tray functionality of the NodeTool application.
 * Handles tray creation, menu updates, and tray-related events.
 * @module tray
 */

/**
 * Creates or recreates the system tray instance.
 * Handles platform-specific setup (Windows/macOS) and icon initialization.
 * @returns {Promise<Electron.Tray>} The created tray instance
 * @throws {Error} If tray creation fails
 */
async function createTray(): Promise<Electron.Tray> {
  logMessage("Starting tray creation...", "info");

  if (trayInstance) {
    logMessage("Destroying existing tray instance", "info");
    trayInstance.destroy();
    trayInstance = null;
  }

  const isWindows = process.platform === "win32";
  const iconPath = path.join(
    __dirname,
    "..",
    "assets",
    isWindows ? "tray-icon.ico" : "tray-icon.png"
  );

  logMessage(`Attempting to create tray with icon at: ${iconPath}`, "info");

  if (isWindows) {
    logMessage("Setting Windows-specific app ID", "info");
    app.setAppUserModelId("com.nodetool.desktop");
  }

  try {
    trayInstance = new Tray(iconPath);
    logMessage("Tray instance created successfully", "info");
  } catch (error) {
    if (error instanceof Error) {
      logMessage(`Failed to create tray: ${error.message}`, "error");
      throw new Error(`Could not create tray: ${error.message}`);
    }
  }

  if (!trayInstance) {
    logMessage("Tray instance is null after creation attempt", "error");
    throw new Error("Failed to create tray instance");
  }

  if (isWindows) {
    logMessage("Setting up Windows-specific tray events", "info");
    trayInstance.setIgnoreDoubleClickEvents(true);

    try {
      const iconPreferenceKey =
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TrayNotify";
      logMessage("Updating Windows registry for tray icon", "info");
      execSync(
        `reg add "${iconPreferenceKey}" /v "IconStreams" /t REG_BINARY /d "" /f`
      );
      execSync(
        `reg add "${iconPreferenceKey}" /v "PastIconsStream" /t REG_BINARY /d "" /f`
      );
    } catch (error) {
      if (error instanceof Error) {
        logMessage(
          `Failed to set tray icon preference: ${error.message}`,
          "warn"
        );
      }
    }

    setupWindowsTrayEvents(trayInstance);
  } else {
    // On macOS/Linux, show the context menu on click and right-click
    trayInstance.on("click", () => {
      void updateTrayMenu();
      trayInstance?.popUpContextMenu();
    });
    trayInstance.on("right-click", () => {
      void updateTrayMenu();
      trayInstance?.popUpContextMenu();
    });
  }
  // Initialize the tray menu immediately so it responds on first click
  await updateTrayMenu();
  
  // Subscribe to server events for real-time updates
  subscribeToServerEvents();
  
  return trayInstance;
}

/**
 * Sets up Windows-specific tray event handlers.
 * Handles double-click, single-click, and right-click events.
 * @param {Electron.Tray} tray - The tray instance to set up events for
 */
function setupWindowsTrayEvents(tray: Electron.Tray): void {
  tray.on("double-click", () => {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });

  tray.on("click", () => {
    void updateTrayMenu();
    tray.popUpContextMenu();
  });

  tray.on("right-click", () => {
    void updateTrayMenu();
    tray.popUpContextMenu();
  });
}

/**
 * Focuses the NodeTool window or creates a new one if none exists.
 * Handles platform-specific window focusing behavior.
 */
function focusNodeTool(): void {
  const visibleWindows = BrowserWindow.getAllWindows().filter(
    (w) => !w.isDestroyed() && w.isVisible()
  );

  if (visibleWindows.length === 0) {
    createWindow();
  } else if (process.platform === "darwin") {
    const mainWindow = getMainWindow();
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  }
}

/**
 * Gets menu items for the close behavior settings.
 * @param {Record<string, any>} settings - The current application settings
 * @returns {Electron.MenuItemConstructorOptions[]} Menu items for close behavior
 */
function getCloseBehaviorMenuItems(settings: Record<string, any>): Electron.MenuItemConstructorOptions[] {
  const currentAction = settings.windowCloseAction;

  return [
    { type: "separator" },
    {
      label: "On Close Behavior",
      submenu: [
        {
          label: "Ask Every Time",
          type: "radio",
          checked: !currentAction || currentAction === "ask",
          click: () => {
            updateSetting("windowCloseAction", "ask");
            logMessage("Close behavior set to: ask");
            void updateTrayMenu();
          },
        },
        {
          label: "Quit Application",
          type: "radio",
          checked: currentAction === "quit",
          click: () => {
            updateSetting("windowCloseAction", "quit");
            logMessage("Close behavior set to: quit");
            void updateTrayMenu();
          },
        },
        {
          label: "Keep Running in Background",
          type: "radio",
          checked: currentAction === "background",
          click: () => {
            updateSetting("windowCloseAction", "background");
            logMessage("Close behavior set to: background");
            void updateTrayMenu();
          },
        },
      ],
    },
  ];
}

/**
 * Builds the workflows submenu items from available workflows.
 * @param {Workflow[]} workflows - Array of workflows to create menu items from
 * @returns {Electron.MenuItemConstructorOptions[]} Menu items for workflows
 */
function buildWorkflowsSubmenu(workflows: Workflow[]): Electron.MenuItemConstructorOptions[] {
  if (workflows.length === 0) {
    return [
      {
        label: "No workflows available",
        enabled: false,
      },
    ];
  }

  return workflows.map((workflow) => ({
    label: workflow.name,
    click: () => {
      logMessage(`Opening mini app for workflow: ${workflow.name} (${workflow.id})`);
      createMiniAppWindow(workflow.id, workflow.name);
    },
  }));
}

/**
 * Updates the tray menu with current application state and available workflows.
 * Includes service status, workflow list, and application controls.
 * @returns {Promise<void>}
 */
async function updateTrayMenu(): Promise<void> {
  if (!trayInstance) return;

  const settings = await readSettingsAsync();
  const connected = await isServerRunning();
  const ollamaRunning = isOllamaRunning();
  const llamaServerRunning = isLlamaServerRunning();
  const state = getServerState();
  const startupSettings = getModelServiceStartupSettings(settings);
  const ollamaDetected = await detectOllamaStatus(state.ollamaPort);
  const llamaDetected = await detectLlamaStatus(state.llamaPort);
  const ollamaManagedRunning = ollamaRunning;
  const llamaManagedRunning = llamaServerRunning;
  const ollamaRunningResolved = ollamaManagedRunning || ollamaDetected.running;
  const llamaRunningResolved = llamaManagedRunning || llamaDetected.running;
  const ollamaExternalResolved = !ollamaManagedRunning && ollamaDetected.running;
  const llamaExternalResolved = !llamaManagedRunning && llamaDetected.running;
  if (ollamaDetected.port && state.ollamaPort !== ollamaDetected.port) {
    state.ollamaPort = ollamaDetected.port;
  }
  state.ollamaExternalManaged = ollamaExternalResolved;
  if (llamaDetected.port && state.llamaPort !== llamaDetected.port) {
    state.llamaPort = llamaDetected.port;
  }
  state.llamaExternalManaged = llamaExternalResolved;
  const nodeToolLabel = formatNodeToolStatus(connected, state.serverPort);
  const ollamaLabel = formatModelServiceStatus(
    "Ollama",
    ollamaRunningResolved,
    ollamaExternalResolved,
    ollamaDetected.port ?? state.ollamaPort
  );
  const llamaLabel = formatModelServiceStatus(
    "Llama.cpp",
    llamaRunningResolved,
    llamaExternalResolved,
    llamaDetected.port ?? state.llamaPort
  );

  // Fetch workflows if connected
  let workflows: Workflow[] = [];
  if (connected) {
    try {
      workflows = await fetchWorkflows();
    } catch (error) {
      if (error instanceof Error) {
        logMessage(`Failed to fetch workflows for tray menu: ${error.message}`, "error");
      }
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: nodeToolLabel,
      enabled: false,
    },
    {
      label: ollamaLabel,
      enabled: false,
    },
    {
      label: llamaLabel,
      enabled: false,
    },
    {
      label: "Managed Model Services",
      submenu: [
        {
          label: "Ollama",
          submenu: [
            {
              label: ollamaLabel,
              enabled: false,
            },
            {
              label: "Start Ollama",
              enabled: !ollamaRunningResolved,
              click: async () => {
                try {
                  await startOllamaService();
                } catch (error) {
                  if (error instanceof Error) {
                    logMessage(`Failed to start Ollama from tray: ${error.message}`, "error");
                  }
                } finally {
                  void updateTrayMenu();
                }
              },
            },
            {
              label: "Stop Ollama",
              enabled: ollamaRunningResolved,
              click: async () => {
                try {
                  await stopOllamaService();
                } catch (error) {
                  if (error instanceof Error) {
                    logMessage(`Failed to stop Ollama from tray: ${error.message}`, "error");
                  }
                } finally {
                  void updateTrayMenu();
                }
              },
            },
          ],
        },
        {
          label: "Llama.cpp",
          submenu: [
            {
              label: llamaLabel,
              enabled: false,
            },
            {
              label: "Start Llama.cpp",
              enabled: !llamaRunningResolved,
              click: async () => {
                try {
                  await startLlamaCppService();
                } catch (error) {
                  if (error instanceof Error) {
                    logMessage(`Failed to start Llama.cpp from tray: ${error.message}`, "error");
                  }
                } finally {
                  void updateTrayMenu();
                }
              },
            },
            {
              label: "Stop Llama.cpp",
              enabled: llamaRunningResolved,
              click: async () => {
                try {
                  await stopLlamaCppService();
                } catch (error) {
                  if (error instanceof Error) {
                    logMessage(`Failed to stop Llama.cpp from tray: ${error.message}`, "error");
                  }
                } finally {
                  void updateTrayMenu();
                }
              },
            },
          ],
        },
        { type: "separator" },
        {
          label: "Start Ollama on App Startup",
          type: "checkbox",
          checked: startupSettings.startOllamaOnStartup,
          click: () => {
            updateModelServiceStartupSettings({
              startOllamaOnStartup: !startupSettings.startOllamaOnStartup,
            });
            logMessage(
              `Tray updated startup setting: startOllamaOnStartup=${!startupSettings.startOllamaOnStartup}`,
              "info"
            );
            void updateTrayMenu();
          },
        },
        {
          label: "Start Llama.cpp on App Startup",
          type: "checkbox",
          checked: startupSettings.startLlamaCppOnStartup,
          click: () => {
            updateModelServiceStartupSettings({
              startLlamaCppOnStartup: !startupSettings.startLlamaCppOnStartup,
            });
            logMessage(
              `Tray updated startup setting: startLlamaCppOnStartup=${!startupSettings.startLlamaCppOnStartup}`,
              "info"
            );
            void updateTrayMenu();
          },
        },
      ],
    },
    {
      label: "Start Service",
      enabled: !connected,
      click: async () => {
        await initializeBackendServer();
        updateTrayMenu();
      },
    },
    {
      label: "Stop Service",
      enabled: connected,
      click: async () => {
        try {
          await stopServer();
          await updateTrayMenu();
        } catch (error) {
          if (error instanceof Error) {
            logMessage(`Failed to stop service: ${error.message}`, "error");
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "Show NodeTool",
      enabled: true,
      click: async () => focusNodeTool(),
    },
    {
      label: "Chat",
      enabled: connected,
      click: () => {
        logMessage("Opening standalone chat window");
        createChatWindow();
      },
    },
    {
      label: "Mini Apps",
      enabled: connected && workflows.length > 0,
      submenu: buildWorkflowsSubmenu(workflows),
    },
    {
      label: "Package Manager",
      click: () => createPackageManagerWindow(),
    },
    { type: "separator" },
    {
      label: "Log Viewer",
      click: () => createLogViewerWindow(),
    },
    {
      label: "Settings",
      click: () => createSettingsWindow(),
    },
    {
      label: "Open Log File",
      click: () => {
        shell.openPath(LOG_FILE);
      },
    },
    ...getCloseBehaviorMenuItems(settings),
    { type: "separator" },
    { label: "Quit NodeTool", role: "quit" },
  ]);

  trayInstance.setContextMenu(contextMenu);
  trayInstance.setToolTip("NodeTool Desktop");
}

export { createTray, updateTrayMenu, fetchWorkflows };
