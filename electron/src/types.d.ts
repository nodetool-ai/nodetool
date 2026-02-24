type ClipboardType = "clipboard" | "selection";
export type FrontendLogLevel = "info" | "warn" | "error";

export interface FrontendLogRequest {
  level: FrontendLogLevel;
  message: string;
  source?: string;
}

declare global {
  export interface Window {
    api: {
      platform: string;

      // Backwards-compatible (flat) API surface (used by some legacy pages)
      runApp: (workflowId: string) => Promise<void>;

      openLogFile: () => Promise<void>;
      showItemInFolder: (fullPath: string) => Promise<void>;
      openModelDirectory: (
        target: ModelDirectory,
      ) => Promise<FileExplorerResult>;
      openModelPath: (path: string) => Promise<FileExplorerResult>;
      openExternal: (url: string) => Promise<void>;

      onCreateWorkflow: (workflow: Workflow) => Promise<void>;
      onUpdateWorkflow: (workflow: Workflow) => Promise<void>;
      onDeleteWorkflow: (workflow: Workflow) => Promise<void>;

      showPackageManager: (nodeSearch?: string) => Promise<void>;

      restartServer: () => Promise<void>;
      onServerLog: (callback: (message: string) => void) => () => void;

      restartLlamaServer: () => Promise<void>;

      getLogs: () => Promise<string[]>;
      clearLogs: () => Promise<void>;

      onMenuEvent: (callback: (data: MenuEventData) => void) => void;
      unregisterMenuEvent: (callback: (data: MenuEventData) => void) => void;

      windowControls: {
        close: () => void;
        minimize: () => void;
        maximize: () => void;
      };

      // Server lifecycle, logs, and status
      server: {
        getState: () => Promise<ServerState>;
        start: () => Promise<void>;
        restart: () => Promise<void>;
        restartLlama: () => Promise<void>;
        onStarted: (callback: () => void) => () => void;
        onLog: (callback: (message: string) => void) => () => void;
        onError: (callback: (data: { message: string }) => void) => () => void;
        onBootMessage: (callback: (message: string) => void) => () => void;
      };

      // Workflow CRUD operations
      workflows: {
        create: (workflow: Workflow) => Promise<void>;
        update: (workflow: Workflow) => Promise<void>;
        delete: (workflow: Workflow) => Promise<void>;
        run: (workflowId: string) => Promise<void>;
      };

      // Package management
      packages: {
        listAvailable: () => Promise<PackageListResponse>;
        listInstalled: () => Promise<InstalledPackageListResponse>;
        install: (repoId: string) => Promise<PackageResponse>;
        uninstall: (repoId: string) => Promise<PackageResponse>;
        update: (repoId: string) => Promise<PackageResponse>;
        searchNodes: (query: string) => Promise<PackageNode[]>;
        showManager: (nodeSearch?: string) => void;
        onUpdatesAvailable: (
          callback: (packages: PackageUpdateInfo[]) => void,
        ) => () => void;
        checkVersion: () => Promise<PackageVersionCheckResult[]>;
      };

      // Window controls
      window: {
        close: () => void;
        minimize: () => void;
        maximize: () => void;
      };

      // System integration
      system: {
        openLogFile: () => Promise<void>;
        showItemInFolder: (fullPath: string) => Promise<void>;
        openModelDirectory: (
          target: ModelDirectory,
        ) => Promise<FileExplorerResult>;
        openModelPath: (path: string) => Promise<FileExplorerResult>;
        openExternal: (url: string) => Promise<void>;
        checkOllamaInstalled: () => Promise<boolean>;
        getSystemInfo: () => Promise<SystemInfo>;
      };

      // Clipboard operations
      clipboard: {
        readText: (type?: ClipboardType) => Promise<string>;
        writeText: (text: string, type?: ClipboardType) => Promise<void>;
        readHTML: (type?: ClipboardType) => Promise<string>;
        writeHTML: (markup: string, type?: ClipboardType) => Promise<void>;
        readImage: (type?: ClipboardType) => Promise<string>;
        writeImage: (dataUrl: string, type?: ClipboardType) => Promise<void>;
        readRTF: (type?: ClipboardType) => Promise<string>;
        writeRTF: (text: string, type?: ClipboardType) => Promise<void>;
        readBookmark: () => Promise<{ title: string; url: string }>;
        writeBookmark: (
          title: string,
          url: string,
          type?: ClipboardType,
        ) => Promise<void>;
        readFindText: () => Promise<string>;
        writeFindText: (text: string) => Promise<void>;
        clear: (type?: ClipboardType) => Promise<void>;
        availableFormats: (type?: ClipboardType) => Promise<string[]>;
        readFilePaths: () => Promise<string[]>;
        readBuffer: (format: string) => Promise<string | null>;
        getContentInfo: () => Promise<ClipboardContentInfo>;
        readFileAsDataURL: (filePath: string) => Promise<string | null>;
      };

      // Log viewer
      logs: {
        getAll: () => Promise<string[]>;
        clear: () => Promise<void>;
      };

      // Renderer -> main logging bridge
      logging: {
        log: (
          level: FrontendLogLevel,
          message: string,
          source?: string,
        ) => Promise<void>;
      };

      // Installation
      installer: {
        selectLocation: () => Promise<string | null>;
        install: (
          location: string,
          packages: PythonPackages,
          modelBackend?: ModelBackend,
          installOllama?: boolean,
          installLlamaCpp?: boolean,
        ) => Promise<void>;
        onLocationPrompt: (
          callback: (data: InstallLocationData) => void,
        ) => () => void;
        onProgress: (
          callback: (data: UpdateProgressData) => void,
        ) => () => void;
      };

      // Updates
      updates: {
        onAvailable: (callback: (info: UpdateInfo) => void) => () => void;
        restartAndInstall: () => Promise<void>;
      };

      // Menu events
      menu: {
        onEvent: (callback: (data: MenuEventData) => void) => () => void;
      };

      // Shell module - Desktop integration
      shell: {
        showItemInFolder: (fullPath: string) => Promise<void>;
        openPath: (path: string) => Promise<string>;
        openExternal: (
          url: string,
          options?: {
            activate?: boolean;
            workingDirectory?: string;
            logUsage?: boolean;
          },
        ) => Promise<void>;
        trashItem: (path: string) => Promise<void>;
        beep: () => void;
        writeShortcutLink: (
          shortcutPath: string,
          operation?: "create" | "update" | "replace",
          options?: ShortcutDetails,
        ) => boolean;
        readShortcutLink: (shortcutPath: string) => ShortcutDetails;
      };

      // Generic localhost-only HTTP proxy via main process
      localhostProxy: {
        request: (
          request: LocalhostProxyRequest,
        ) => Promise<LocalhostProxyResponse>;
        wsOpen: (
          request: LocalhostProxyWsOpenRequest,
        ) => Promise<LocalhostProxyWsOpenResponse>;
        wsSend: (request: LocalhostProxyWsSendRequest) => Promise<void>;
        wsClose: (request: LocalhostProxyWsCloseRequest) => Promise<void>;
        onWsEvent: (
          callback: (data: LocalhostProxyWsEvent) => void,
        ) => () => void;
      };

      // Settings
      settings: {
        getCloseBehavior: () => Promise<WindowCloseAction>;
        setCloseBehavior: (action: WindowCloseAction) => Promise<void>;
        getSystemInfo: () => Promise<SystemInfo>;
        getAutoUpdates: () => Promise<boolean>;
        setAutoUpdates: (enabled: boolean) => Promise<void>;
        openSettings: () => Promise<void>;
      };

      // Debug operations
      debug: {
        exportBundle: (
          request: DebugBundleRequest,
        ) => Promise<DebugBundleResponse>;
      };

      // Native dialog operations
      dialog: {
        openFile: (
          options?: DialogOpenFileRequest,
        ) => Promise<DialogOpenResult>;
        openFolder: (
          options?: DialogOpenFolderRequest,
        ) => Promise<DialogOpenResult>;
      };

      // Claude Agent SDK operations
      agent: {
        createSession: (options: AgentSessionOptions) => Promise<string>;
        listModels: (
          options?: AgentModelsRequest,
        ) => Promise<AgentModelDescriptor[]>;
        sendMessage: (
          sessionId: string,
          message: string,
        ) => Promise<AgentMessage[]>;
        stopExecution: (sessionId: string) => Promise<void>;
        closeSession: (sessionId: string) => Promise<void>;
      };
    };

    // Alias exposed by preload for legacy pages.
    electronAPI: Window["api"];
  }
}

