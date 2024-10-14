import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";

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
    return Object.values(get().metadata);
  }
}));

export default useMetadataStore;
