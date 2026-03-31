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
import useMetadataStore from "./MetadataStore";
import { comfyObjectInfoToMetadataMap } from "../utils/comfySchemaConverter";
import { BASE_URL } from "./BASE_URL";
import log from "loglevel";

export type ComfyBackendType = "local" | "runpod";

interface ComfyUIState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: string | null;
  baseUrl: string;

  // Backend selection
  backendType: ComfyBackendType;

  // RunPod state (API key is stored as a secret via SecretsStore)
  isRunpodKeyConfigured: boolean;

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
  setRunpodKeyConfigured: (configured: boolean) => void;
  checkConnection: () => Promise<boolean>;
  connect: () => Promise<void>;
  disconnect: () => void;
  fetchObjectInfo: (forceRefresh?: boolean) => Promise<void>;
  setCurrentPromptId: (id: string | null) => void;
  setExecuting: (isExecuting: boolean) => void;
  setExecutionProgress: (progress: number) => void;
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

export const useComfyUIStore = create<ComfyUIState>((set, get) => ({
  // Initial state
  isConnected: false,
  isConnecting: false,
  connectionError: null,
  baseUrl: loadComfyUIUrl(),

  backendType: loadBackendType(),
  isRunpodKeyConfigured: false,

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

  setRunpodKeyConfigured: (configured: boolean) => {
    set({ isRunpodKeyConfigured: configured });
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
      service.setBaseUrl(baseUrl);

      // Fetch object_info through the backend proxy to avoid CORS
      const resp = await fetch(
        `${BASE_URL}/api/comfy/object_info?host=${encodeURIComponent(baseUrl)}`
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({ error: `HTTP ${resp.status}` }));
        throw new Error((body as Record<string, string>).error || `HTTP ${resp.status}`);
      }
      const objectInfo = await resp.json() as ComfyUIObjectInfo;

      // Register ComfyUI node metadata
      const comfyMetadata = comfyObjectInfoToMetadataMap(objectInfo);
      const currentMetadata = useMetadataStore.getState().metadata;
      useMetadataStore.getState().setMetadata({
        ...currentMetadata,
        ...comfyMetadata,
      });

      set({
        objectInfo,
        isConnected: true,
        isConnecting: false,
        connectionError: null
      });

      log.info(`Connected to ComfyUI at ${baseUrl}, registered ${Object.keys(comfyMetadata).length} nodes`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to connect";
      set({
        isConnected: false,
        isConnecting: false,
        connectionError: errorMessage,
        objectInfo: null
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
