import {
  ipcMain,
  BrowserWindow,
  clipboard,
  globalShortcut,
  shell,
  dialog,
} from "electron";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import {
  getServerState,
  openLogFile,
  showItemInFolder,
  runApp,
  initializeBackendServer,
  stopServer,
  restartLlamaServer,
} from "./server";
import { logMessage } from "./logger";
import {
  IpcChannels,
  IpcEvents,
  IpcResponse,
  WindowCloseAction,
} from "./types.d";
import {
  readSettings,
  updateSetting,
  getModelServiceStartupSettings,
  updateModelServiceStartupSettings,
} from "./settings";
import { createPackageManagerWindow, createSettingsWindow } from "./window";
import { IpcRequest } from "./types.d";
import { registerWorkflowShortcut, setupWorkflowShortcuts } from "./shortcuts";
import { emitWorkflowsChanged, emitServerStateChanged } from "./tray";
import {
  fetchAvailablePackages,
  listInstalledPackages,
  installPackage,
  uninstallPackage,
  updatePackage,
  validateRepoId,
  searchNodes,
  checkExpectedPackageVersions,
} from "./packageManager";
import {
  openModelDirectory,
  openPathInExplorer,
  openSystemDirectory,
} from "./fileExplorer";
import { exportDebugBundle } from "./debug";
import WebSocket from "ws";

/**
 * This module handles Inter-Process Communication (IPC) between the Electron main process
 * and renderer processes. It provides type-safe wrappers for IPC handlers and initializes
 * all IPC channels used by the application.
 *
 * Key features:
 * - Type-safe IPC handler creation using TypeScript generics
 * - Centralized initialization of all IPC channels
 * - Handlers for:
 *   - Clipboard operations (read/write)
 *   - Server state management
 *   - Application control (run, update)
 *   - Window controls (close, minimize, maximize)
 *   - File operations (save)
 *
 * The IPC system ensures secure and typed communication between the isolated renderer
 * process and the privileged main process, following Electron's security best practices.
 */

export type IpcMainHandler<T extends keyof IpcRequest & keyof IpcResponse> = (
  event: Electron.IpcMainInvokeEvent,
  data: IpcRequest[T],
) => Promise<IpcResponse[T]>;

export type IpcOnceHandler<T extends keyof IpcEvents> = (
  event: Electron.IpcMainInvokeEvent,
  data: IpcEvents[T],
) => Promise<void>;

// Channels that should have their payloads redacted for security
const SENSITIVE_CHANNELS = ["clipboard:write-text", "clipboard:read-text"];
const FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS = 15000;

const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PROXY_WS_STATES = new Map<
  string,
  {
    senderId: number;
    socket: WebSocket;
  }
>();
const LOCALHOST_PROXY_WS_IDS_BY_SENDER = new Map<number, Set<string>>();

function assertLocalhostUrl(
  urlValue: string,
  allowedProtocols: string[] = ["http:", "https:"],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error("Invalid proxy URL");
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `Only ${allowedProtocols.join("/")} URLs are allowed`,
    );
  }
  if (!LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
    throw new Error("Only localhost URLs are allowed");
  }
  return parsed;
}

function sanitizeProxyMethod(method?: string): string {
  const normalized = (method || "GET").toUpperCase();
  const allowedMethods = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]);
  if (!allowedMethods.has(normalized)) {
    throw new Error(`Unsupported method: ${normalized}`);
  }
  return normalized;
}

function cleanupLocalhostProxyWsConnection(connectionId: string): void {
  const existing = LOCALHOST_PROXY_WS_STATES.get(connectionId);
  if (!existing) {
    return;
  }

  const senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(
    existing.senderId,
  );
  if (senderConnections) {
    senderConnections.delete(connectionId);
    if (senderConnections.size === 0) {
      LOCALHOST_PROXY_WS_IDS_BY_SENDER.delete(existing.senderId);
    }
  }

  LOCALHOST_PROXY_WS_STATES.delete(connectionId);
}

function closeAllLocalhostProxyWsForSender(senderId: number): void {
  const senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(senderId);
  if (!senderConnections) {
    return;
  }

  for (const connectionId of senderConnections) {
    const existing = LOCALHOST_PROXY_WS_STATES.get(connectionId);
    if (existing) {
      try {
        existing.socket.close();
      } catch (error) {
        logMessage(
          `Error closing localhost proxy websocket ${connectionId}: ${String(
            error,
          )}`,
          "warn",
        );
      }
    }
    cleanupLocalhostProxyWsConnection(connectionId);
  }
}

