declare global {
  export interface Window {
    api: {
      getServerState: () => Promise<ServerState>;
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
      onServerStarted: (callback: () => void) => void;
      onBootMessage: (callback: (message: string) => void) => void;
      onServerLog: (callback: (message: string) => void) => void;
      onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void;
      onInstallLocationPrompt: (
        callback: (data: { defaultPath: string }) => void
      ) => void;
      selectDefaultInstallLocation: (modules: {
        ai: boolean;
        dataScience: boolean;
      }) => Promise<void>;
      selectCustomInstallLocation: (modules: {
        ai: boolean;
        dataScience: boolean;
      }) => Promise<void>;
      windowControls: {
        close: () => void;
        minimize: () => void;
        maximize: () => void;
      };
    };
  }
}

export interface ServerState {
  isStarted: boolean;
  bootMsg: string;
  logs: string[];
  initialURL: string;
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
    hide_ui: boolean;
    receive_clipboard: boolean;
    write_clipboard: boolean;
    shortcut: string;
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

export interface WebSocketUpdate {
  type: "delete_workflow" | "update_workflow" | "create_workflow";
  workflow: Workflow;
}
// IPC Channel names as const enum for type safety
export enum IpcChannels {
  GET_SERVER_STATE = "get-server-state",
  OPEN_LOG_FILE = "open-log-file",
  SELECT_DEFAULT_LOCATION = "select-default-location",
  SELECT_CUSTOM_LOCATION = "select-custom-location",
  RUN_APP = "run-app",
  BOOT_MESSAGE = "boot-message",
  SERVER_STARTED = "server-started",
  SERVER_LOG = "server-log",
  UPDATE_PROGRESS = "update-progress",
  UPDATE_AVAILABLE = "update-available",
  INSTALL_LOCATION_PROMPT = "install-location-prompt",
  INSTALL_UPDATE = "install-update",
  WINDOW_CLOSE = "window-close",
  WINDOW_MINIMIZE = "window-minimize",
  WINDOW_MAXIMIZE = "window-maximize",
  SAVE_FILE = "save-file",
  CLIPBOARD_WRITE_TEXT = "clipboard-write-text",
  CLIPBOARD_READ_TEXT = "clipboard-read-text",
  MENU_EVENT = "menu-event",
}

// Request/Response types for each IPC channel
export interface IpcRequest {
  [IpcChannels.GET_SERVER_STATE]: void;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.SELECT_DEFAULT_LOCATION]: PythonPackages;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: PythonPackages;
  [IpcChannels.RUN_APP]: string;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.SAVE_FILE]: SaveFileOptions;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: string;
  [IpcChannels.CLIPBOARD_READ_TEXT]: void;
}

export interface IpcResponse {
  [IpcChannels.GET_SERVER_STATE]: ServerState;
  [IpcChannels.OPEN_LOG_FILE]: void;
  [IpcChannels.SELECT_DEFAULT_LOCATION]: void;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: void;
  [IpcChannels.RUN_APP]: void;
  [IpcChannels.WINDOW_CLOSE]: void;
  [IpcChannels.WINDOW_MINIMIZE]: void;
  [IpcChannels.WINDOW_MAXIMIZE]: void;
  [IpcChannels.SAVE_FILE]: SaveFileResult;
  [IpcChannels.CLIPBOARD_WRITE_TEXT]: void;
  [IpcChannels.CLIPBOARD_READ_TEXT]: string;
}

// Event types for each IPC channel
export interface IpcEvents {
  [IpcChannels.BOOT_MESSAGE]: string;
  [IpcChannels.SERVER_LOG]: string;
  [IpcChannels.SERVER_STARTED]: void;
  [IpcChannels.UPDATE_PROGRESS]: UpdateProgressData;
  [IpcChannels.UPDATE_AVAILABLE]: UpdateInfo;
  [IpcChannels.INSTALL_LOCATION_PROMPT]: InstallLocationData;
  [IpcChannels.SELECT_INSTALL_LOCATION]: PythonPackages;
  [IpcChannels.SELECT_CUSTOM_LOCATION]: PythonPackages;
  [IpcChannels.MENU_EVENT]: MenuEventData;
}

export interface PythonPackages {
  ai: boolean;
  data_science: boolean;
}

export interface UpdateProgressData {
  componentName: string;
  progress: number;
  action: string;
  eta?: string;
}

export interface InstallLocationData {
  defaultPath: string;
  downloadSize: string;
  installedSize: string;
}

export interface SaveFileOptions {
  buffer: Uint8Array;
  defaultPath: string;
  filters?: { name: string; extensions: string[] }[];
}

export interface SaveFileResult {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
}
