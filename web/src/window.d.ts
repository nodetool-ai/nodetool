import type { Workflow } from "./stores/ApiTypes";
import type {
  InstalledPackage,
  PackageActionResult,
  PackageInfo
} from "./stores/NodePacksStore";
import type { VstBridge } from "./components/timeline/daw/devices/vstBridge";

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
  optionalNodePath: string;
  // Python and package versions
  pythonVersion: string | null;
  // Feature availability
  cudaAvailable: boolean;
  cudaVersion: string | null;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
}

interface FileExplorerResult {
  status: "success" | "error";
  path?: string;
  message?: string;
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
  | "toggleSnapToGrid"
  | "prevTab"
  | "nextTab"
  | "switchToTab"
  | "openSettings"
  | "showKeyboardShortcuts"
  | "openHelp"
  | "openDownloads"
  | "openModelManager"
  | "openPackageManager";

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

interface Vault {
  id: string;
  name: string;
  dbPath: string | null;
  assetPath: string | null;
  vectorPath: string | null;
}

interface VaultListResult {
  vaults: Vault[];
  activeVaultId: string;
}

/** The cloud sign-in shared with the native apps. It holds no token. */
export interface CloudAccountState {
  /** False when this build has no account helper, or it stopped. */
  available: boolean;
  state: "signedOut" | "signingIn" | "signedIn";
  displayName: string;
  /** The signed-in account's id, empty otherwise. Not a credential. */
  accountId: string;
  serverOrigin: string;
  /** Signed out here, and the server has not confirmed the end of the session yet. */
  serverEndPending: boolean;
  /** False when a managed policy turns the cloud features off. */
  cloudAvailable: boolean;
  /** False when the computer has no credential store. */
  keychainAvailable: boolean;
  /** Why the last sign-in did not complete, or the policy's reason. */
  message: string;
}

/** A request to the signed-in cloud server. The desktop app adds the credential. */
export interface CloudRequestInput {
  method: "GET" | "HEAD" | "POST";
  /** A path on the signed-in server, with its query. */
  path: string;
  headers: Record<string, string>;
  body?: string | Uint8Array;
}

export type CloudResponse =
  | { ok: true; status: number; headers: [string, string][]; body: Uint8Array }
  | { ok: false; error: "SIGNED_OUT" | "OFFLINE" | "REFUSED" | "CANCELLED" | "BUSY" };

export interface CloudTransferResult {
  status: "ok" | "signedOut" | "offline" | "refused" | "localUnavailable" | "cancelled";
  reason: string;
  data: unknown;
}

/** A document of the signed-in cloud server, as the cloud window opens it. */
export interface CloudDocumentRef {
  type: "workflow" | "timeline";
  id: string;
}

export type CloudWindowOpenResult =
  | { ok: true }
  | { ok: false; error: "SIGNED_OUT" | "STARTING" };

interface McpBundleInstallResult {
  ok: boolean;
  opened: boolean;
  revealed: boolean;
  path: string;
  error?: string;
}

declare global {
  interface Window {
    api: {
      runApp: (workflowId: string) => Promise<void>;
      showItemInFolder?: (fullPath: string) => Promise<void>;

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
      /** Mirror the snap-to-grid setting onto the desktop View menu checkbox. */
      setMenuSnapToGrid?: (enabled: boolean) => void;
      onCreateWorkflow: (workflow: Workflow) => Promise<void>;
      onUpdateWorkflow: (workflow: Workflow) => Promise<void>;
      onDeleteWorkflow: (workflow: Workflow) => Promise<void>;
      mcp?: {
        installBundle: () => Promise<McpBundleInstallResult>;
      };
      /** VST3 instruments. Desktop only. */
      vst?: VstBridge;
      /**
       * The cloud sign-in that this app, the node editor and the timeline
       * share on one computer. Desktop only.
       */
      cloudAccount?: {
        state: () => Promise<CloudAccountState>;
        signIn: () => Promise<void>;
        cancelSignIn: () => Promise<void>;
        signOut: () => Promise<void>;
        /** Returns the unsubscribe function. */
        onChange: (callback: (state: CloudAccountState) => void) => () => void;
      };
      /**
       * Requests to the signed-in cloud server and the local transfer router,
       * sent with the shared account. No token reaches the page. Desktop only.
       */
      cloud?: {
        request: (request: CloudRequestInput) => Promise<CloudResponse>;
        transfer: (request: {
          procedure: string;
          input: Record<string, unknown>;
        }) => Promise<CloudTransferResult>;
        /** The workflow socket of a cloud document, opened by the desktop app. */
        socket: {
          open: () => Promise<
            { ok: true; id: number } | { ok: false; error: "SIGNED_OUT" | "OFFLINE" | "BUSY" }
          >;
          send: (id: number, data: Uint8Array | string) => Promise<boolean>;
          close: (id: number) => Promise<void>;
          onEvent: (
            callback: (
              event:
                | { id: number; kind: "open" }
                | { id: number; kind: "message"; data: Uint8Array | string }
                | { id: number; kind: "close"; code: number; reason: string }
            ) => void
          ) => () => void;
        };
        /** Opens a document of the signed-in server in the cloud window (D27). */
        openDocument: (document: CloudDocumentRef) => Promise<CloudWindowOpenResult>;
        /** In the cloud window, its server and account. Null in every other window. */
        window: { server: string; account: string } | null;
        /** The cloud window's page is ready: the documents asked for so far. */
        windowReady: () => Promise<CloudDocumentRef[]>;
        /** Documents opened in the cloud window after it was ready. Returns the unsubscribe function. */
        onWindowDocument: (callback: (document: CloudDocumentRef) => void) => () => void;
      };
      /** Native OS notifications. Desktop only. */
      notifications?: {
        /** Resolves whether a notification was shown: none while focused. */
        show: (request: {
          title?: string;
          body: string;
          tag?: string;
          silent?: boolean;
        }) => Promise<boolean>;
      };
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
        beep: () => Promise<void>;
      };

      // Settings module - Application settings
      settings?: {
        getCloseBehavior: () => Promise<"ask" | "quit" | "background">;
        setCloseBehavior: (
          action: "ask" | "quit" | "background"
        ) => Promise<void>;
        getSystemInfo: () => Promise<SystemInfo>;
        getAutoUpdates?: () => Promise<boolean>;
        setAutoUpdates?: (enabled: boolean) => Promise<void>;
        getUpdateChannel?: () => Promise<"latest" | "nightly">;
        setUpdateChannel?: (channel: "latest" | "nightly") => Promise<"latest" | "nightly">;
      };

      // Vaults module - switchable, isolated data stores (each its own SQLite
      // database). Electron-only.
      vaults?: {
        list: () => Promise<VaultListResult>;
        create: (name: string) => Promise<VaultListResult>;
        rename: (id: string, name: string) => Promise<VaultListResult>;
        delete: (id: string) => Promise<VaultListResult>;
        switch: (id: string) => Promise<VaultListResult>;
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

      // Local file helpers (available in Electron only)
      files?: {
        /** Resolve the absolute disk path of a dropped/selected File. */
        getPathForFile: (file: File) => string;
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

      // Package manager operations (available in Electron only)
      packages?: {
        /** Python node packs offered by the nodetool registry. */
        listAvailable?: () => Promise<{
          packages: PackageInfo[];
          count?: number;
        }>;
        /** Python node packs currently installed in the desktop environment. */
        listInstalled?: () => Promise<{
          packages: InstalledPackage[];
          count?: number;
        }>;
        /** Installed packs that pin an older nodetool-core and cannot load. */
        listStale?: () => Promise<InstalledPackage[]>;
        /** Install a registry pack by repo id (e.g. `nodetool-ai/nodetool-base`). */
        install?: (repoId: string) => Promise<PackageActionResult>;
        /** Uninstall an installed registry pack by repo id. */
        uninstall?: (repoId: string) => Promise<PackageActionResult>;
        /** Update an installed registry pack to the latest version. */
        update?: (repoId: string) => Promise<PackageActionResult>;
        getRuntimeStatuses: () => Promise<
          Array<{
            id: string;
            name: string;
            description: string;
            installed: boolean;
            installing: boolean;
            installedVersion?: string;
            latestVersion?: string;
            updateAvailable?: boolean;
          }>
        >;
        installRuntime: (
          packageId: string,
          installLocation?: string
        ) => Promise<{ success: boolean; message: string }>;
        uninstallRuntime: (
          packageId: string
        ) => Promise<{ success: boolean; message: string }>;
        /** Reinstall a runtime package at the version the app pins. Older
         *  desktop builds lack it. */
        updateRuntime?: (
          packageId: string
        ) => Promise<{ success: boolean; message: string }>;
        getInstallLocation: () => Promise<string>;
        selectInstallLocation: () => Promise<string | null>;
      };

      // Backend server lifecycle + log streaming (available in Electron only)
      server?: {
        /** Restart the backend server. */
        restart: () => Promise<void>;
        /** Subscribe to streamed server log lines (conda/uv/npm stdout). */
        onLog: (callback: (message: string) => void) => () => void;
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
    // Note: full `window.api` shape is large; access additional namespaces
    // (packages, nodePacks, settings, ...) through optional chaining.
    // Debug globals exposed by `lib/env`
    isProduction?: boolean;
    isLocalhost?: boolean;
    isElectron?: boolean;
  }
}

export {};
