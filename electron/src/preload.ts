/**
 * Preload Script for NodeTool Electron Application
 *
 * This script serves as a secure bridge between the renderer process and the main process.
 * It exposes a single, namespaced API via contextBridge that follows SDK design principles:
 *
 * - Single global entry point: window.api
 * - Namespaced by capability (server, packages, workflows, etc.)
 * - Events return unsubscribe functions
 * - IPC semantics are completely hidden from renderer
 * - Input validation at the trust boundary
 */

import { contextBridge, ipcRenderer } from "electron";

import {
  InstallLocationData,
  IpcChannels,
  IpcEvents,
  LocalhostProxyWsCloseRequest,
  LocalhostProxyWsOpenRequest,
  LocalhostProxyWsSendRequest,
  MenuEventData,
  PackageUpdateInfo,
  PythonPackages,
  UpdateProgressData,
  UpdateInfo,
  Workflow,
  ModelDirectory,
  SystemDirectory,
  DialogOpenFileRequest,
  DialogOpenFolderRequest,
  AgentSessionOptions,
  LocalhostProxyRequest,
} from "./types.d";

// ============================================================================
// Type Definitions
// ============================================================================

type ClipboardType = "clipboard" | "selection";

// ============================================================================
// Event Handler Factory
// ============================================================================

/**
 * Creates an event subscription that returns an unsubscribe function.
 * This pattern ensures all event listeners can be properly cleaned up.
 */
function createEventSubscription<T extends keyof IpcEvents>(
  channel: T,
): (callback: (data: IpcEvents[T]) => void) => () => void {
  return (callback: (data: IpcEvents[T]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: IpcEvents[T]) =>
      callback(data);
    ipcRenderer.on(channel as string, listener);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener(channel as string, listener);
    };
  };
}

// ============================================================================
// Backwards-compat event unsubscription support
// ============================================================================

const menuEventUnsubscribers = new Map<
  (data: MenuEventData) => void,
  () => void
>();

// ============================================================================
// Input Validation Helpers
// ============================================================================

/**
 * Validates that a path string is safe (no null bytes, reasonable length)
 */
function validatePath(path: string): string {
  if (typeof path !== "string") {
    throw new Error("Path must be a string");
  }
  if (path.includes("\0")) {
    throw new Error("Path contains invalid characters");
  }
  if (path.length > 4096) {
    throw new Error("Path exceeds maximum length");
  }
  return path;
}

/**
 * Validates that a URL string is safe
 */
function validateUrl(url: string): string {
  if (typeof url !== "string") {
    throw new Error("URL must be a string");
  }
  if (url.length > 8192) {
    throw new Error("URL exceeds maximum length");
  }
  // Only allow http, https, and file protocols
  try {
    const parsed = new URL(url);
    if (!["http:", "https:", "file:"].includes(parsed.protocol)) {
      throw new Error("Invalid URL protocol");
    }
  } catch {
    throw new Error("Invalid URL format");
  }
  return url;
}

/**
 * Validates repository ID format (owner/repo)
 */
function validateRepoId(repoId: string): string {
  if (typeof repoId !== "string") {
    throw new Error("Repository ID must be a string");
  }
  if (!/^[\w.-]+\/[\w.-]+$/.test(repoId)) {
    throw new Error("Invalid repository ID format");
  }
  return repoId;
}

// ============================================================================
// API Definition
// ============================================================================

/**
 * Expose the unified API to renderer process through contextBridge.
 * This creates the window.api object with namespaced capabilities.
 */