export type ServerStatus = "idle" | "starting" | "started" | "error";

export interface ServerState {
  isStarted: boolean;
  status: ServerStatus;
  bootMsg: string;
  error?: string;
  logs: string[];
  initialURL: string;
  serverPort?: number;
}

// System information for about dialog
export interface SystemInfo {
  // App information
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  // OS information
  os: string;
  osVersion: string;
  arch: string;
  // Paths
  installPath: string;
  condaEnvPath: string;
  dataPath: string;
  logsPath: string;
  // Python and package versions
  pythonVersion: string | null;
  // Feature availability
  cudaAvailable: boolean;
  cudaVersion: string | null;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
  llamaServerInstalled: boolean;
  llamaServerVersion: string | null;
}

export interface IntervalRef {
  current: NodeJS.Timeout | null;
}

export interface JSONSchema {
  type: string;
  title?: string;
  label?: string;
  description?: string;
  format?: string;
  default?: any;
  required?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  anyOf?: JSONSchema[];
  allOf?: JSONSchema[];
  oneOf?: JSONSchema[];
  not?: JSONSchema;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  definitions?: Record<string, JSONSchema>;
  $ref?: string;
}

export interface Node {
  id: string;
  type: string;
  data: Record<string, any>;
}

// Node metadata/types from package registry
export interface NodeProperty {
  name: string;
  label?: string;
  type?: any;
  default?: any;
  required?: boolean;
  description?: string;
  [key: string]: any;
}

