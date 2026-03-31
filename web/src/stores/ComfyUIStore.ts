/**
 * ComfyUIStore
 * 
 * Zustand store for managing ComfyUI backend connection and state.
 */

import { create } from "zustand";
import {
  getComfyUIService,
  ComfyUIObjectInfo,
  getDefaultComfyBaseUrl,
  normalizeComfyBaseUrl
} from "../services/ComfyUIService";
import log from "loglevel";

export type ComfyBackendType = "local" | "runpod";

interface RunPodConfig {
  apiKey: string;
  endpointId: string;
}

interface ComfyUIState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  baseUrl: string;

  // Backend selection
  backendType: ComfyBackendType;

  // RunPod config
  runpod: RunPodConfig;
  isRunpodConnected: boolean;

  // Node schema cache
  objectInfo: ComfyUIObjectInfo | null;
  isFetchingObjectInfo: boolean;
  objectInfoError: string | null;

  // Execution state
  currentPromptId: string | null;
  isExecuting: boolean;
  executionProgress: number;

  // Actions
  setBaseUrl: (url: string) => void;
  setBackendType: (type: ComfyBackendType) => void;
  setRunpodConfig: (config: Partial<RunPodConfig>) => void;
  checkConnection: () => Promise<boolean>;
  connect: () => Promise<void>;
  disconnect: () => void;
  fetchObjectInfo: (forceRefresh?: boolean) => Promise<void>;
  setCurrentPromptId: (id: string | null) => void;
  setExecuting: (isExecuting: boolean) => void;
  setExecutionProgress: (progress: number) => void;
  setRunpodConnected: (connected: boolean) => void;
  reset: () => void;
}

const DEFAULT_COMFY_URL = getDefaultComfyBaseUrl();

/**
 * Load ComfyUI URL from localStorage or use default
 */
function loadComfyUIUrl(): string {
  const stored = localStorage.getItem("comfyui_base_url");
  const resolved = normalizeComfyBaseUrl(stored || DEFAULT_COMFY_URL);
  if (stored !== resolved) {
    localStorage.setItem("comfyui_base_url", resolved);
  }
  return resolved;
}

/**
 * Save ComfyUI URL to localStorage
 */
function saveComfyUIUrl(url: string): void {
  localStorage.setItem("comfyui_base_url", normalizeComfyBaseUrl(url));
}

function loadBackendType(): ComfyBackendType {
  const stored = localStorage.getItem("comfyui_backend_type");
  return stored === "runpod" ? "runpod" : "local";
}

function saveBackendType(type: ComfyBackendType): void {
  localStorage.setItem("comfyui_backend_type", type);
}

function loadRunpodConfig(): RunPodConfig {
  return {
    apiKey: localStorage.getItem("runpod_api_key") || "",
    endpointId: localStorage.getItem("runpod_endpoint_id") || ""
  };
}

function saveRunpodConfig(config: RunPodConfig): void {
  localStorage.setItem("runpod_api_key", config.apiKey);
  localStorage.setItem("runpod_endpoint_id", config.endpointId);
}

export const useComfyUIStore = create<ComfyUIState>((set, get) => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  baseUrl: loadComfyUIUrl(),

  backendType: loadBackendType(),
  runpod: loadRunpodConfig(),
  isRunpodConnected: false,

  objectInfo: null,
  isFetchingObjectInfo: false,
  objectInfoError: null,

  currentPromptId: null,
  isExecuting: false,
  executionProgress: 0,

  // Actions
  setBaseUrl: (url: string) => {
    const service = getComfyUIService();
    const normalizedUrl = normalizeComfyBaseUrl(url);
    service.setBaseUrl(normalizedUrl);
    saveComfyUIUrl(normalizedUrl);
    set({
      baseUrl: normalizedUrl,
      isConnected: false,
      objectInfo: null
    });
  },

  setBackendType: (type: ComfyBackendType) => {
    saveBackendType(type);
    set({ backendType: type });
  },

  setRunpodConfig: (config: Partial<RunPodConfig>) => {
    const current = get().runpod;
    const updated = { ...current, ...config };
    saveRunpodConfig(updated);
    set({ runpod: updated, isRunpodConnected: false });
  },

  setRunpodConnected: (connected: boolean) => {
    set({ isRunpodConnected: connected });
  },

  checkConnection: async () => {
    const service = getComfyUIService();
    try {
      const connected = await service.checkConnection();
      set({ isConnected: connected, connectionError: null });
      return connected;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      set({ isConnected: false, connectionError: errorMessage });
      return false;
    }
  },

  connect: async () => {
    const { baseUrl } = get();
    const service = getComfyUIService();

    set({ isConnecting: true, connectionError: null });

    try {
      // Set the base URL
      service.setBaseUrl(baseUrl);

      // Check if backend is reachable
      const connected = await service.checkConnection();

      if (!connected) {
        throw new Error("ComfyUI backend is not reachable");
      }

      // Fetch object info to validate connection
      await get().fetchObjectInfo();

      set({
        isConnected: true,
        isConnecting: false,
        connectionError: null
      });

      log.info("Successfully connected to ComfyUI backend");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect";
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: errorMessage
      });
      log.error("Failed to connect to ComfyUI:", error);
      throw error;
    }
  },

  disconnect: () => {
    const service = getComfyUIService();
    service.disconnectWebSocket();
    set({
      isConnected: false,
      connectionError: null,
      currentPromptId: null,
      isExecuting: false,
      executionProgress: 0
    });
  },

  fetchObjectInfo: async (forceRefresh = false) => {
    const service = getComfyUIService();

    set({ isFetchingObjectInfo: true, objectInfoError: null });

    try {
      const objectInfo = await service.fetchObjectInfo(forceRefresh);
      set({
        objectInfo,
        isFetchingObjectInfo: false,
        objectInfoError: null
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch object info";
      set({
        objectInfo: null,
        isFetchingObjectInfo: false,
        objectInfoError: errorMessage
      });
      throw error;
    }
  },

  setCurrentPromptId: (id: string | null) => {
    set({ currentPromptId: id });
  },

  setExecuting: (isExecuting: boolean) => {
    set({ isExecuting });
    if (!isExecuting) {
      set({ executionProgress: 0 });
    }
  },

  setExecutionProgress: (progress: number) => {
    set({ executionProgress: progress });
  },

  reset: () => {
    set({
      isConnected: false,
      isConnecting: false,
      connectionError: null,
      isRunpodConnected: false,
      objectInfo: null,
      isFetchingObjectInfo: false,
      objectInfoError: null,
      currentPromptId: null,
      isExecuting: false,
      executionProgress: 0
    });
  }
}));

/**
 * Initialize ComfyUI service with stored URL
 */
export function initializeComfyUI(): void {
  const url = loadComfyUIUrl();
  const service = getComfyUIService();
  service.setBaseUrl(url);
}
