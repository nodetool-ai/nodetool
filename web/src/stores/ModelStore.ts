import { create } from 'zustand';
import { client, authHeader } from "./ApiClient";

type ModelStore = {
  models: Record<string, string[]>;
  load: (folder: string) => Promise<string[]>;
};

const useModelStore = create<ModelStore>((set, get) => ({
  models: {},
  load: async (folder: string) => {
    const { error, data } = await client.GET("/api/models/{folder}", {
      params: { path: { folder }, header: authHeader() }
    });
    const models = get().models;
    if (error) {
      console.error('Failed to fetch models:', error);
      return [];
    }
    if (!data) {
      console.error('No data returned from server');
      return [];
    }
    set({
      models: {
        ...models,
        [folder]: data
      }
    });
    return data;
  },
}));

export default useModelStore;