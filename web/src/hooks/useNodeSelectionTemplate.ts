/**
 * useNodeSelectionTemplate Hook
 *
 * Provides operations for creating, managing, and inserting
 * templates from selected nodes in the workflow editor.
 */

import { useCallback, useMemo } from "react";
import { useNodeSelectionTemplateStore, NodeTemplate } from "../stores/NodeSelectionTemplateStore";
import { Node, Edge, XYPosition } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";

export interface UseNodeSelectionTemplateReturn {
  // Template CRUD
  createTemplate: (
    name: string,
    description: string,
    category: string,
    tags: string[],
    nodes: Node[],
    edges: Edge[]
  ) => string;
  updateTemplate: (id: string, updates: Partial<NodeTemplate>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => string | null;
  getTemplate: (id: string) => NodeTemplate | null;

  // Template queries
  getAllTemplates: () => NodeTemplate[];
  getTemplatesByCategory: (categoryId: string) => NodeTemplate[];
  searchTemplates: (query: string) => NodeTemplate[];

  // Template insertion
  prepareTemplateForInsertion: (templateId: string) => {
    nodes: Node[];
    edges: Edge[];
    offset: XYPosition;
  } | null;

  // UI state
  selectedTemplateId: string | null;
  isTemplateBrowserOpen: boolean;
  isSaveDialogOpen: boolean;
  searchQuery: string;
  categories: Array<{ id: string; name: string; icon?: string }>;

  // UI actions
  setSelectedTemplateId: (id: string | null) => void;
  setTemplateBrowserOpen: (open: boolean) => void;
  setSaveDialogOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;

  // Usage tracking
  incrementUsageCount: (id: string) => void;
}

export const useNodeSelectionTemplate = (): UseNodeSelectionTemplateReturn => {
  const store = useNodeSelectionTemplateStore();

  const createTemplate = useCallback(
    (
      name: string,
      description: string,
      category: string,
      tags: string[],
      nodes: Node[],
      edges: Edge[]
    ): string => {
      return store.createTemplate(name, description, category, tags, nodes, edges);
    },
    [store]
  );

  const updateTemplate = useCallback(
    (id: string, updates: Partial<NodeTemplate>) => {
      store.updateTemplate(id, updates);
    },
    [store]
  );

  const deleteTemplate = useCallback((id: string) => {
    store.deleteTemplate(id);
  }, [store]);

  const duplicateTemplate = useCallback((id: string): string | null => {
    return store.duplicateTemplate(id);
  }, [store]);

  const getTemplate = useCallback((id: string): NodeTemplate | null => {
    return store.getTemplate(id);
  }, [store]);

  const getAllTemplates = useCallback((): NodeTemplate[] => {
    return store.getAllTemplates();
  }, [store]);

  const getTemplatesByCategory = useCallback((categoryId: string): NodeTemplate[] => {
    return store.getTemplatesByCategory(categoryId);
  }, [store]);

  const searchTemplates = useCallback((query: string): NodeTemplate[] => {
    return store.searchTemplates(query);
  }, [store]);

  const prepareTemplateForInsertion = useCallback(
    (templateId: string): { nodes: Node[]; edges: Edge[]; offset: XYPosition } | null => {
      const template = store.getTemplate(templateId);
      if (!template) {
        return null;
      }

      store.incrementUsageCount(templateId);

      const idMap: Record<string, string> = {};
      const now = Date.now();

      const newNodes: Node[] = template.nodes.map((templateNode) => {
        const newId = uuidv4();
        idMap[templateNode.id] = newId;
        return {
          ...templateNode,
          id: newId,
          data: {
            ...templateNode.data,
            id: newId
          },
          position: templateNode.position,
          selected: false
        };
      });

      const newEdges: Edge[] = template.edges.map((templateEdge) => ({
        ...templateEdge,
        id: uuidv4(),
        source: idMap[templateEdge.source] || templateEdge.source,
        target: idMap[templateEdge.target] || templateEdge.target,
        sourceHandle: templateEdge.sourceHandle || null,
        targetHandle: templateEdge.targetHandle || null,
        selected: false
      }));

      let minX = Infinity;
      let minY = Infinity;
      newNodes.forEach((node) => {
        if (node.position.x < minX) minX = node.position.x;
        if (node.position.y < minY) minY = node.position.y;
      });

      return {
        nodes: newNodes,
        edges: newEdges,
        offset: { x: -minX + 100, y: -minY + 100 }
      };
    },
    [store]
  );

  const selectedTemplateId = store.selectedTemplateId;
  const isTemplateBrowserOpen = store.isTemplateBrowserOpen;
  const isSaveDialogOpen = store.isSaveDialogOpen;
  const searchQuery = store.searchQuery;
  const categories = store.categories;

  const setSelectedTemplateId = useCallback((id: string | null) => {
    store.setSelectedTemplateId(id);
  }, [store]);

  const setTemplateBrowserOpen = useCallback((open: boolean) => {
    store.setTemplateBrowserOpen(open);
  }, [store]);

  const setSaveDialogOpen = useCallback((open: boolean) => {
    store.setSaveDialogOpen(open);
  }, [store]);

  const setSearchQuery = useCallback((query: string) => {
    store.setSearchQuery(query);
  }, [store]);

  const incrementUsageCount = useCallback((id: string) => {
    store.incrementUsageCount(id);
  }, [store]);

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    duplicateTemplate,
    getTemplate,
    getAllTemplates,
    getTemplatesByCategory,
    searchTemplates,
    prepareTemplateForInsertion,
    selectedTemplateId,
    isTemplateBrowserOpen,
    isSaveDialogOpen,
    searchQuery,
    categories,
    setSelectedTemplateId,
    setTemplateBrowserOpen,
    setSaveDialogOpen,
    setSearchQuery,
    incrementUsageCount
  };
};

export default useNodeSelectionTemplate;
