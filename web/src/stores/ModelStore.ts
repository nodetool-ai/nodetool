import { create } from "zustand";
import { client } from "./ApiClient";
import { FunctionModel, LlamaModel } from "./ApiTypes";

type ModelStore = {
  modelFiles: Record<string, string[]>;
  functionModels: FunctionModel[];
  llamaModels: LlamaModel[];
  loadFunctionModels: () => Promise<FunctionModel[]>;
  loadLlamaModels: () => Promise<LlamaModel[]>;
  loadFiles: (folder: string) => Promise<string[]>;
};

const useModelStore = create<ModelStore>((set, get) => ({
  modelFiles: {},
  functionModels: [],
  llamaModels: [],
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
  }
}));

export default useModelStore;