export interface NodeOutputSlot {
  type: any;
  name: string;
  stream?: boolean;
}

export interface PackageNode {
  title: string;
  description: string;
  namespace: string;
  node_type: string;
  layout?: string;
  properties?: NodeProperty[];
  outputs?: NodeOutputSlot[];
  the_model_info?: Record<string, any>;
  recommended_models?: any[];
  basic_fields?: string[];
  is_dynamic?: boolean;
  expose_as_tool?: boolean;
  supports_dynamic_outputs?: boolean;
  // Augmented fields when fetched from registry
  package?: string; // repo_id like "owner/project"
  installed?: boolean;
}

export interface Edge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  tags: string;
  thumbnail: string;
  thumbnail_url: string;
  graph: {
    nodes: Node[];
    edges: Edge[];
  };
  input_schema: JSONSchema;
  output_schema: JSONSchema;
  settings?: {
    shortcut: string;
    run_mode: "normal" | "app" | "chat" | "headless";
  };
}

export interface MenuEventData {
  type:
    | "cut"
    | "copy"
    | "paste"
    | "selectAll"
    | "undo"
    | "redo"
    | "close"
    | "fitView";
}

export type ModelDirectory = "huggingface" | "ollama";

export type SystemDirectory = "installation" | "logs";

export interface FileExplorerResult {
  status: "success" | "error";
  path?: string;
  message?: string;
}

export interface ShortcutDetails {
  target: string;
  cwd?: string;
  args?: string;
  description?: string;
  icon?: string;
  iconIndex?: number;
  appUserModelId?: string;
  toastActivatorClsid?: string;
}

export type LocalhostProxyMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

export type LocalhostProxyResponseType = "text" | "json";

export interface LocalhostProxyRequest {
  url: string;
  method?: LocalhostProxyMethod;
  headers?: Record<string, string>;
  body?: string;
  responseType?: LocalhostProxyResponseType;
}

export interface LocalhostProxyResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
  error?: string;
}

export interface LocalhostProxyWsOpenRequest {
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
}

export interface LocalhostProxyWsOpenResponse {
  connectionId: string;
}

export interface LocalhostProxyWsSendRequest {
  connectionId: string;
  data: string;
}

export interface LocalhostProxyWsCloseRequest {
  connectionId: string;
  code?: number;
  reason?: string;
}

export interface LocalhostProxyWsEvent {
  connectionId: string;
  event: "open" | "message" | "error" | "close";
  data?: string;
  error?: string;
  code?: number;
  reason?: string;
}

