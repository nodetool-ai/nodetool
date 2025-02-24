/**
 * Store for managing node metadata, recommended models, and node types.
 * Handles the global state for node-related metadata and configuration,
 * including filtering based on Comfy settings.
 */

import { create } from "zustand";
import { HuggingFaceModel, NodeMetadata } from "./ApiTypes";
import { useSettingsStore } from "./SettingsStore";
import { NodeTypes } from "@xyflow/react";

type MetadataStore = {
  metadata: Record<string, NodeMetadata>;
  setMetadata: (metadata: Record<string, NodeMetadata>) => void;
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  recommendedModels: HuggingFaceModel[];
  setRecommendedModels: (models: HuggingFaceModel[]) => void;
  nodeTypes: NodeTypes;
  setNodeTypes: (nodeTypes: NodeTypes) => void;
  addNodeType: (nodeType: string, nodeTypeComponent: any) => void;
};
const useMetadataStore = create<MetadataStore>((set, get) => ({
  metadata: {},
  recommendedModels: [],
  nodeTypes: {},
  setNodeTypes: (nodeTypes) => set({ nodeTypes }),
  addNodeType: (nodeType: string, nodeTypeComponent: any) =>
    set((state) => ({
      nodeTypes: { ...state.nodeTypes, [nodeType]: nodeTypeComponent }
    })),
  setMetadata: (metadata) => set({ metadata }),
  getMetadata: (nodeType) => {
    return get().metadata[nodeType];
  },
  setRecommendedModels: (models) => set({ recommendedModels: models })
}));

export default useMetadataStore;
