import type { Workflow } from "./stores/ApiTypes";

interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

type ModelDirectory = "huggingface" | "ollama";

type SystemDirectory = "installation" | "logs";
type FrontendLogLevel = "info" | "warn" | "error";

// System information for about dialog
interface SystemInfo {
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

interface FileExplorerResult {
  status: "success" | "error";
  path?: string;
  message?: string;
}

type LocalhostProxyMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS";

interface LocalhostProxyRequest {
  url: string;
  method?: LocalhostProxyMethod;
  headers?: Record<string, string>;
  body?: string;
  responseType?: "text" | "json";
}

interface LocalhostProxyResponse {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  data: unknown;
}

interface LocalhostProxyWsOpenRequest {
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
}

interface LocalhostProxyWsOpenResponse {
  connectionId: string;
}

interface LocalhostProxyWsSendRequest {
  connectionId: string;
  data: string;
}

interface LocalhostProxyWsCloseRequest {
  connectionId: string;
  code?: number;
  reason?: string;
}

interface LocalhostProxyWsEvent {
  connectionId: string;
  event: "open" | "message" | "error" | "close";
  data?: string;
  error?: string;
  code?: number;
  reason?: string;
}

export type MenuEventType =
  | "saveWorkflow"
  | "newTab"
  | "close"
  | "closeTab"
  | "cut"
  | "copy"
  | "paste"
  | "selectAll"
  | "undo"
  | "redo"
  | "duplicate"
  | "duplicateVertical"
  | "group"
  | "align"
  | "alignWithSpacing"
  | "fitView"
  | "resetZoom"
  | "zoomIn"
  | "zoomOut"
  | "prevTab"
  | "nextTab"
  | "switchToTab";

export interface MenuEventData {
  type: MenuEventType;
  index?: number;
  [key: string]: unknown;
}

// Clipboard content info for smart paste decisions
interface ClipboardContentInfo {
  formats: string[];
  hasImage: boolean;
  hasFiles: boolean;
  hasHtml: boolean;
  hasRtf: boolean;
  hasText: boolean;
  platform: "darwin" | "win32" | "linux";
}

declare global {
  interface Window {
    api: {
      runApp: (workflowId: string) => Promise<void>;

      // Clipboard operations (new API)
      clipboard?: {
        readText: (type?: "clipboard" | "selection") => Promise<string>;
        writeText: (
          text: string,
          type?: "clipboard" | "selection"
        ) => Promise<void>;
        readHTML: (type?: "clipboard" | "selection") => Promise<string>;
        writeHTML: (
          markup: string,
          type?: "clipboard" | "selection"
        ) => Promise<void>;
        readImage: (type?: "clipboard" | "selection") => Promise<string>;
        writeImage: (
          dataUrl: string,
          type?: "clipboard" | "selection"
        ) => Promise<void>;
        readRTF: (type?: "clipboard" | "selection") => Promise<string>;
        writeRTF: (
          text: string,
          type?: "clipboard" | "selection"
        ) => Promise<void>;
        readBookmark: () => Promise<{ title: string; url: string }>;
        writeBookmark: (
          title: string,
          url: string,
          type?: "clipboard" | "selection"
        ) => Promise<void>;
        readFindText: () => Promise<string>;
        writeFindText: (text: string) => Promise<void>;
        clear: (type?: "clipboard" | "selection") => Promise<void>;
        availableFormats: (
          type?: "clipboard" | "selection"
        ) => Promise<string[]>;
        /** Read file paths from clipboard (cross-platform: macOS, Windows, Linux) */
        readFilePaths: () => Promise<string[]>;
        /** Read raw buffer data from clipboard for a specific format (returns base64) */
        readBuffer: (format: string) => Promise<string | null>;
        /** Get comprehensive clipboard content info for smart paste decisions */
        getContentInfo: () => Promise<ClipboardContentInfo>;
        readFileAsDataURL: (filePath: string) => Promise<string | null>;
        /** Read file content as buffer */
        readFileBuffer: (filePath: string) => Promise<{ buffer: Uint8Array; mimeType: string } | null>;
      };
      openLogFile: () => Promise<void>;
      showItemInFolder: (fullPath: string) => Promise<void>;
      openModelDirectory?: (
        target: ModelDirectory
      ) => Promise<FileExplorerResult | void>;
      openModelPath?: (path: string) => Promise<FileExplorerResult | void>;
      openSystemDirectory?: (
        target: SystemDirectory
      ) => Promise<FileExplorerResult | void>;
      onMenuEvent: (callback: (data: MenuEventData) => void) => void;
      unregisterMenuEvent: (callback: (data: MenuEventData) => void) => void;
      onCreateWorkflow: (workflow: Workflow) => Promise<void>;
      onUpdateWorkflow: (workflow: Workflow) => Promise<void>;
      onDeleteWorkflow: (workflow: Workflow) => Promise<void>;
      showPackageManager: (nodeSearch?: string) => Promise<void>;
      restartLlamaServer?: () => Promise<void>;
      windowControls: WindowControls;
      platform: string;
      logging?: {
        log: (
          level: FrontendLogLevel,
          message: string,
          source?: string
        ) => Promise<void>;
      };

      // Shell module - Desktop integration
      shell?: {
        showItemInFolder: (fullPath: string) => Promise<void>;
        openPath: (path: string) => Promise<string>;
        openExternal: (
          url: string,
          options?: {
            activate?: boolean;
            workingDirectory?: string;
            logUsage?: boolean;
          }
        ) => Promise<void>;
        trashItem: (path: string) => Promise<void>;
        beep: () => Promise<void>;
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
          }
        ) => Promise<boolean>;
        readShortcutLink: (shortcutPath: string) => Promise<{
          target: string;
          cwd?: string;
          args?: string;
          description?: string;
          icon?: string;
          iconIndex?: number;
          appUserModelId?: string;
          toastActivatorClsid?: string;
        }>;
      };

      localhostProxy?: {
        request: (
          request: LocalhostProxyRequest
        ) => Promise<LocalhostProxyResponse>;
        wsOpen: (
          request: LocalhostProxyWsOpenRequest
        ) => Promise<LocalhostProxyWsOpenResponse>;
        wsSend: (request: LocalhostProxyWsSendRequest) => Promise<void>;
        wsClose: (request: LocalhostProxyWsCloseRequest) => Promise<void>;
        onWsEvent: (
          callback: (event: LocalhostProxyWsEvent) => void
        ) => () => void;
      };

      // Settings module - Application settings (Windows only)
      settings?: {
        getCloseBehavior: () => Promise<"ask" | "quit" | "background">;
        setCloseBehavior: (
          action: "ask" | "quit" | "background"
        ) => Promise<void>;
        getSystemInfo: () => Promise<SystemInfo>;
      };

      // Debug module - Debug bundle export
      debug?: {
        exportBundle: (request: {
          workflow_id?: string;
          graph?: Record<string, unknown>;
          errors?: string[];
          preferred_save?: "desktop" | "downloads";
        }) => Promise<{
          file_path: string;
          filename: string;
          message: string;
        }>;
      };

      // Dialog module - Native file/folder dialogs
      dialog?: {
        openFile: (options?: {
          title?: string;
          defaultPath?: string;
          filters?: { name: string; extensions: string[] }[];
          multiSelections?: boolean;
        }) => Promise<{ canceled: boolean; filePaths: string[] }>;
        openFolder: (options?: {
          title?: string;
          defaultPath?: string;
          buttonLabel?: string;
        }) => Promise<{ canceled: boolean; filePaths: string[] }>;
      };

      // Claude Agent SDK operations (available in Electron only)
      agent?: {
        createSession: (options: {
          provider?: "claude" | "codex";
          model: string;
          workspacePath?: string;
          resumeSessionId?: string;
        }) => Promise<string>;
        listModels: (options?: {
          provider?: "claude" | "codex";
          workspacePath?: string;
        }) => Promise<Array<{
          id: string;
          label: string;
          isDefault?: boolean;
        }>>;
        sendMessage: (
          sessionId: string,
          message: string
        ) => Promise<
          Array<{
            type: string;
            uuid: string;
            session_id: string;
            text?: string;
            is_error?: boolean;
            errors?: string[];
            subtype?: string;
            content?: Array<{ type: string; text?: string }>;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: {
                name: string;
                arguments: string;
              };
            }>;
          }>
        >;
        stopExecution: (sessionId: string) => Promise<void>;
        closeSession: (sessionId: string) => Promise<void>;
        /** Subscribe to streaming messages from the Claude Agent */
        onStreamMessage: (
          callback: (event: {
            sessionId: string;
            message: {
              type: string;
              uuid: string;
              session_id: string;
              text?: string;
              is_error?: boolean;
              errors?: string[];
              subtype?: string;
              content?: Array<{ type: string; text?: string }>;
              tool_calls?: Array<{
                id: string;
                type: string;
                function: {
                  name: string;
                  arguments: string;
                };
              }>;
            };
            done: boolean;
          }) => void
        ) => () => void;
      };

