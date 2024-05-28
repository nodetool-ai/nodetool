import { create } from "zustand";
import { NodeMetadata } from "./ApiTypes";

type MetadataStore = {
  metadata: Record<string, NodeMetadata>;
  setMetadata: (metadata: Record<string, NodeMetadata>) => void;
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
};

const defaultMetadata: Record<string, NodeMetadata> = {
  "nodetool.workflows.base_node.Preview": {
    title: "Preview",
    description: "Preview",
    namespace: "default",
    node_type: "nodetool.workflows.base_node.Preview",
    layout: "default",
    primary_field: "value",
    secondary_field: "",
    properties: [
      {
        name: "value",
        type: {
          type: "any"
        }
      }
    ],
    outputs: [],
    model_info: {}
  }
};

const useMetadataStore = create<MetadataStore>((set, get) => ({
  metadata: {},
  setMetadata: (metadata) =>
    set({ metadata: { ...defaultMetadata, ...metadata } }),
  getMetadata: (nodeType) => {
    return get().metadata[nodeType];
  }
}));

export default useMetadataStore;
