import type { Workflow } from "./stores/ApiTypes";

interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

type ModelDirectory = "huggingface" | "ollama";

type SystemDirectory = "installation" | "logs";

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

type MenuEventType =
  | "saveWorkflow"
  | "newTab"
  | "close"
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
  | "zoomOut";

interface MenuEventData {
  type: MenuEventType;
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
        readFilePaths: () => Promise<string[]>;
        readFileAsDataURL: (filePath: string) => Promise<string | null>;
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
      on: (channel: string, listener: (...args: any[]) => void) => void;
      off: (channel: string, listener: (...args: any[]) => void) => void;
    };
    __UPDATES__?: any[];
  }
}

export {};
