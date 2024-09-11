import { create } from "zustand";
import { client } from "./ApiClient";
import { CachedModel, FunctionModel, LlamaModel } from "./ApiTypes";
import { QueryClient } from "@tanstack/react-query";

type ModelStore = {
  queryClient: QueryClient | null;
  setQueryClient(queryClient: QueryClient): unknown;
  modelFiles: Record<string, string[]>;
  functionModels: FunctionModel[];
  llamaModels: LlamaModel[];
  invalidate: () => void;
  huggingFaceModels: CachedModel[];
  loadFunctionModels: () => Promise<FunctionModel[]>;
  loadLlamaModels: () => Promise<LlamaModel[]>;
  loadHuggingFaceModels: () => Promise<CachedModel[]>;
  loadFiles: (folder: string) => Promise<string[]>;
  hasInstalledModels: (modelType: string) => boolean;
  isModelDownloaded: (modelId: string, modelType: string) => boolean;
};

const useModelStore = create<ModelStore>((set, get) => ({
  queryClient: null,
  modelFiles: {},
  functionModels: [],
  llamaModels: [],
  huggingFaceModels: [],
  setQueryClient: (queryClient: QueryClient) => {
    set({ queryClient });
  },
  invalidate: () => {
    get().queryClient?.invalidateQueries();
  },
  loadHuggingFaceModels: async () => {
    const { error, data } = await client.GET(
      "/api/models/huggingface_models",
      {}
    );
    if (error) {
      throw new Error("Failed to fetch models: " + error);
    }
    set({
      huggingFaceModels: data
    });
    return data;
  },
  loadLlamaModels: async () => {
    const { error, data } = await client.GET("/api/models/llama_models", {});
    if (error) {
      throw new Error("Failed to fetch models: " + error);
    }
    set({
      llamaModels: data
    });
    return data;
  },
  loadFunctionModels: async () => {
    const { error, data } = await client.GET("/api/models/function_models", {});
    if (error) {
      throw new Error("Failed to fetch models: " + error);
    }
    set({
      functionModels: data
    });
    return data;
  },
  loadFiles: async (folder: string) => {
    const { error, data } = await client.GET("/api/models/{folder}", {
      params: { path: { folder } }
    });
    const modelFiles = get().modelFiles;
    if (error) {
      throw new Error("Failed to fetch models: " + error);
    }
    set({
      modelFiles: {
        ...modelFiles,
        [folder]: data
      }
    });
    return data;
  },
  hasInstalledModels: (modelType: string) => {
    const state = get();
    switch (modelType) {
      case "function_model":
        return state.functionModels.length > 0;
      case "llama_model":
        return state.llamaModels.length > 0;
      case "huggingface_model":
        return state.huggingFaceModels.length > 0;
      default:
        // For other types, check if there are any files in the corresponding folder
        return state.modelFiles[modelType]?.length > 0 || false;
    }
  },
  isModelDownloaded: (modelId: string, modelType: string) => {
    const state = get();
    if (modelType.startsWith("hf.")) {
      return state.huggingFaceModels.some(model => model.repo_id === modelId);
    } else if (modelType.startsWith("llama_model")) {
      return state.llamaModels.some(model => model.model === modelId);
    } else {
      return false;
    }
  }
}));

export default useModelStore;