// IPC Channel names as const enum for type safety
export enum IpcChannels {
  GET_SERVER_STATE = "get-server-state",
  OPEN_LOG_FILE = "open-log-file",
  SHOW_ITEM_IN_FOLDER = "show-item-in-folder",
  FILE_EXPLORER_OPEN_PATH = "file-explorer-open-path",
  FILE_EXPLORER_OPEN_DIRECTORY = "file-explorer-open-directory",
  INSTALL_TO_LOCATION = "install-to-location",
  SELECT_CUSTOM_LOCATION = "select-custom-location",
  START_SERVER = "start-server",
  RESTART_SERVER = "restart-server",
  RESTART_LLAMA_SERVER = "restart-llama-server",
  RUN_APP = "run-app",
  BOOT_MESSAGE = "boot-message",
  SERVER_STARTED = "server-started",
  SERVER_LOG = "server-log",
  SERVER_ERROR = "server-error",
  UPDATE_PROGRESS = "update-progress",
  UPDATE_AVAILABLE = "update-available",
  INSTALL_LOCATION_PROMPT = "install-location-prompt",
  SHOW_PACKAGE_MANAGER = "show-package-manager",
  INSTALL_UPDATE = "install-update",
  WINDOW_CLOSE = "window-close",
  WINDOW_MINIMIZE = "window-minimize",
  WINDOW_MAXIMIZE = "window-maximize",
  CLIPBOARD_WRITE_TEXT = "clipboard-write-text",
  CLIPBOARD_READ_TEXT = "clipboard-read-text",
  CLIPBOARD_WRITE_IMAGE = "clipboard-write-image",
  CLIPBOARD_READ_IMAGE = "clipboard-read-image",
  CLIPBOARD_READ_HTML = "clipboard-read-html",
  CLIPBOARD_WRITE_HTML = "clipboard-write-html",
  CLIPBOARD_READ_RTF = "clipboard-read-rtf",
  CLIPBOARD_WRITE_RTF = "clipboard-write-rtf",
  CLIPBOARD_READ_BOOKMARK = "clipboard-read-bookmark",
  CLIPBOARD_WRITE_BOOKMARK = "clipboard-write-bookmark",
  CLIPBOARD_READ_FIND_TEXT = "clipboard-read-find-text",
  CLIPBOARD_WRITE_FIND_TEXT = "clipboard-write-find-text",
  CLIPBOARD_CLEAR = "clipboard-clear",
  CLIPBOARD_AVAILABLE_FORMATS = "clipboard-available-formats",
  MENU_EVENT = "menu-event",
  ON_CREATE_WORKFLOW = "on-create-workflow",
  ON_UPDATE_WORKFLOW = "on-update-workflow",
  ON_DELETE_WORKFLOW = "on-delete-workflow",
  // Package manager channels
  PACKAGE_LIST_AVAILABLE = "package-list-available",
  PACKAGE_LIST_INSTALLED = "package-list-installed",
  PACKAGE_INSTALL = "package-install",
  PACKAGE_UNINSTALL = "package-uninstall",
  PACKAGE_UPDATE = "package-update",
  PACKAGE_OPEN_EXTERNAL = "package-open-external",
  PACKAGE_SEARCH_NODES = "package-search-nodes",
  PACKAGE_UPDATES_AVAILABLE = "package-updates-available",
  PACKAGE_VERSION_CHECK = "package-version-check",
  // Log viewer channels
  GET_LOGS = "get-logs",
  CLEAR_LOGS = "clear-logs",
  CHECK_OLLAMA_INSTALLED = "check-ollama-installed",
  // Shell module channels
  SHELL_SHOW_ITEM_IN_FOLDER = "shell-show-item-in-folder",
  SHELL_OPEN_PATH = "shell-open-path",
  SHELL_OPEN_EXTERNAL = "shell-open-external",
  SHELL_TRASH_ITEM = "shell-trash-item",
  SHELL_BEEP = "shell-beep",
  SHELL_WRITE_SHORTCUT_LINK = "shell-write-shortcut-link",
  SHELL_READ_SHORTCUT_LINK = "shell-read-shortcut-link",
  // Settings channels
  SETTINGS_GET_CLOSE_BEHAVIOR = "settings-get-close-behavior",
  SETTINGS_SET_CLOSE_BEHAVIOR = "settings-set-close-behavior",
  SETTINGS_GET_AUTO_UPDATES = "settings-get-auto-updates",
  SETTINGS_SET_AUTO_UPDATES = "settings-set-auto-updates",
  SHOW_SETTINGS = "show-settings",
  // System directory channels
  FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY = "file-explorer-open-system-directory",
  // System info channel
  GET_SYSTEM_INFO = "get-system-info",
  // Debug channels
  DEBUG_EXPORT_BUNDLE = "debug-export-bundle",
  // Dialog channels
  DIALOG_OPEN_FILE = "dialog-open-file",
  DIALOG_OPEN_FOLDER = "dialog-open-folder",
  CLIPBOARD_READ_FILE_PATHS = "clipboard-read-file-paths",
  CLIPBOARD_READ_BUFFER = "clipboard-read-buffer",
  CLIPBOARD_GET_CONTENT_INFO = "clipboard-get-content-info",
  FILE_READ_AS_DATA_URL = "file-read-as-data-url",
  FILE_READ_BUFFER = "file-read-buffer",
  // Claude Agent SDK channels
  AGENT_CREATE_SESSION = "agent-create-session",
  AGENT_LIST_MODELS = "agent-list-models",
  AGENT_SEND_MESSAGE = "agent-send-message",
  AGENT_STOP_EXECUTION = "agent-stop-execution",
  AGENT_CLOSE_SESSION = "agent-close-session",
  // Claude Agent SDK streaming event (sent from main to renderer)
  AGENT_STREAM_MESSAGE = "agent-stream-message",
  // Frontend tools channels
  FRONTEND_TOOLS_GET_MANIFEST = "frontend-tools-get-manifest",
  FRONTEND_TOOLS_CALL = "frontend-tools-call",
  FRONTEND_TOOLS_ABORT = "frontend-tools-abort",
  LOCALHOST_PROXY_REQUEST = "localhost-proxy-request",
  FRONTEND_TOOLS_GET_MANIFEST_REQUEST = "frontend-tools-get-manifest-request",
  FRONTEND_TOOLS_GET_MANIFEST_RESPONSE = "frontend-tools-get-manifest-response",
  FRONTEND_TOOLS_CALL_REQUEST = "frontend-tools-call-request",
  FRONTEND_TOOLS_CALL_RESPONSE = "frontend-tools-call-response",
  LOCALHOST_PROXY_WS_OPEN = "localhost-proxy-ws-open",
  LOCALHOST_PROXY_WS_SEND = "localhost-proxy-ws-send",
  LOCALHOST_PROXY_WS_CLOSE = "localhost-proxy-ws-close",
  LOCALHOST_PROXY_WS_EVENT = "localhost-proxy-ws-event",
  FRONTEND_LOG = "frontend-log",
}