      // Frontend tools for Claude Agent integration (available in Electron only)
      frontendTools?: {
        /** Get the manifest of available frontend tools */
        getManifest: (sessionId: string) => Promise<
          Array<{
            name: string;
            description: string;
            parameters: Record<string, unknown>;
          }>
        >;
        /** Call a frontend tool and return its result */
        call: (
          sessionId: string,
          toolCallId: string,
          name: string,
          args: unknown
        ) => Promise<{ result: unknown; isError: boolean; error?: string }>;
        /** Subscribe to tool abort events */
        onAbort: (callback: (data: { sessionId: string }) => void) => () => void;
      };

      // Low-level IPC methods for registering handlers (available in Electron only)
      ipc?: {
        /** Invoke a main-process IPC handler */
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
        /** Send an event to the main process */
        send: (channel: string, ...args: unknown[]) => void;
        /** Register a listener for IPC send events from the main process */
        on: (
          channel: string,
          listener: (event: unknown, ...args: unknown[]) => void,
        ) => void;
        /** Remove a listener for IPC send events */
        off: (channel: string, listener: (...args: unknown[]) => void) => void;
      };
    };
    process: {
      type: string;
      platform: string;
      versions: {
        node: string;
        electron: string;
        chrome: string;
      };
    };
    electron?: {
      on: (channel: string, listener: (...args: unknown[]) => void) => void;
      off: (channel: string, listener: (...args: unknown[]) => void) => void;
    };
    __UPDATES__?: Record<string, unknown>[];
  }
}

export {};
