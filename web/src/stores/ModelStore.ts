import { create } from "zustand";
import { client } from "./ApiClient";
import { CachedModel, LlamaModel, ModelFile } from "./ApiTypes";
import { QueryClient } from "@tanstack/react-query";

type ModelStore = {
  queryClient: QueryClient | null;
  setQueryClient(queryClient: QueryClient): unknown;
  invalidate: () => void;
  loadLlamaModels: () => Promise<LlamaModel[]>;
  loadHuggingFaceModels: () => Promise<CachedModel[]>;
  loadComfyModels: (modelType: string) => Promise<ModelFile[]>;
};

const useModelStore = create<ModelStore>((set, get) => ({
  queryClient: null,
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
    return data;
  },
  loadLlamaModels: async () => {
    const { error, data } = await client.GET("/api/models/ollama_models", {});
    if (error) {
      return [];
    }
    return data;
  },
  loadComfyModels: async (modelType: string) => {
    const { error, data } = await client.GET("/api/models/{model_type}", {
      params: { path: { model_type: modelType } }
    });
    if (error) {
      throw new Error("Failed to fetch models: " + error);
    }
    return data;
  },
}));

export default useModelStore;