export type ModelBackend = "ollama" | "llama_cpp" | "none";

export interface InstallToLocationData {
  location: string;
  packages: PythonPackages;
  modelBackend?: ModelBackend;
  // Deprecated: kept for backward compatibility if needed
  installOllama?: boolean;
  installLlamaCpp?: boolean;
}

export interface FileExplorerPathRequest {
  path: string;
}

export interface DebugBundleRequest {
  workflow_id?: string;
  graph?: Record<string, unknown>;
  errors?: string[];
  preferred_save?: "desktop" | "downloads";
}

export interface DebugBundleResponse {
  file_path: string;
  filename: string;
  message: string;
}

// Dialog types for native file/folder selection
export interface DialogFileFilter {
  name: string;
  extensions: string[];
}

export interface DialogOpenFileRequest {
  title?: string;
  defaultPath?: string;
  filters?: DialogFileFilter[];
  multiSelections?: boolean;
}

export interface DialogOpenFolderRequest {
  title?: string;
  defaultPath?: string;
  buttonLabel?: string;
}

export interface DialogOpenResult {
  canceled: boolean;
  filePaths: string[];
}

// Clipboard content info for smart paste decisions
export interface ClipboardContentInfo {
  formats: string[];
  hasImage: boolean;
  hasFiles: boolean;
  hasHtml: boolean;
  hasRtf: boolean;
  hasText: boolean;
  platform: "darwin" | "win32" | "linux";
}

// Request/Response types for each IPC channel
export interface IpcRequest {
  [IpcChannels.GET_SERVER_STATE]: void;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.SHOW_ITEM_IN_FOLDER]: string; // full path
  [IpcChannels.FILE_EXPLORER_OPEN_PATH]: FileExplorerPathRequest;
  [IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY]: ModelDirectory;
  [IpcChannels.INSTALL_TO_LOCATION]: InstallToLocationData;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: void;
  [IpcChannels.START_SERVER]: void;
  [IpcChannels.RESTART_SERVER]: void;
  [IpcChannels.RESTART_LLAMA_SERVER]: void;
  [IpcChannels.RUN_APP]: string;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: string | undefined;
  [IpcChannels.INSTALL_UPDATE]: void;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: { text: string; type?: ClipboardType };
  [IpcChannels.CLIPBOARD_READ_TEXT]: ClipboardType | undefined;
  [IpcChannels.CLIPBOARD_WRITE_IMAGE]: {
    dataUrl: string;
    type?: ClipboardType;
  };
  [IpcChannels.CLIPBOARD_READ_IMAGE]: ClipboardType | undefined;
  [IpcChannels.CLIPBOARD_READ_HTML]: ClipboardType | undefined;
  [IpcChannels.CLIPBOARD_WRITE_HTML]: { markup: string; type?: ClipboardType };
  [IpcChannels.CLIPBOARD_READ_RTF]: ClipboardType | undefined;
  [IpcChannels.CLIPBOARD_WRITE_RTF]: { text: string; type?: ClipboardType };
  [IpcChannels.CLIPBOARD_READ_BOOKMARK]: void;
  [IpcChannels.CLIPBOARD_WRITE_BOOKMARK]: {
    title: string;
    url: string;
    type?: ClipboardType;
  };
  [IpcChannels.CLIPBOARD_READ_FIND_TEXT]: void;
  [IpcChannels.CLIPBOARD_WRITE_FIND_TEXT]: string;
  [IpcChannels.CLIPBOARD_CLEAR]: ClipboardType | undefined;
  [IpcChannels.CLIPBOARD_AVAILABLE_FORMATS]: ClipboardType | undefined;
  [IpcChannels.ON_CREATE_WORKFLOW]: Workflow;
  [IpcChannels.ON_UPDATE_WORKFLOW]: Workflow;
  [IpcChannels.ON_DELETE_WORKFLOW]: Workflow;
  // Package manager
  [IpcChannels.PACKAGE_LIST_AVAILABLE]: void;
  [IpcChannels.PACKAGE_LIST_INSTALLED]: void;
  [IpcChannels.PACKAGE_INSTALL]: PackageInstallRequest;
  [IpcChannels.PACKAGE_UNINSTALL]: PackageUninstallRequest;
  [IpcChannels.PACKAGE_UPDATE]: string; // repo_id
  [IpcChannels.PACKAGE_OPEN_EXTERNAL]: string; // url
  [IpcChannels.PACKAGE_SEARCH_NODES]: string; // query
  [IpcChannels.PACKAGE_VERSION_CHECK]: void;
  // Log viewer
  [IpcChannels.GET_LOGS]: void;
  [IpcChannels.CLEAR_LOGS]: void;
  [IpcChannels.CHECK_OLLAMA_INSTALLED]: void;
  // Shell module
  [IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER]: string; // fullPath
  [IpcChannels.SHELL_OPEN_PATH]: string; // path
  [IpcChannels.SHELL_OPEN_EXTERNAL]: {
    url: string;
    options?: {
      activate?: boolean;
      workingDirectory?: string;
      logUsage?: boolean;
    };
  };
  [IpcChannels.SHELL_TRASH_ITEM]: string; // path
  [IpcChannels.SHELL_BEEP]: void;
  [IpcChannels.SHELL_WRITE_SHORTCUT_LINK]: {
    shortcutPath: string;
    operation?: "create" | "update" | "replace";
    options?: ShortcutDetails;
  };
  [IpcChannels.SHELL_READ_SHORTCUT_LINK]: string; // shortcutPath
  // Settings
  [IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR]: void;
  [IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR]: WindowCloseAction;
  [IpcChannels.SETTINGS_GET_AUTO_UPDATES]: void;
  [IpcChannels.SETTINGS_SET_AUTO_UPDATES]: boolean;
  [IpcChannels.SHOW_SETTINGS]: void;
  // System directory
  [IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY]: SystemDirectory;
  // System info
  [IpcChannels.GET_SYSTEM_INFO]: void;
  // Debug
  [IpcChannels.DEBUG_EXPORT_BUNDLE]: DebugBundleRequest;
  // Dialog
  [IpcChannels.DIALOG_OPEN_FILE]: DialogOpenFileRequest;
  [IpcChannels.DIALOG_OPEN_FOLDER]: DialogOpenFolderRequest;
  [IpcChannels.CLIPBOARD_READ_FILE_PATHS]: void;
  [IpcChannels.CLIPBOARD_READ_BUFFER]: string; // format name
  [IpcChannels.CLIPBOARD_GET_CONTENT_INFO]: void;
  [IpcChannels.FILE_READ_AS_DATA_URL]: string; // filePath
  [IpcChannels.FILE_READ_BUFFER]: string; // filePath
  // Claude Agent SDK
  [IpcChannels.AGENT_CREATE_SESSION]: AgentSessionOptions;
  [IpcChannels.AGENT_LIST_MODELS]: AgentModelsRequest;
  [IpcChannels.AGENT_SEND_MESSAGE]: AgentSendRequest;
  [IpcChannels.AGENT_STOP_EXECUTION]: string; // sessionId
  [IpcChannels.AGENT_CLOSE_SESSION]: string; // sessionId
  // Frontend tools
  [IpcChannels.FRONTEND_TOOLS_GET_MANIFEST]: FrontendToolsGetManifestRequest;
  [IpcChannels.FRONTEND_TOOLS_CALL]: FrontendToolsCallRequest;
  [IpcChannels.FRONTEND_TOOLS_ABORT]: string; // sessionId
  [IpcChannels.LOCALHOST_PROXY_REQUEST]: LocalhostProxyRequest;
  [IpcChannels.LOCALHOST_PROXY_WS_OPEN]: LocalhostProxyWsOpenRequest;
  [IpcChannels.LOCALHOST_PROXY_WS_SEND]: LocalhostProxyWsSendRequest;
  [IpcChannels.LOCALHOST_PROXY_WS_CLOSE]: LocalhostProxyWsCloseRequest;
  [IpcChannels.FRONTEND_LOG]: FrontendLogRequest;
}

