/**
 * Store for managing node metadata, recommended models, and node types.
 * Handles the global state for node-related metadata and configuration.
 */

import { create } from "zustand";
import { UnifiedModel, NodeMetadata, ModelPack } from "./ApiTypes";
import { NodeTypes } from "@xyflow/react";

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
  /**
   * Node types a loaded graph referenced that the registry does not know —
   * rendered with `PlaceholderNode`. Held as names rather than components so
   * the stores that discover them stay free of React imports: `PlaceholderNode`
   * renders a full node body, and importing it from `NodeStore` put the whole
   * property-editor tree (Monaco, Lexical, three.js) on the app's boot path.
   * The surfaces that build ReactFlow's `nodeTypes` prop map these to the
   * component via `usePlaceholderNodeTypes`.
   */
  unknownNodeTypes: string[];
  addUnknownNodeTypes: (nodeTypes: string[]) => void;
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
  unknownNodeTypes: [],
  addUnknownNodeTypes: (nodeTypes) => {
    const current = get().unknownNodeTypes;
    const added = nodeTypes.filter((t) => !current.includes(t));
    // Keep the array identity when nothing is new: consumers memoize the
    // ReactFlow `nodeTypes` prop on it, and a fresh identity remounts the canvas.
    if (added.length === 0) {
      return;
    }
    set({ unknownNodeTypes: [...current, ...added] });
  },
  setMetadata: (metadata) => set({ metadata }),
  getMetadata: (nodeType) => {
    return get().metadata[nodeType];
  },
  setRecommendedModels: (models) => set({ recommendedModels: models }),
  setModelPacks: (packs) => set({ modelPacks: packs })
}));

export default useMetadataStore;