function requestRendererEvent<T>(
  event: Electron.IpcMainInvokeEvent,
  requestChannel: string,
  responseChannel: string,
  requestPayload: Record<string, unknown>,
): Promise<T> {
  const requestId = randomUUID();

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, onResponse);
      reject(
        new Error(`Timed out waiting for renderer response on ${responseChannel}`),
      );
    }, FRONTEND_TOOLS_RESPONSE_TIMEOUT_MS);

    const onResponse = (
      responseEvent: Electron.IpcMainEvent,
      response: { requestId?: string; error?: string; result?: T; manifest?: T },
    ) => {
      if (responseEvent.sender !== event.sender) {
        return;
      }
      if (!response || response.requestId !== requestId) {
        return;
      }

      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, onResponse);

      if (response.error) {
        reject(new Error(response.error));
        return;
      }

      if ("result" in response && response.result !== undefined) {
        resolve(response.result);
        return;
      }

      if ("manifest" in response && response.manifest !== undefined) {
        resolve(response.manifest);
        return;
      }

      reject(new Error(`Renderer response for ${responseChannel} had no payload`));
    };

    ipcMain.on(responseChannel, onResponse);
    event.sender.send(requestChannel, {
      requestId,
      ...requestPayload,
    });
  });
}

/**
 * Type-safe wrapper for IPC main handlers with logging
 */
export function createIpcMainHandler<T extends keyof IpcRequest>(
  channel: T,
  handler: IpcMainHandler<T>,
): void {
  try {
    // Ensure idempotent registration to avoid "Attempted to register a second handler" errors
    ipcMain.removeHandler(channel as string);
  } catch (error) {
    // Best-effort cleanup; continue with handler registration
    logMessage(
      `Warning removing existing IPC handler for ${String(channel)}: ${String(
        error,
      )}`,
      "warn",
    );
  }

  // Wrap the handler with logging
  const wrappedHandler: IpcMainHandler<T> = async (event, data) => {
    const startTime = Date.now();
    const channelStr = String(channel);
    const isSensitive = SENSITIVE_CHANNELS.includes(channelStr);

    // Log incoming request
    if (isSensitive) {
      logMessage(`IPC → ${channelStr} (payload redacted)`);
    } else {
      const payloadStr =
        data !== undefined ? JSON.stringify(data) : "undefined";
      const truncatedPayload =
        payloadStr.length > 200
          ? payloadStr.substring(0, 200) + "..."
          : payloadStr;
      logMessage(`IPC → ${channelStr}: ${truncatedPayload}`);
    }

    try {
      const result = await handler(event, data);
      const duration = Date.now() - startTime;
      logMessage(`IPC ← ${channelStr} OK (${duration}ms)`);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logMessage(
        `IPC ← ${channelStr} ERROR (${duration}ms): ${String(error)}`,
        "error",
      );
      throw error;
    }
  };

  ipcMain.handle(channel, wrappedHandler);
}

/**
 * Type-safe wrapper for IPC once handlers with logging
 */
export function createIpcOnceHandler<T extends keyof IpcEvents>(
  channel: T,
  handler: IpcOnceHandler<T>,
): void {
  const wrappedHandler: IpcOnceHandler<T> = async (event, data) => {
    const channelStr = String(channel);
    logMessage(`IPC (once) → ${channelStr}`);
    try {
      await handler(event, data);
      logMessage(`IPC (once) ← ${channelStr} OK`);
    } catch (error) {
      logMessage(`IPC (once) ← ${channelStr} ERROR: ${String(error)}`, "error");
      throw error;
    }
  };
  ipcMain.once(channel as string, wrappedHandler);
}

/**
 * Initialize all IPC handlers for the main process
 */
