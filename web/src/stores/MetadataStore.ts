import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";
import { useSettingsStore } from "./SettingsStore";

type MetadataStore = {
  metadata: Record<string, NodeMetadata>;
  setMetadata: (metadata: Record<string, NodeMetadata>) => void;
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  getAllMetadata: () => NodeMetadata[];
};
const useMetadataStore = create<MetadataStore>((set, get) => ({
  metadata: {},
  setMetadata: (metadata) => set({ metadata }),
  getMetadata: (nodeType) => {
    return get().metadata[nodeType];
  },
  getAllMetadata: () => {
    const comfyEnabled = useSettingsStore.getState().settings.enableComfy;
    if (!comfyEnabled) {
      return Object.values(get().metadata).filter(
        (node) => !node.namespace.startsWith("comfy")
      );
    }
    return Object.values(get().metadata);
  }
}));

export default useMetadataStore;
