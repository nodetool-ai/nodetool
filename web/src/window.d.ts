import type { Workflow } from "./stores/ApiTypes";

interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

type ModelDirectory = "huggingface" | "ollama";

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
      clipboardWriteText: (text: string) => Promise<void>;
      clipboardReadText: () => Promise<string>;
      clipboardWriteImage: (dataUrl: string) => Promise<void>;
      openLogFile: () => Promise<void>;
      showItemInFolder: (fullPath: string) => Promise<void>;
      openModelDirectory?: (
        target: ModelDirectory
      ) => Promise<FileExplorerResult | void>;
      openModelPath?: (
        path: string
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
        openExternal: (url: string, options?: {
          activate?: boolean;
          workingDirectory?: string;
          logUsage?: boolean;
        }) => Promise<void>;
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
        setCloseBehavior: (action: "ask" | "quit" | "background") => Promise<void>;
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
  }
}

export {};