export function initializeIpcHandlers(): void {
  logMessage("Initializing IPC handlers", "info");

  // Clipboard handlers
  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_TEXT,
    async (_event, data) => {
      clipboard.writeText(data.text, data.type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_TEXT,
    async (_event, type) => {
      return clipboard.readText(type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_IMAGE,
    async (_event, data) => {
      const { nativeImage } = await import("electron");
      const image = nativeImage.createFromDataURL(data.dataUrl);
      clipboard.writeImage(image, data.type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_IMAGE,
    async (_event, type) => {
      const image = clipboard.readImage(type);
      return image.toDataURL();
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_HTML,
    async (_event, type) => {
      return clipboard.readHTML(type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_HTML,
    async (_event, data) => {
      clipboard.writeHTML(data.markup, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_RTF, async (_event, type) => {
    return clipboard.readRTF(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_RTF,
    async (_event, data) => {
      clipboard.writeRTF(data.text, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_BOOKMARK, async () => {
    return clipboard.readBookmark();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_BOOKMARK,
    async (_event, data) => {
      clipboard.writeBookmark(data.title, data.url, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_FIND_TEXT, async () => {
    return clipboard.readFindText();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_FIND_TEXT,
    async (_event, text) => {
      clipboard.writeFindText(text);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_CLEAR, async (_event, type) => {
    clipboard.clear(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_AVAILABLE_FORMATS,
    async (_event, type) => {
      return clipboard.availableFormats(type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_FILE_PATHS, async () => {
    const formats = clipboard.availableFormats();
    logMessage(`Clipboard formats available: ${formats.join(", ")}`);

    // Linux and some Windows apps use text/uri-list
    if (formats.includes("text/uri-list")) {
      try {
        const uris = clipboard.readText("selection");
        // Also try clipboard type if selection doesn't have uri-list
        const urisClipboard = clipboard.read("text/uri-list");
        const uriText = urisClipboard || uris;
        if (uriText) {
          const paths = uriText
            .split("\n")
            .filter((line: string) => line.trim().startsWith("file://"))
            .map((uri: string) => {
              try {
                return decodeURIComponent(new URL(uri.trim()).pathname);
              } catch {
                return null;
              }
            })
            .filter((p: string | null): p is string => p !== null);
          if (paths.length > 0) {
            logMessage(`Read ${paths.length} file paths from text/uri-list`);
            return paths;
          }
        }
      } catch (error) {
        logMessage(`Error reading text/uri-list: ${error}`, "warn");
      }
    }

    // Windows Explorer uses FileNameW format
    if (formats.includes("FileNameW")) {
      try {
        const buf = clipboard.readBuffer("FileNameW");
        // FileNameW is UTF-16LE (UCS-2) encoded, null-terminated strings
        const decoded = buf.toString("ucs2");
        const paths = decoded.split("\u0000").filter(Boolean);
        if (paths.length > 0) {
          logMessage(`Read ${paths.length} file paths from FileNameW`);
          return paths;
        }
      } catch (error) {
        logMessage(`Error reading FileNameW: ${error}`, "warn");
      }
    }

    // macOS Finder uses public.file-url
    if (formats.includes("public.file-url")) {
      try {
        const fileUrl = clipboard.read("public.file-url");
        if (fileUrl) {
          const paths = fileUrl
            .split("\n")
            .filter(Boolean)
            .map((uri: string) => {
              try {
                // Handle both file:// URLs and plain paths
                if (uri.startsWith("file://")) {
                  return decodeURIComponent(new URL(uri.trim()).pathname);
                }
                return uri.trim();
              } catch {
                return null;
              }
            })
            .filter((p: string | null): p is string => p !== null);
          if (paths.length > 0) {
            logMessage(`Read ${paths.length} file paths from public.file-url`);
            return paths;
          }
        }
      } catch (error) {
        logMessage(`Error reading public.file-url: ${error}`, "warn");
      }
    }

    // Fallback: check if plain text looks like file paths
    try {
      const text = clipboard.readText();
      if (text) {
        // Check if it looks like file path(s)
        const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
        const possiblePaths = lines.filter((line: string) => {
          // Check for common path patterns
          return (
            line.startsWith("/") || // Unix absolute path
            line.startsWith("~") || // Unix home path
            /^[A-Za-z]:\\/.test(line) || // Windows path
            line.startsWith("file://") // File URL
          );
        });
        if (possiblePaths.length > 0 && possiblePaths.length === lines.length) {
          // All lines look like paths
          const paths = possiblePaths.map((p: string) => {
            if (p.startsWith("file://")) {
              try {
                return decodeURIComponent(new URL(p).pathname);
              } catch {
                return p;
              }
            }
            return p;
          });
          logMessage(`Read ${paths.length} file paths from plain text`);
          return paths;
        }
      }
    } catch (error) {
      logMessage(`Error reading plain text for file paths: ${error}`, "warn");
    }

    return [];
  });

  // Read raw buffer data from clipboard for a specific format
  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_BUFFER,
    async (_event, format) => {
      try {
        const buffer = clipboard.readBuffer(format);
        if (buffer && buffer.length > 0) {
          // Return as base64 string for safe IPC transfer
          return buffer.toString("base64");
        }
        return null;
      } catch (error) {
        logMessage(`Failed to read clipboard buffer for format ${format}: ${error}`, "warn");
        return null;
      }
    },
  );

  // Get comprehensive clipboard content info for smart paste decisions
  createIpcMainHandler(IpcChannels.CLIPBOARD_GET_CONTENT_INFO, async () => {
    const formats = clipboard.availableFormats();
    
    // Determine content type based on available formats
    const hasImage = formats.some((f: string) => 
      f.includes("image/") || 
      f === "image/png" || 
      f === "image/tiff" || 
      f === "public.tiff" ||
      f === "org.chromium.image-html"
    );
    
    const hasFiles = formats.some((f: string) => 
      f === "text/uri-list" || 
      f === "FileNameW" || 
      f === "public.file-url" ||
      f === "CF_HDROP"
    );
    
    const hasHtml = formats.some((f: string) => 
      f === "text/html" || 
      f.includes("html")
    );
    
    const hasRtf = formats.some((f: string) => 
      f === "text/rtf" || 
      f.includes("rtf")
    );
    
    const hasText = formats.some((f: string) => 
      f === "text/plain" || 
      f === "text" ||
      f === "STRING" ||
      f === "UTF8_STRING"
    );

    return {
      formats,
      hasImage,
      hasFiles,
      hasHtml,
      hasRtf,
      hasText,
      platform: process.platform as "darwin" | "win32" | "linux"
    };
  });

  createIpcMainHandler(
    IpcChannels.FILE_READ_AS_DATA_URL,
    async (_event, filePath) => {
      try {
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");
        
        // MIME type lookup map for better maintainability
        const mimeTypeMap: Record<string, string> = {
          // Image types
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          ico: "image/x-icon",
          svg: "image/svg+xml",
          // Audio types
          mp3: "audio/mpeg",
          wav: "audio/wav",
          ogg: "audio/ogg",
          m4a: "audio/mp4",
          flac: "audio/flac",
          aac: "audio/aac",
          // Video types
          mp4: "video/mp4",
          avi: "video/x-msvideo",
          mov: "video/quicktime",
          wmv: "video/x-ms-wmv",
          flv: "video/x-flv",
          webm: "video/webm",
          mkv: "video/x-matroska",
          // Document types
          pdf: "application/pdf",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          txt: "text/plain",
          html: "text/html",
        };
        
        const mimeType = mimeTypeMap[ext] || "application/octet-stream";
        
        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      } catch (error) {
        logMessage(`Failed to read file as data URL: ${error}`, "warn");
        return null;
      }
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_READ_BUFFER,
    async (_event, filePath) => {
      try {
        const buffer = await fs.readFile(filePath);
        const ext = path.extname(filePath).toLowerCase().replace(".", "");

        // MIME type lookup map for better maintainability
        const mimeTypeMap: Record<string, string> = {
          // Image types
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          webp: "image/webp",
          bmp: "image/bmp",
          ico: "image/x-icon",
          svg: "image/svg+xml",
          // Audio types
          mp3: "audio/mpeg",
          wav: "audio/wav",
          ogg: "audio/ogg",
          m4a: "audio/mp4",
          flac: "audio/flac",
          aac: "audio/aac",
          // Video types
          mp4: "video/mp4",
          avi: "video/x-msvideo",
          mov: "video/quicktime",
          wmv: "video/x-ms-wmv",
          flv: "video/x-flv",
          webm: "video/webm",
          mkv: "video/x-matroska",
          // Document types
          pdf: "application/pdf",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          txt: "text/plain",
          html: "text/html",
        };

        const mimeType = mimeTypeMap[ext] || "application/octet-stream";

        return { buffer, mimeType };
      } catch (error) {
        logMessage(`Failed to read file buffer: ${error}`, "warn");
        return null;
      }
    },
  );

  // Server state handlers
  createIpcMainHandler(IpcChannels.GET_SERVER_STATE, async () => {
    return getServerState();
  });

  createIpcMainHandler(IpcChannels.OPEN_LOG_FILE, async () => {
    openLogFile();
  });

  createIpcMainHandler(
    IpcChannels.SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      showItemInFolder(fullPath);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_PATH,
    async (_event, request) => {
      return openPathInExplorer(request.path);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY,
    async (_event, target) => {
      return openModelDirectory(target);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY,
    async (_event, target) => {
      return openSystemDirectory(target);
    },
  );

  // Continue to app handler
  createIpcMainHandler(IpcChannels.START_SERVER, async () => {
    logMessage("User continued to app from package manager");
    await initializeBackendServer();
    logMessage("Setting up workflow shortcuts after server start...");
    await setupWorkflowShortcuts();
  });

  // Restart server handler
  createIpcMainHandler(IpcChannels.RESTART_SERVER, async () => {
    logMessage("Restarting backend server by user request");
    try {
      await stopServer();
    } catch (e) {
      logMessage(`Error while stopping server for restart: ${e}`, "warn");
    }
    // Small delay to ensure ports and resources are released before restart
    await new Promise((resolve) => setTimeout(resolve, 300));
    await initializeBackendServer();
    await setupWorkflowShortcuts();
  });

  // Restart llama-server handler (used after downloading new models)
  createIpcMainHandler(IpcChannels.RESTART_LLAMA_SERVER, async () => {
    logMessage("Restarting llama-server to pick up new models");
    await restartLlamaServer();
  });

  // App control handlers
  createIpcMainHandler(IpcChannels.RUN_APP, async (_event, workflowId) => {
    logMessage(`Running app with workflow ID: ${workflowId}`);
    await runApp(workflowId);
  });

  // Show Package Manager window
  createIpcMainHandler(
    IpcChannels.SHOW_PACKAGE_MANAGER,
    async (_event, nodeSearch) => {
      logMessage(
        `Opening Package Manager window${
          nodeSearch ? ` with search: ${nodeSearch}` : ""
        }`,
      );
      createPackageManagerWindow(nodeSearch);
    },
  );

  createIpcMainHandler(IpcChannels.INSTALL_UPDATE, async () => {
    const { autoUpdater } = await import("electron-updater");
    logMessage("User requested to install update and restart");
    autoUpdater.quitAndInstall();
  });

  // Window control handlers
  ipcMain.on(IpcChannels.WINDOW_CLOSE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.close();
      }
    } catch (error) {
      logMessage(`Error in window close: ${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MINIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.minimize();
      }
    } catch (error) {
      logMessage(`Error in window minimize: ${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    } catch (error) {
      logMessage(`Error in window maximize: ${error}`, "error");
    }
  });

  createIpcMainHandler(
    IpcChannels.ON_CREATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Creating workflow: ${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    },
  );

  createIpcMainHandler(
    IpcChannels.ON_UPDATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Updating workflow: ${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    },
  );

  createIpcMainHandler(
    IpcChannels.ON_DELETE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`Deleting workflow: ${workflow.name}`);
      if (workflow.settings?.shortcut) {
        globalShortcut.unregister(workflow.settings.shortcut);
      }
      emitWorkflowsChanged();
    },
  );

  // Package manager handlers
  createIpcMainHandler(IpcChannels.PACKAGE_LIST_AVAILABLE, async () => {
    logMessage("Fetching available packages");
    return await fetchAvailablePackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_LIST_INSTALLED, async () => {
    logMessage("Listing installed packages");
    return await listInstalledPackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_INSTALL, async (_event, request) => {
    logMessage(`Installing package: ${request.repo_id}`);
    const validation = validateRepoId(request.repo_id);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid repository ID",
      };
    }
    return await installPackage(request.repo_id);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_UNINSTALL,
    async (_event, request) => {
      logMessage(`Uninstalling package: ${request.repo_id}`);
      const validation = validateRepoId(request.repo_id);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.error || "Invalid repository ID",
        };
      }
      return await uninstallPackage(request.repo_id);
    },
  );

  createIpcMainHandler(IpcChannels.PACKAGE_UPDATE, async (_event, repoId) => {
    logMessage(`Updating package: ${repoId}`);
    const validation = validateRepoId(repoId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "Invalid repository ID",
      };
    }
    return await updatePackage(repoId);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_SEARCH_NODES,
    async (_event, query) => {
      try {
        const results = await searchNodes(query || "");
        return results;
      } catch (e) {
        logMessage(`Error in PACKAGE_SEARCH_NODES: ${String(e)}`, "warn");
        return [];
      }
    },
  );

  createIpcMainHandler(
    IpcChannels.PACKAGE_OPEN_EXTERNAL,
    async (_event, url) => {
      logMessage(`Opening external URL: ${url}`);
      shell.openExternal(url);
    },
  );

  // Package version check handler
  createIpcMainHandler(IpcChannels.PACKAGE_VERSION_CHECK, async () => {
    logMessage("Checking expected package versions");
    return await checkExpectedPackageVersions();
  });

  // Log viewer handlers
  createIpcMainHandler(IpcChannels.GET_LOGS, async () => {
    logMessage("Getting server logs");
    return getServerState().logs;
  });

  createIpcMainHandler(IpcChannels.CLEAR_LOGS, async () => {
    logMessage("Clearing server logs");
    getServerState().logs = [];
  });

  createIpcMainHandler(IpcChannels.FRONTEND_LOG, async (_event, data) => {
    const source = data.source?.trim() ? `[${data.source.trim()}] ` : "";
    logMessage(`${source}${data.message}`, data.level);
  });

  createIpcMainHandler(IpcChannels.CHECK_OLLAMA_INSTALLED, async () => {
    // Lazy import to avoid circular deps if any
    const { isOllamaInstalled } = await import("./python");
    return await isOllamaInstalled();
  });

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_REQUEST,
    async (_event, request) => {
      const parsedUrl = assertLocalhostUrl(request.url);
      const method = sanitizeProxyMethod(request.method);
      const responseType = request.responseType || "text";
      logMessage(
        `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()}`,
        "info",
      );

      let response: Response;
      try {
        response = await fetch(parsedUrl.toString(), {
          method,
          headers: request.headers,
          body: request.body,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logMessage(
          `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()} failed: ${message}`,
          "warn",
        );
        return {
          status: 0,
          ok: false,
          headers: {
            "status-text": message,
            "x-localhost-proxy-error": "1",
          },
          error: message,
          data: responseType === "json" ? null : "",
        };
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data =
        responseType === "json"
          ? await response.json()
          : await response.text();

      logMessage(
        `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()} -> ${response.status}`,
        response.ok ? "info" : "warn",
      );

      return {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        data,
      };
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_OPEN,
    async (event, request) => {
      const parsedUrl = assertLocalhostUrl(request.url, ["ws:", "wss:"]);
      const senderId = event.sender.id;
      const connectionId = randomUUID();
      logMessage(
        `[localhost-proxy] WS open requested ${parsedUrl.toString()} (sender=${senderId})`,
        "info",
      );
      const socket = new WebSocket(parsedUrl.toString(), request.protocols, {
        headers: request.headers,
      });

      LOCALHOST_PROXY_WS_STATES.set(connectionId, { senderId, socket });
      let senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(senderId);
      if (!senderConnections) {
        senderConnections = new Set<string>();
        LOCALHOST_PROXY_WS_IDS_BY_SENDER.set(senderId, senderConnections);
        event.sender.once("destroyed", () => {
          closeAllLocalhostProxyWsForSender(senderId);
        });
      }
      senderConnections.add(connectionId);

      socket.on("open", () => {
        logMessage(
          `[localhost-proxy] WS open ${connectionId} ${parsedUrl.toString()}`,
          "info",
        );
        event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
          connectionId,
          event: "open",
        });
      });

      socket.on("message", (data) => {
        const textData =
          typeof data === "string"
            ? data
            : Array.isArray(data)
              ? Buffer.concat(data).toString("utf8")
              : Buffer.from(data as any).toString("utf8");
        event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
          connectionId,
          event: "message",
          data: textData,
        });
        logMessage(
          `[localhost-proxy] WS message ${connectionId} (${textData.length} bytes)`,
          "info",
        );
      });

      socket.on("error", (error) => {
        logMessage(
          `[localhost-proxy] WS error ${connectionId}: ${error.message}`,
          "error",
        );
        event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
          connectionId,
          event: "error",
          error: error.message,
        });
      });

      socket.on("close", (code, reason) => {
        logMessage(
          `[localhost-proxy] WS close ${connectionId} code=${code} reason=${reason.toString("utf8")}`,
          "info",
        );
        event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
          connectionId,
          event: "close",
          code,
          reason: reason.toString("utf8"),
        });
        cleanupLocalhostProxyWsConnection(connectionId);
      });

      return { connectionId };
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_SEND,
    async (event, request) => {
      logMessage(
        `[localhost-proxy] WS send ${request.connectionId} (${request.data.length} bytes)`,
        "info",
      );
      const connection = LOCALHOST_PROXY_WS_STATES.get(request.connectionId);
      if (!connection) {
        logMessage(
          `[localhost-proxy] WS send failed: connection ${request.connectionId} not found`,
          "warn",
        );
        throw new Error("WebSocket connection not found");
      }
      if (connection.senderId !== event.sender.id) {
        logMessage(
          `[localhost-proxy] WS send denied for ${request.connectionId}: sender mismatch`,
          "warn",
        );
        throw new Error("WebSocket connection belongs to another renderer");
      }
      if (connection.socket.readyState !== WebSocket.OPEN) {
        logMessage(
          `[localhost-proxy] WS send failed for ${request.connectionId}: socket not open`,
          "warn",
        );
        throw new Error("WebSocket is not open");
      }
      connection.socket.send(request.data);
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_CLOSE,
    async (event, request) => {
      logMessage(
        `[localhost-proxy] WS close requested ${request.connectionId}`,
        "info",
      );
      const connection = LOCALHOST_PROXY_WS_STATES.get(request.connectionId);
      if (!connection) {
        logMessage(
          `[localhost-proxy] WS close noop: ${request.connectionId} not found`,
          "warn",
        );
        return;
      }
      if (connection.senderId !== event.sender.id) {
        throw new Error("WebSocket connection belongs to another renderer");
      }
      connection.socket.close(request.code, request.reason);
    },
  );

  // Shell module handlers
  createIpcMainHandler(
    IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      logMessage(`Showing item in folder: ${fullPath}`);
      shell.showItemInFolder(fullPath);
    },
  );

  createIpcMainHandler(IpcChannels.SHELL_OPEN_PATH, async (_event, path) => {
    logMessage(`Opening path: ${path}`);
    const errorMessage = await shell.openPath(path);
    return errorMessage;
  });

  createIpcMainHandler(
    IpcChannels.SHELL_OPEN_EXTERNAL,
    async (_event, request) => {
      logMessage(`Opening external URL: ${request.url}`);
      await shell.openExternal(request.url, request.options);
    },
  );

  createIpcMainHandler(IpcChannels.SHELL_TRASH_ITEM, async (_event, path) => {
    logMessage(`Moving to trash: ${path}`);
    await shell.trashItem(path);
  });

  createIpcMainHandler(IpcChannels.SHELL_BEEP, async () => {
    shell.beep();
  });

  createIpcMainHandler(
    IpcChannels.SHELL_WRITE_SHORTCUT_LINK,
    async (_event, request) => {
      if (process.platform !== "win32") {
        logMessage("Shortcut links are only supported on Windows", "warn");
        return false;
      }
      logMessage(`Writing shortcut: ${request.shortcutPath}`);
      return shell.writeShortcutLink(
        request.shortcutPath,
        request.operation || "create",
        request.options || { target: "" },
      );
    },
  );

  createIpcMainHandler(
    IpcChannels.SHELL_READ_SHORTCUT_LINK,
    async (_event, shortcutPath) => {
      if (process.platform !== "win32") {
        logMessage("Shortcut links are only supported on Windows", "warn");
        throw new Error("Shortcut links are only supported on Windows");
      }
      logMessage(`Reading shortcut: ${shortcutPath}`);
      return shell.readShortcutLink(shortcutPath);
    },
  );

  // Settings handlers
  createIpcMainHandler(IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR, async () => {
    const settings = readSettings();
    const action = settings.windowCloseAction as WindowCloseAction | undefined;
    return action || "ask";
  });

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR,
    async (_event, action) => {
      logMessage(`Setting window close behavior to: ${action}`);
      updateSetting("windowCloseAction", action);
      emitServerStateChanged();
    },
  );

  // Auto-updates settings handlers (opt-in)
  createIpcMainHandler(IpcChannels.SETTINGS_GET_AUTO_UPDATES, async () => {
    const settings = readSettings();
    // Auto-updates are opt-in, default to false
    return settings.autoUpdatesEnabled === true;
  });

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_AUTO_UPDATES,
    async (_event, enabled) => {
      logMessage(`Setting auto-updates to: ${enabled}`);
      updateSetting("autoUpdatesEnabled", enabled);
    },
  );

  createIpcMainHandler(
    IpcChannels.SETTINGS_GET_MODEL_SERVICES_STARTUP,
    async () => {
      const settings = readSettings();
      return getModelServiceStartupSettings(settings);
    },
  );

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_MODEL_SERVICES_STARTUP,
    async (_event, update) => {
      logMessage(
        `Updating model services startup settings: ${JSON.stringify(update)}`
      );
      const next = updateModelServiceStartupSettings(update);
      emitServerStateChanged();
      return next;
    },
  );

  // Show settings window
  createIpcMainHandler(IpcChannels.SHOW_SETTINGS, async () => {
    logMessage("Opening Settings window");
    createSettingsWindow();
  });

  createIpcMainHandler(IpcChannels.GET_SYSTEM_INFO, async () => {
    const { getSystemInfo } = await import("./systemInfo");
    return await getSystemInfo();
  });

  createIpcMainHandler(
    IpcChannels.DEBUG_EXPORT_BUNDLE,
    async (_event, request) => {
      logMessage("Exporting debug bundle");
      return await exportDebugBundle(request);
    },
  );

  // Dialog handlers for native file/folder selection
  createIpcMainHandler(
    IpcChannels.DIALOG_OPEN_FILE,
    async (_event, request) => {
      logMessage("Opening native file dialog");
      const properties: ("openFile" | "multiSelections")[] = ["openFile"];
      if (request.multiSelections) {
        properties.push("multiSelections");
      }

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: request.title || "Select File",
        defaultPath: request.defaultPath,
        filters: request.filters,
        properties,
      });

      return { canceled, filePaths };
    },
  );

  createIpcMainHandler(
    IpcChannels.DIALOG_OPEN_FOLDER,
    async (_event, request) => {
      logMessage("Opening native folder dialog");
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: request.title || "Select Folder",
        defaultPath: request.defaultPath,
        buttonLabel: request.buttonLabel || "Select Folder",
        properties: ["openDirectory", "createDirectory"],
      });

      return { canceled, filePaths };
    },
  );

  // Claude Agent SDK handlers
  createIpcMainHandler(
    IpcChannels.AGENT_CREATE_SESSION,
    async (_event, options) => {
      const { createAgentSession } = await import("./agent");
      return await createAgentSession(options);
    },
  );

  createIpcMainHandler(
    IpcChannels.AGENT_LIST_MODELS,
    async (_event, options) => {
      const { listAgentModels } = await import("./agent");
      return await listAgentModels(options ?? {});
    },
  );

  createIpcMainHandler(
    IpcChannels.AGENT_SEND_MESSAGE,
    async (event, request) => {
      const { sendAgentMessageStreaming } = await import("./agent");
      // Use streaming - messages will be sent via IPC events as they arrive
      await sendAgentMessageStreaming(
        request.sessionId,
        request.message,
        event.sender,
      );
      // Return empty array since messages are streamed via events
      return [];
    },
  );

  createIpcMainHandler(
    IpcChannels.AGENT_STOP_EXECUTION,
    async (_event, sessionId) => {
      const { stopAgentExecution } = await import("./agent");
      await stopAgentExecution(sessionId);
    },
  );

  createIpcMainHandler(
    IpcChannels.AGENT_CLOSE_SESSION,
    async (_event, sessionId) => {
      const { closeAgentSession } = await import("./agent");
      closeAgentSession(sessionId);
    },
  );

  // Frontend tools handlers
  // Get the frontend tools manifest from the renderer
  createIpcMainHandler(
    IpcChannels.FRONTEND_TOOLS_GET_MANIFEST,
    async (event, request) => {
      logMessage(`Getting frontend tools manifest for session: ${request.sessionId}`);
      const result = await requestRendererEvent<IpcResponse[IpcChannels.FRONTEND_TOOLS_GET_MANIFEST]>(
        event,
        IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST,
        IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE,
        {
          sessionId: request.sessionId,
        },
      );
      return result;
    },
  );

  // Call a frontend tool in the renderer process
  createIpcMainHandler(
    IpcChannels.FRONTEND_TOOLS_CALL,
    async (event, request) => {
      logMessage(
        `Calling frontend tool: ${request.name} for session: ${request.sessionId}`
      );
      const result = await requestRendererEvent<IpcResponse[IpcChannels.FRONTEND_TOOLS_CALL]>(
        event,
        IpcChannels.FRONTEND_TOOLS_CALL_REQUEST,
        IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE,
        {
          sessionId: request.sessionId,
          toolCallId: request.toolCallId,
          name: request.name,
          args: request.args,
        },
      );
      return result;
    },
  );

  // Abort any running frontend tool calls for a session
  createIpcMainHandler(
    IpcChannels.FRONTEND_TOOLS_ABORT,
    async (event, sessionId) => {
      logMessage(`Aborting frontend tools for session: ${sessionId}`);
      // Notify the renderer to abort any running tool calls
      event.sender.send(IpcChannels.FRONTEND_TOOLS_ABORT, { sessionId });
    },
  );
}
