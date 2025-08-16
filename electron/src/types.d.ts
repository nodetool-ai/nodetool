declare global {
  export interface Window {
    api: {
      platform: string;
      getServerState: () => Promise<ServerState>;
      getSystemInfo: () => Promise<BasicSystemInfo | null>;
      clipboardWriteText: (text: string) => void;
      clipboardReadText: () => string;
      openLogFile: () => Promise<void>;
      openExternal: (url: string) => void;
      onUpdateProgress: (
        callback: (data: {
          componentName: string;
          progress: number;
          action: string;
          eta?: string;
        }) => void
      ) => void;
      onCreateWorkflow: (workflow: Workflow) => void;
      onUpdateWorkflow: (workflow: Workflow) => void;
      onDeleteWorkflow: (workflow: Workflow) => void;
      onServerStarted: (callback: () => void) => void;
      onBootMessage: (callback: (message: string) => void) => void;
      onServerLog: (callback: (message: string) => void) => void;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
      onInstallLocationPrompt: (
        callback: (data: { defaultPath: string }) => void
      ) => void;
      onShowPackageManager: (callback: () => void) => void;
      onMenuEvent: (callback: (data: MenuEventData) => void) => void;
      unregisterMenuEvent: (callback: (data: any) => void) => void;
      startServer: () => Promise<void>;
      restartServer: () => Promise<void>;
      showPackageManager: () => void;
      installToLocation: (
        location: string,
        packages: PythonPackages
      ) => Promise<void>;
      selectCustomInstallLocation: () => Promise<string | null>;
      windowControls: {
        close: () => void;
        minimize: () => void;
        maximize: () => void;
      };
      removeListener: (event: string) => void;
    };
    electronAPI: {
      packages: {
        listAvailable: () => Promise<PackageListResponse>;
        listInstalled: () => Promise<InstalledPackageListResponse>;
        install: (repoId: string) => Promise<PackageResponse>;
        uninstall: (repoId: string) => Promise<PackageResponse>;
      };
      openExternal: (url: string) => void;
    };
  }
}

export interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  logs: string[];
  initialURL: string;
  serverPort?: number;
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

// IPC Channel names as const enum for type safety
export enum IpcChannels {
  GET_SERVER_STATE = "get-server-state",
  GET_SYSTEM_INFO = "get-system-info",
  OPEN_LOG_FILE = "open-log-file",
  INSTALL_TO_LOCATION = "install-to-location",
  SELECT_CUSTOM_LOCATION = "select-custom-location",
  START_SERVER = "start-server",
  RESTART_SERVER = "restart-server",
  RUN_APP = "run-app",
  BOOT_MESSAGE = "boot-message",
  SERVER_STARTED = "server-started",
  SERVER_LOG = "server-log",
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
}

export interface InstallToLocationData {
  location: string;
  packages: PythonPackages;
}

// Request/Response types for each IPC channel
export interface IpcRequest {
  [IpcChannels.GET_SERVER_STATE]: void;
  [IpcChannels.GET_SYSTEM_INFO]: void;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.INSTALL_TO_LOCATION]: InstallToLocationData;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: void;
  [IpcChannels.START_SERVER]: void;
  [IpcChannels.RESTART_SERVER]: void;
  [IpcChannels.RUN_APP]: string;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: void;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: string;
  [IpcChannels.CLIPBOARD_READ_TEXT]: void;
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
}

export interface IpcResponse {
  [IpcChannels.GET_SERVER_STATE]: ServerState;
  [IpcChannels.GET_SYSTEM_INFO]: BasicSystemInfo | null;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.INSTALL_TO_LOCATION]: void;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: string | null;
  [IpcChannels.START_SERVER]: void;
  [IpcChannels.RESTART_SERVER]: void;
  [IpcChannels.RUN_APP]: void;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: void;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: void;
  [IpcChannels.CLIPBOARD_READ_TEXT]: string;
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
}

// Event types for each IPC channel
export interface IpcEvents {
  [IpcChannels.BOOT_MESSAGE]: string;
  [IpcChannels.SERVER_LOG]: string;
  [IpcChannels.SERVER_STARTED]: void;
  [IpcChannels.UPDATE_PROGRESS]: UpdateProgressData;
  [IpcChannels.UPDATE_AVAILABLE]: UpdateInfo;
  [IpcChannels.INSTALL_LOCATION_PROMPT]: InstallLocationData;
  [IpcChannels.SHOW_PACKAGE_MANAGER]: void;
  [IpcChannels.MENU_EVENT]: MenuEventData;
}

export type PythonPackages = string[];

export interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

export interface UpdateInfo {
  releaseUrl: string;
}

export interface BasicSystemInfo {
  os: {
    platform: string;
    release: string;
    arch: string;
  };
  versions: {
    python?: string;
    nodetool_core?: string;
    nodetool_base?: string;
    cuda?: string;
  };
  paths: {
    data_dir: string;
    core_logs_dir: string;
    electron_logs_dir: string;
  };
  server: {
    status: "connected" | "disconnected" | "checking";
    port?: number;
  };
}

export interface InstallLocationData {
  defaultPath: string;
  downloadSize?: string;
  installedSize?: string;
}

// Package-related types
export interface PackageInfo {
  name: string;
  description: string;
  repo_id: string;
  namespaces?: string[];
}

export interface PackageModel {
  name: string;
  description: string;
  version: string;
  authors: string[];
  repo_id: string;
  nodes?: any[];
  examples?: any[];
  assets?: any[];
  source_folder?: string;
}

export interface PackageListResponse {
  packages: PackageInfo[];
  count: number;
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