export type WindowCloseAction = "ask" | "quit" | "background";

export interface IpcResponse {
  [IpcChannels.GET_SERVER_STATE]: ServerState;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.SHOW_ITEM_IN_FOLDER]: void;
  [IpcChannels.FILE_EXPLORER_OPEN_PATH]: FileExplorerResult;
  [IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY]: FileExplorerResult;
  [IpcChannels.INSTALL_TO_LOCATION]: void;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: string | null;
  [IpcChannels.START_SERVER]: void;
  [IpcChannels.RESTART_SERVER]: void;
  [IpcChannels.RESTART_LLAMA_SERVER]: void;
  [IpcChannels.RUN_APP]: void;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: void;
  [IpcChannels.INSTALL_UPDATE]: void;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: void;
  [IpcChannels.CLIPBOARD_READ_TEXT]: string;
  [IpcChannels.CLIPBOARD_WRITE_IMAGE]: void;
  [IpcChannels.CLIPBOARD_READ_IMAGE]: string; // data URL
  [IpcChannels.CLIPBOARD_READ_HTML]: string;
  [IpcChannels.CLIPBOARD_WRITE_HTML]: void;
  [IpcChannels.CLIPBOARD_READ_RTF]: string;
  [IpcChannels.CLIPBOARD_WRITE_RTF]: void;
  [IpcChannels.CLIPBOARD_READ_BOOKMARK]: { title: string; url: string };
  [IpcChannels.CLIPBOARD_WRITE_BOOKMARK]: void;
  [IpcChannels.CLIPBOARD_READ_FIND_TEXT]: string;
  [IpcChannels.CLIPBOARD_WRITE_FIND_TEXT]: void;
  [IpcChannels.CLIPBOARD_CLEAR]: void;
  [IpcChannels.CLIPBOARD_AVAILABLE_FORMATS]: string[];
  [IpcChannels.ON_CREATE_WORKFLOW]: void;
  [IpcChannels.ON_UPDATE_WORKFLOW]: void;
  [IpcChannels.ON_DELETE_WORKFLOW]: void;
  // Package manager
  [IpcChannels.PACKAGE_LIST_AVAILABLE]: PackageListResponse;
  [IpcChannels.PACKAGE_LIST_INSTALLED]: InstalledPackageListResponse;
  [IpcChannels.PACKAGE_INSTALL]: PackageResponse;
  [IpcChannels.PACKAGE_UNINSTALL]: PackageResponse;
  [IpcChannels.PACKAGE_UPDATE]: PackageResponse;
  [IpcChannels.PACKAGE_OPEN_EXTERNAL]: void;
  [IpcChannels.PACKAGE_SEARCH_NODES]: PackageNode[];
  [IpcChannels.PACKAGE_VERSION_CHECK]: PackageVersionCheckResult[];
  // Log viewer
  [IpcChannels.GET_LOGS]: string[];
  [IpcChannels.CLEAR_LOGS]: void;
  [IpcChannels.CHECK_OLLAMA_INSTALLED]: boolean;
  // Shell module
  [IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER]: void;
  [IpcChannels.SHELL_OPEN_PATH]: string; // error message or empty string
  [IpcChannels.SHELL_OPEN_EXTERNAL]: void;
  [IpcChannels.SHELL_TRASH_ITEM]: void;
  [IpcChannels.SHELL_BEEP]: void;
  [IpcChannels.SHELL_WRITE_SHORTCUT_LINK]: boolean;
  [IpcChannels.SHELL_READ_SHORTCUT_LINK]: ShortcutDetails;
  // Settings
  [IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR]: WindowCloseAction;
  [IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR]: void;
  [IpcChannels.SETTINGS_GET_AUTO_UPDATES]: boolean;
  [IpcChannels.SETTINGS_SET_AUTO_UPDATES]: void;
  [IpcChannels.SHOW_SETTINGS]: void;
  // System directory
  [IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY]: FileExplorerResult;
  // System info
  [IpcChannels.GET_SYSTEM_INFO]: SystemInfo;
  // Debug
  [IpcChannels.DEBUG_EXPORT_BUNDLE]: DebugBundleResponse;
  // Dialog
  [IpcChannels.DIALOG_OPEN_FILE]: DialogOpenResult;
  [IpcChannels.DIALOG_OPEN_FOLDER]: DialogOpenResult;
  [IpcChannels.CLIPBOARD_READ_FILE_PATHS]: string[];
  [IpcChannels.CLIPBOARD_READ_BUFFER]: string | null; // base64 encoded buffer
  [IpcChannels.CLIPBOARD_GET_CONTENT_INFO]: ClipboardContentInfo;
  [IpcChannels.FILE_READ_AS_DATA_URL]: string | null;
  [IpcChannels.FILE_READ_BUFFER]: { buffer: Buffer; mimeType: string } | null;
  // Claude Agent SDK
  [IpcChannels.AGENT_CREATE_SESSION]: string; // sessionId
  [IpcChannels.AGENT_LIST_MODELS]: AgentModelDescriptor[];
  [IpcChannels.AGENT_SEND_MESSAGE]: AgentMessage[];
  [IpcChannels.AGENT_STOP_EXECUTION]: void;
  [IpcChannels.AGENT_CLOSE_SESSION]: void;
  // Frontend tools
  [IpcChannels.FRONTEND_TOOLS_GET_MANIFEST]: FrontendToolManifest[];
  [IpcChannels.FRONTEND_TOOLS_CALL]: FrontendToolsCallResponse;
  [IpcChannels.FRONTEND_TOOLS_ABORT]: void;
  [IpcChannels.LOCALHOST_PROXY_REQUEST]: LocalhostProxyResponse;
  [IpcChannels.LOCALHOST_PROXY_WS_OPEN]: LocalhostProxyWsOpenResponse;
  [IpcChannels.LOCALHOST_PROXY_WS_SEND]: void;
  [IpcChannels.LOCALHOST_PROXY_WS_CLOSE]: void;
  [IpcChannels.FRONTEND_LOG]: void;
}

