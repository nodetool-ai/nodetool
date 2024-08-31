import { create } from "zustand";
import { client } from "./ApiClient";
import { CachedModel } from "./ApiTypes";

interface HuggingFaceModelStore {
    models: CachedModel[];
    load: () => Promise<void>;
    delete: (repoId: string) => Promise<boolean>;
    getModel: (repoId: string) => Promise<CachedModel | null>;
}

export const useHuggingFaceModelStore = create<HuggingFaceModelStore>((set, get) => ({
    models: [],
    isLoading: false,
    error: null,

    load: async () => {
        const { data, error } = await client.GET("/api/models/huggingface_models", {});
        if (error) throw error;
        set({ models: data });
    },

    delete: async (repoId: string) => {
        const { data, error } = await client.DELETE("/api/models/huggingface_model", {
            params: { query: { repo_id: repoId } }
        });
        if (error) throw error;
        set({ models: get().models.filter((model) => model.repo_id !== repoId) });
        return data;
    },

    getModel: async (repoId: string) => {
        const { data, error } = await client.GET("/api/models/huggingface_model", {
            params: { query: { repo_id: repoId } }
        });
        if (error) throw error;
        return data;
    }
}));