const api = {
  // Platform information (exposed as static value)
  platform: process.platform,

  // ============================================================================
  // Backwards-compatible (flat) API surface
  // ============================================================================

  /** Run a workflow as an app */
  runApp: (workflowId: string) =>
    ipcRenderer.invoke(IpcChannels.RUN_APP, workflowId),

  /** OS integration (legacy names) */
  openLogFile: () => ipcRenderer.invoke(IpcChannels.OPEN_LOG_FILE),
  showItemInFolder: (fullPath: string) =>
    ipcRenderer.invoke(IpcChannels.SHOW_ITEM_IN_FOLDER, validatePath(fullPath)),
  openModelDirectory: (target: ModelDirectory) =>
    ipcRenderer.invoke(IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY, target),
  openModelPath: (path: string) =>
    ipcRenderer.invoke(IpcChannels.FILE_EXPLORER_OPEN_PATH, {
      path: validatePath(path),
    }),
  openSystemDirectory: (target: SystemDirectory) =>
    ipcRenderer.invoke(IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY, target),
  openExternal: (url: string) =>
    ipcRenderer.invoke(IpcChannels.PACKAGE_OPEN_EXTERNAL, validateUrl(url)),

  /** Workflow notifications (legacy names) */
  onCreateWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_CREATE_WORKFLOW, workflow),
  onUpdateWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_UPDATE_WORKFLOW, workflow),
  onDeleteWorkflow: (workflow: Workflow) =>
    ipcRenderer.invoke(IpcChannels.ON_DELETE_WORKFLOW, workflow),

  /** Package manager (legacy name) */
  showPackageManager: (nodeSearch?: string) =>
    ipcRenderer.invoke(IpcChannels.SHOW_PACKAGE_MANAGER, nodeSearch),

  /** Server (legacy names) */
  restartServer: () => ipcRenderer.invoke(IpcChannels.RESTART_SERVER),
  onServerLog: createEventSubscription(IpcChannels.SERVER_LOG),

  /** Restart llama server (legacy name) */
  restartLlamaServer: () =>
    ipcRenderer.invoke(IpcChannels.RESTART_LLAMA_SERVER),

  /** Log viewer (legacy names) */
  getLogs: () => ipcRenderer.invoke(IpcChannels.GET_LOGS),
  clearLogs: () => ipcRenderer.invoke(IpcChannels.CLEAR_LOGS),

  /** Window controls (legacy name) */
  windowControls: {
    close: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),
    minimize: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),
    maximize: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
  },

  /** Menu events (legacy names) */
  onMenuEvent: (callback: (data: MenuEventData) => void) => {
    const existingUnsubscribe = menuEventUnsubscribers.get(callback);
    if (existingUnsubscribe) existingUnsubscribe();
    const unsubscribe = createEventSubscription(IpcChannels.MENU_EVENT)(
      callback,
    );
    menuEventUnsubscribers.set(callback, unsubscribe);
  },
  unregisterMenuEvent: (callback: (data: MenuEventData) => void) => {
    const unsubscribe = menuEventUnsubscribers.get(callback);
    if (!unsubscribe) return;
    unsubscribe();
    menuEventUnsubscribers.delete(callback);
  },

  // ============================================================================
  // server: Server lifecycle, logs, and status
  // ============================================================================
  server: {
    /** Get current server state */
    getState: () => ipcRenderer.invoke(IpcChannels.GET_SERVER_STATE),

    /** Start the backend server */
    start: () => ipcRenderer.invoke(IpcChannels.START_SERVER),

    /** Restart the backend server */
    restart: () => ipcRenderer.invoke(IpcChannels.RESTART_SERVER),

    /** Restart the llama server (for model updates) */
    restartLlama: () => ipcRenderer.invoke(IpcChannels.RESTART_LLAMA_SERVER),

    /** Subscribe to server started event */
    onStarted: createEventSubscription(IpcChannels.SERVER_STARTED),

    /** Subscribe to server log messages */
    onLog: createEventSubscription(IpcChannels.SERVER_LOG),

    /** Subscribe to server error events */
    onError: createEventSubscription(IpcChannels.SERVER_ERROR),

    /** Subscribe to boot messages */
    onBootMessage: createEventSubscription(IpcChannels.BOOT_MESSAGE),
  },

  // ============================================================================
  // workflows: Workflow CRUD operations
  // ============================================================================
  workflows: {
    /** Notify main process of workflow creation */
    create: (workflow: Workflow) =>
      ipcRenderer.invoke(IpcChannels.ON_CREATE_WORKFLOW, workflow),

    /** Notify main process of workflow update */
    update: (workflow: Workflow) =>
      ipcRenderer.invoke(IpcChannels.ON_UPDATE_WORKFLOW, workflow),

    /** Notify main process of workflow deletion */
    delete: (workflow: Workflow) =>
      ipcRenderer.invoke(IpcChannels.ON_DELETE_WORKFLOW, workflow),

    /** Run a workflow as an app */
    run: (workflowId: string) =>
      ipcRenderer.invoke(IpcChannels.RUN_APP, workflowId),
  },

  // ============================================================================
  // packages: Package management
  // ============================================================================
  packages: {
    /** List all available packages from registry */
    listAvailable: () => ipcRenderer.invoke(IpcChannels.PACKAGE_LIST_AVAILABLE),

    /** List all installed packages */
    listInstalled: () => ipcRenderer.invoke(IpcChannels.PACKAGE_LIST_INSTALLED),

    /** Install a package by repository ID */
    install: (repoId: string) =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_INSTALL, {
        repo_id: validateRepoId(repoId),
      }),

    /** Uninstall a package by repository ID */
    uninstall: (repoId: string) =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_UNINSTALL, {
        repo_id: validateRepoId(repoId),
      }),

    /** Update a package by repository ID */
    update: (repoId: string) =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_UPDATE, validateRepoId(repoId)),

    /** Search for nodes across packages */
    searchNodes: (query: string) =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_SEARCH_NODES, query),

    /** Open the package manager window */
    showManager: (nodeSearch?: string) =>
      ipcRenderer.invoke(IpcChannels.SHOW_PACKAGE_MANAGER, nodeSearch),

    /** Subscribe to package updates available event */
    onUpdatesAvailable: createEventSubscription(
      IpcChannels.PACKAGE_UPDATES_AVAILABLE,
    ),

    /** Check package versions against expected versions */
    checkVersion: () =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_VERSION_CHECK),
  },

  // ============================================================================
  // window: Window controls
  // ============================================================================
  window: {
    /** Close the current window */
    close: () => ipcRenderer.send(IpcChannels.WINDOW_CLOSE),

    /** Minimize the current window */
    minimize: () => ipcRenderer.send(IpcChannels.WINDOW_MINIMIZE),

    /** Maximize/restore the current window */
    maximize: () => ipcRenderer.send(IpcChannels.WINDOW_MAXIMIZE),
  },

  // ============================================================================
  // system: OS integration, file explorer, external links
  // ============================================================================
  system: {
    /** Open the application log file */
    openLogFile: () => ipcRenderer.invoke(IpcChannels.OPEN_LOG_FILE),

    /** Show an item in the file explorer */
    showItemInFolder: (fullPath: string) =>
      ipcRenderer.invoke(
        IpcChannels.SHOW_ITEM_IN_FOLDER,
        validatePath(fullPath),
      ),

    /** Open a model directory (huggingface or ollama) */
    openModelDirectory: (target: ModelDirectory) =>
      ipcRenderer.invoke(IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY, target),

    /** Open a specific path in the file explorer */
    openModelPath: (path: string) =>
      ipcRenderer.invoke(IpcChannels.FILE_EXPLORER_OPEN_PATH, {
        path: validatePath(path),
      }),

    /** Open a system directory (installation or logs) */
    openSystemDirectory: (target: SystemDirectory) =>
      ipcRenderer.invoke(
        IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY,
        target,
      ),

    /** Open a URL in the system browser */
    openExternal: (url: string) =>
      ipcRenderer.invoke(IpcChannels.PACKAGE_OPEN_EXTERNAL, validateUrl(url)),

    /** Check if Ollama is installed */
    checkOllamaInstalled: () =>
      ipcRenderer.invoke(IpcChannels.CHECK_OLLAMA_INSTALLED),
  },

  // ============================================================================
  // clipboard: Clipboard operations
  // ============================================================================
  clipboard: {
    /** Read text from clipboard */
    readText: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_TEXT, type),

    /** Write text to clipboard */
    writeText: (text: string, type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_TEXT, { text, type }),

    /** Read HTML from clipboard */
    readHTML: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_HTML, type),

    /** Write HTML to clipboard */
    writeHTML: (markup: string, type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_HTML, { markup, type }),

    /** Read image from clipboard (returns data URL) */
    readImage: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_IMAGE, type),

    /** Write image to clipboard from data URL */
    writeImage: (dataUrl: string, type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_IMAGE, { dataUrl, type }),

    /** Read RTF from clipboard */
    readRTF: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_RTF, type),

    /** Write RTF to clipboard */
    writeRTF: (text: string, type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_RTF, { text, type }),

    /** Read bookmark from clipboard (macOS/Windows) */
    readBookmark: () => ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_BOOKMARK),

    /** Write bookmark to clipboard (macOS/Windows) */
    writeBookmark: (title: string, url: string, type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_BOOKMARK, {
        title,
        url: validateUrl(url),
        type,
      }),

    /** Read find pasteboard text (macOS only) */
    readFindText: () =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_FIND_TEXT),

    /** Write to find pasteboard (macOS only) */
    writeFindText: (text: string) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_WRITE_FIND_TEXT, text),

    /** Clear clipboard contents */
    clear: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_CLEAR, type),

    /** Get available clipboard formats */
    availableFormats: (type?: ClipboardType) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_AVAILABLE_FORMATS, type),

    /** Read file paths from clipboard (cross-platform) */
    readFilePaths: () =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_FILE_PATHS),

    /** Read raw buffer data from clipboard for a specific format (returns base64) */
    readBuffer: (format: string) =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_READ_BUFFER, format),

    /** Get comprehensive clipboard content info for smart paste decisions */
    getContentInfo: () =>
      ipcRenderer.invoke(IpcChannels.CLIPBOARD_GET_CONTENT_INFO),

    /** Read file content as data URL */
    readFileAsDataURL: (filePath: string) =>
      ipcRenderer.invoke(
        IpcChannels.FILE_READ_AS_DATA_URL,
        validatePath(filePath),
      ),

    /** Read file content as buffer */
    readFileBuffer: (filePath: string) =>
      ipcRenderer.invoke(
        IpcChannels.FILE_READ_BUFFER,
        validatePath(filePath),
      ),
  },

  // ============================================================================
  // logs: Log viewer operations
  // ============================================================================
  logs: {
    /** Get all server logs */
    getAll: () => ipcRenderer.invoke(IpcChannels.GET_LOGS),

    /** Clear all server logs */
    clear: () => ipcRenderer.invoke(IpcChannels.CLEAR_LOGS),
  },

  // ============================================================================
  // installer: Installation operations
  // ============================================================================
  installer: {
    /** Select a custom install location */
    selectLocation: () =>
      ipcRenderer.invoke(IpcChannels.SELECT_CUSTOM_LOCATION),

    /** Install to a specific location */
    install: (
      location: string,
      packages: PythonPackages,
      modelBackend?: "ollama" | "llama_cpp" | "none",
      installOllama?: boolean,
      installLlamaCpp?: boolean,
      startOllamaOnStartup?: boolean,
      startLlamaCppOnStartup?: boolean,
    ) =>
      ipcRenderer.invoke(IpcChannels.INSTALL_TO_LOCATION, {
        location: validatePath(location),
        packages,
        modelBackend,
        installOllama,
        installLlamaCpp,
        startOllamaOnStartup,
        startLlamaCppOnStartup,
      }),

    /** Subscribe to install location prompt */
    onLocationPrompt: createEventSubscription(
      IpcChannels.INSTALL_LOCATION_PROMPT,
    ),

    /** Subscribe to update/install progress */
    onProgress: createEventSubscription(IpcChannels.UPDATE_PROGRESS),
  },

  // ============================================================================
  // updates: Application update events
  // ============================================================================
  updates: {
    /** Subscribe to update available event */
    onAvailable: createEventSubscription(IpcChannels.UPDATE_AVAILABLE),

    /** Restart and install the downloaded update */
    restartAndInstall: () =>
      ipcRenderer.invoke(IpcChannels.INSTALL_UPDATE),
  },

  // ============================================================================
  // menu: Menu event handling
  // ============================================================================
  menu: {
    /** Subscribe to menu events (cut, copy, paste, etc.) */
    onEvent: createEventSubscription(IpcChannels.MENU_EVENT),
  },

  // ============================================================================
  // shell: Desktop integration (Electron shell module)
  // ============================================================================
  shell: {
    /** Show a file in the file manager */
    showItemInFolder: (fullPath: string) =>
      ipcRenderer.invoke(
        IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER,
        validatePath(fullPath),
      ),

    /** Open a file in the desktop's default manner */
    openPath: (path: string) =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_PATH, validatePath(path)),

    /** Open an external URL in the default browser */
    openExternal: (
      url: string,
      options?: {
        activate?: boolean;
        workingDirectory?: string;
        logUsage?: boolean;
      },
    ) =>
      ipcRenderer.invoke(IpcChannels.SHELL_OPEN_EXTERNAL, {
        url: validateUrl(url),
        options,
      }),

    /** Move a file to the OS trash */
    trashItem: (path: string) =>
      ipcRenderer.invoke(IpcChannels.SHELL_TRASH_ITEM, validatePath(path)),

    /** Play the system beep sound */
    beep: () => ipcRenderer.invoke(IpcChannels.SHELL_BEEP),

    /** Create or update a Windows shortcut (Windows only) */
    writeShortcutLink: (
      shortcutPath: string,
      operation?: "create" | "update" | "replace",
      options?: {
        target: string;
        cwd?: string;
        args?: string;
        description?: string;
        icon?: string;
        iconIndex?: number;
        appUserModelId?: string;
        toastActivatorClsid?: string;
      },
    ) =>
      ipcRenderer.invoke(IpcChannels.SHELL_WRITE_SHORTCUT_LINK, {
        shortcutPath: validatePath(shortcutPath),
        operation,
        options,
      }),

    /** Read a Windows shortcut (Windows only) */
    readShortcutLink: (shortcutPath: string) =>
      ipcRenderer.invoke(
        IpcChannels.SHELL_READ_SHORTCUT_LINK,
        validatePath(shortcutPath),
      ),
  },

  // ============================================================================
  // localhostProxy: Generic localhost-only HTTP requests via main process
  // ============================================================================
  localhostProxy: {
    request: (request: LocalhostProxyRequest) =>
      ipcRenderer.invoke(IpcChannels.LOCALHOST_PROXY_REQUEST, request),
    wsOpen: (request: LocalhostProxyWsOpenRequest) =>
      ipcRenderer.invoke(IpcChannels.LOCALHOST_PROXY_WS_OPEN, request),
    wsSend: (request: LocalhostProxyWsSendRequest) =>
      ipcRenderer.invoke(IpcChannels.LOCALHOST_PROXY_WS_SEND, request),
    wsClose: (request: LocalhostProxyWsCloseRequest) =>
      ipcRenderer.invoke(IpcChannels.LOCALHOST_PROXY_WS_CLOSE, request),
    onWsEvent: createEventSubscription(IpcChannels.LOCALHOST_PROXY_WS_EVENT),
  },

  // ============================================================================
  // settings: Application settings
  // ============================================================================
  settings: {
    /** Get the window close behavior setting (Windows only) */
    getCloseBehavior: () =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR),

    /** Set the window close behavior setting (Windows only) */
    setCloseBehavior: (action: "ask" | "quit" | "background") =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR, action),

    /** Get system information for about dialog */
    getSystemInfo: () => ipcRenderer.invoke(IpcChannels.GET_SYSTEM_INFO),

    /** Get auto-updates setting (opt-in, default is false) */
    getAutoUpdates: () =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_GET_AUTO_UPDATES),

    /** Set auto-updates setting (opt-in) */
    setAutoUpdates: (enabled: boolean) =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_SET_AUTO_UPDATES, enabled),

    /** Get startup settings for managed local model services */
    getModelServicesStartup: () =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_GET_MODEL_SERVICES_STARTUP),

    /** Update startup settings for managed local model services */
    setModelServicesStartup: (update: {
      startOllamaOnStartup?: boolean;
      startLlamaCppOnStartup?: boolean;
    }) =>
      ipcRenderer.invoke(IpcChannels.SETTINGS_SET_MODEL_SERVICES_STARTUP, update),

    /** Open the settings window */
    openSettings: () => ipcRenderer.invoke(IpcChannels.SHOW_SETTINGS),
  },

  // ============================================================================
  // debug: Debug operations
  // ============================================================================
  debug: {
    /** Export a debug bundle containing logs, environment info, and workflow data */
    exportBundle: (request: {
      workflow_id?: string;
      graph?: Record<string, unknown>;
      errors?: string[];
      preferred_save?: "desktop" | "downloads";
    }) => ipcRenderer.invoke(IpcChannels.DEBUG_EXPORT_BUNDLE, request),
  },

  // ============================================================================
  // dialog: Native file/folder dialogs
  // ============================================================================
  dialog: {
    /** Open a native file selection dialog */
    openFile: (options?: DialogOpenFileRequest) =>
      ipcRenderer.invoke(IpcChannels.DIALOG_OPEN_FILE, options || {}),

    /** Open a native folder selection dialog */
    openFolder: (options?: DialogOpenFolderRequest) =>
      ipcRenderer.invoke(IpcChannels.DIALOG_OPEN_FOLDER, options || {}),
  },

  // ============================================================================
  // agent: Claude Agent SDK operations
  // ============================================================================
  agent: {
    /** Create a new Claude Agent session */
    createSession: (options: AgentSessionOptions) =>
      ipcRenderer.invoke(IpcChannels.AGENT_CREATE_SESSION, options),

    /** List available models for the selected provider */
    listModels: (options?: { provider?: "claude" | "codex"; workspacePath?: string }) =>
      ipcRenderer.invoke(IpcChannels.AGENT_LIST_MODELS, options || {}),

    /** Send a message to an active Claude Agent session */
    sendMessage: (sessionId: string, message: string) =>
      ipcRenderer.invoke(IpcChannels.AGENT_SEND_MESSAGE, {
        sessionId,
        message,
      }),

    /** Stop execution of the currently running turn for a session */
    stopExecution: (sessionId: string) =>
      ipcRenderer.invoke(IpcChannels.AGENT_STOP_EXECUTION, sessionId),

    /** Close an active Claude Agent session */
    closeSession: (sessionId: string) =>
      ipcRenderer.invoke(IpcChannels.AGENT_CLOSE_SESSION, sessionId),

    /** Subscribe to streaming messages from the Claude Agent */
    onStreamMessage: createEventSubscription(
      IpcChannels.AGENT_STREAM_MESSAGE,
    ),
  },

  // ============================================================================
  // frontendTools: Frontend tools for Claude Agent integration
  // ============================================================================
  frontendTools: {
    /** Get the manifest of available frontend tools */
    getManifest: (sessionId: string) =>
      ipcRenderer.invoke(IpcChannels.FRONTEND_TOOLS_GET_MANIFEST, {
        sessionId,
      }),

    /** Call a frontend tool and return its result */
    call: (
      sessionId: string,
      toolCallId: string,
      name: string,
      args: unknown,
    ) =>
      ipcRenderer.invoke(IpcChannels.FRONTEND_TOOLS_CALL, {
        sessionId,
        toolCallId,
        name,
        args,
      }),

    /** Subscribe to tool abort events */
    onAbort: createEventSubscription(IpcChannels.FRONTEND_TOOLS_ABORT),
  },

  // ============================================================================
  // logging: Renderer -> main logging bridge
  // ============================================================================
  logging: {
    log: (
      level: "info" | "warn" | "error",
      message: string,
      source?: string,
    ) =>
      ipcRenderer.invoke(IpcChannels.FRONTEND_LOG, {
        level,
        message,
        source,
      }),
  },

  // ============================================================================
  // ipc: Low-level IPC methods for registering handlers
  // ============================================================================
  ipc: {
    /** Invoke a main-process IPC handler */
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),

    /** Send an event to the main process */
    send: (channel: string, ...args: unknown[]) =>
      ipcRenderer.send(channel, ...args),

    /** Register a listener for IPC send events from the main process */
    on: (
      channel: string,
      listener: (event: Electron.IpcRendererEvent, ...args: unknown[]) => void,
    ) => {
      ipcRenderer.on(channel, listener);
    },

    /** Remove a listener for IPC send events */
    off: (
      channel: string,
      listener: (...args: unknown[]) => void,
    ) => {
      ipcRenderer.removeListener(channel, listener);
    },
  },
};

contextBridge.exposeInMainWorld("api", api);
// Some pages (e.g. `electron/pages/*`) still refer to `window.electronAPI`.
contextBridge.exposeInMainWorld("electronAPI", api);