// Event types for each IPC channel
export interface IpcEvents {
  [IpcChannels.BOOT_MESSAGE]: string;
  [IpcChannels.SERVER_LOG]: string;
  [IpcChannels.SERVER_STARTED]: void;
  [IpcChannels.SERVER_ERROR]: { message: string };
  [IpcChannels.UPDATE_PROGRESS]: UpdateProgressData;
  [IpcChannels.UPDATE_AVAILABLE]: UpdateInfo;
  [IpcChannels.INSTALL_LOCATION_PROMPT]: InstallLocationData;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: void;
  [IpcChannels.MENU_EVENT]: MenuEventData;
  [IpcChannels.PACKAGE_UPDATES_AVAILABLE]: PackageUpdateInfo[];
  // Claude Agent streaming events
  [IpcChannels.AGENT_STREAM_MESSAGE]: AgentStreamEvent;
  // Frontend tools events
  [IpcChannels.FRONTEND_TOOLS_ABORT]: { sessionId: string };
  [IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_REQUEST]: FrontendToolsManifestRequestEvent;
  [IpcChannels.FRONTEND_TOOLS_GET_MANIFEST_RESPONSE]: FrontendToolsManifestResponseEvent;
  [IpcChannels.FRONTEND_TOOLS_CALL_REQUEST]: FrontendToolsCallRequestEvent;
  [IpcChannels.FRONTEND_TOOLS_CALL_RESPONSE]: FrontendToolsCallResponseEvent;
  [IpcChannels.LOCALHOST_PROXY_WS_EVENT]: LocalhostProxyWsEvent;
}

