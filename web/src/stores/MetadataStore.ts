/**
 * Store for managing node metadata, recommended models, and node types.
 * Handles the global state for node-related metadata and configuration,
 * including filtering based on Comfy settings.
 */

import { create } from "zustand";
import { NodeTypes } from "@xyflow/react";
import { UnifiedModel, NodeMetadata, ModelPack } from "./ApiTypes";

type MetadataStore = {
  metadata: Record<string, NodeMetadata>;
  setMetadata: (metadata: Record<string, NodeMetadata>) => void;
  getMetadata: (nodeType: string) => NodeMetadata | undefined;
  recommendedModels: UnifiedModel[];
  setRecommendedModels: (models: UnifiedModel[]) => void;
  modelPacks: ModelPack[];
  setModelPacks: (packs: ModelPack[]) => void;
  nodeTypes: NodeTypes;
  setNodeTypes: (nodeTypes: NodeTypes) => void;
  addNodeType: (nodeType: string, nodeTypeComponent: NodeTypes[string]) => void;
};
const useMetadataStore = create<MetadataStore>((set, get) => ({
  metadata: {},
  recommendedModels: [],
  modelPacks: [],
  nodeTypes: {},
  setNodeTypes: (nodeTypes) => set({ nodeTypes }),
  addNodeType: (nodeType: string, nodeTypeComponent: NodeTypes[string]) =>
    set((state) => ({
      nodeTypes: { ...state.nodeTypes, [nodeType]: nodeTypeComponent }
    })),
  setMetadata: (metadata) => set({ metadata }),
  getMetadata: (nodeType) => {
    return get().metadata[nodeType];
  },
  setRecommendedModels: (models) => set({ recommendedModels: models }),
  setModelPacks: (packs) => set({ modelPacks: packs })
}));

export default useMetadataStore;