export type PythonPackages = string[];

export interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

export interface UpdateInfo {
  version: string;
  releaseUrl: string;
  downloaded?: boolean;
}

export interface InstallLocationData {
  defaultPath: string;
  downloadSize?: string;
  installedSize?: string;
  packages?: string[];
}

// Package-related types
export interface PackageInfo {
  name: string;
  description: string;
  repo_id: string;
  namespaces?: string[];
  version?: string;
}

export interface PackageModel {
  name: string;
  description: string;
  version: string;
  authors: string[];
  repo_id: string;
  nodes?: PackageNode[];
  examples?: any[];
  assets?: any[];
  source_folder?: string;
  // Upgrade availability info
  latestVersion?: string;
  hasUpdate?: boolean;
}

export interface PackageListResponse {
  packages: PackageInfo[];
  count: number;
}

export interface PackageUpdateInfo {
  name: string;
  repo_id: string;
  installedVersion: string;
  latestVersion: string;
}

export interface PackageVersionCheckResult {
  packageName: string;
  currentVersion?: string;
  expectedVersion: string | null;
}

export interface InstalledPackageListResponse {
  packages: PackageModel[];
  count: number;
}

export interface PackageResponse {
  success: boolean;
  message: string;
}

export interface PackageInstallRequest {
  repo_id: string;
}

export interface PackageUninstallRequest {
  repo_id: string;
}

// Claude Agent SDK types
export interface AgentSessionOptions {
  provider?: AgentProvider;
  model: string;
  workspacePath?: string;
  resumeSessionId?: string;
}

export type AgentProvider = "claude" | "codex";

export interface AgentModelDescriptor {
  id: string;
  label: string;
  isDefault?: boolean;
}

export interface AgentModelsRequest {
  provider?: AgentProvider;
  workspacePath?: string;
}

export interface AgentSendRequest {
  sessionId: string;
  message: string;
}

// Frontend tools types
export interface FrontendToolManifest {
  name: string;
  description: string;
  parameters: JsonSchema;
}

export interface FrontendToolsGetManifestRequest {
  sessionId: string;
}

export interface FrontendToolsCallRequest {
  sessionId: string;
  toolCallId: string;
  name: string;
  args: unknown;
}

export interface FrontendToolsCallResponse {
  result: unknown;
  isError: boolean;
  error?: string;
}

export interface FrontendToolsManifestRequestEvent {
  requestId: string;
  sessionId: string;
}

export interface FrontendToolsManifestResponseEvent {
  requestId: string;
  sessionId: string;
  manifest?: FrontendToolManifest[];
  error?: string;
}

export interface FrontendToolsCallRequestEvent {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  name: string;
  args: unknown;
}

export interface FrontendToolsCallResponseEvent {
  requestId: string;
  sessionId: string;
  result?: FrontendToolsCallResponse;
  error?: string;
}

/**
 * Serializable representation of an SDK message for IPC transport.
 * Only includes the fields needed for display in the ChatView.
 */
export interface AgentMessage {
  type: "assistant" | "user" | "result" | "system" | "status" | "stream_event";
  uuid: string;
  session_id: string;
  /** Text content for assistant and result messages */
  text?: string;
  /** Error flag for result messages */
  is_error?: boolean;
  /** Error messages for error results */
  errors?: string[];
  /** Result subtype */
  subtype?: string;
  /** Original message content blocks (for assistant messages) */
  content?: Array<{ type: string; text?: string }>;
  /** Tool calls in OpenAI-style format for NodeTool UI compatibility */
  tool_calls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

declare module "*.png" {
  const value: string;
  export default value;
}

// Claude Agent streaming event payload
export interface AgentStreamEvent {
  sessionId: string;
  message: AgentMessage;
  done: boolean; // true when the stream is complete
}
