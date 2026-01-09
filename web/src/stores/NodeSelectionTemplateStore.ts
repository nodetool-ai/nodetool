/**
 * NodeSelectionTemplateStore manages templates created from selected nodes.
 *
 * Responsibilities:
 * - Store templates created from node selections
 * - Persist templates locally for privacy
 * - Provide CRUD operations for templates
 * - Track template usage statistics
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";

export interface NodeTemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  selected?: boolean;
}

export interface NodeTemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  nodes: NodeTemplateNode[];
  edges: NodeTemplateEdge[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  thumbnail?: string;
}

export interface NodeTemplateCategory {
  id: string;
  name: string;
  icon?: string;
}

interface NodeSelectionTemplateState {
  // Templates storage
  templates: Record<string, NodeTemplate>;

  // Categories for organization
  categories: NodeTemplateCategory[];

  // Currently selected template for insertion
  selectedTemplateId: string | null;

  // UI state
  isTemplateBrowserOpen: boolean;
  isSaveDialogOpen: boolean;
  searchQuery: string;

  // Actions
  createTemplate: (
    name: string,
    description: string,
    category: string,
    tags: string[],
    nodes: Node[],
    edges: Edge[]
  ) => string;

  updateTemplate: (
    id: string,
    updates: Partial<Omit<NodeTemplate, "id" | "createdAt">>
  ) => void;

  deleteTemplate: (id: string) => void;

  duplicateTemplate: (id: string) => string | null;

  getTemplate: (id: string) => NodeTemplate | null;

  getTemplatesByCategory: (categoryId: string) => NodeTemplate[];

  getAllTemplates: () => NodeTemplate[];

  searchTemplates: (query: string) => NodeTemplate[];

  incrementUsageCount: (id: string) => void;

  setSelectedTemplateId: (id: string | null) => void;

  setTemplateBrowserOpen: (open: boolean) => void;

  setSaveDialogOpen: (open: boolean) => void;

  setSearchQuery: (query: string) => void;

  addCategory: (name: string, icon?: string) => string;

  deleteCategory: (id: string) => void;

  clearState: () => void;
}

const DEFAULT_CATEGORIES: NodeTemplateCategory[] = [
  { id: "custom", name: "Custom", icon: "Star" },
  { id: "input", name: "Input/Output", icon: "Input" },
  { id: "processing", name: "Processing", icon: "Process" },
  { id: "ai", name: "AI Models", icon: "Ai" },
  { id: "logic", name: "Logic", icon: "Logic" },
  { id: "utility", name: "Utilities", icon: "Utility" }
];

export const useNodeSelectionTemplateStore = create<NodeSelectionTemplateState>()(
  persist(
    (set, get) => ({
      templates: {},
      categories: DEFAULT_CATEGORIES,
      selectedTemplateId: null,
      isTemplateBrowserOpen: false,
      isSaveDialogOpen: false,
      searchQuery: "",

      createTemplate: (
        name: string,
        description: string,
        category: string,
        tags: string[],
        nodes: Node[],
        edges: Edge[]
      ): string => {
        const id = uuidv4();
        const now = Date.now();

        const templateNodes: NodeTemplateNode[] = nodes.map((node) => ({
          id: node.id,
          type: node.type || "unknown",
          position: node.position,
          data: {
            properties: node.data.properties || {},
            selectable: node.data.selectable ?? true,
            dynamic_properties: node.data.dynamic_properties || {},
            workflow_id: node.data.workflow_id || ""
          } as NodeData,
          selected: node.selected
        }));

        const templateEdges: NodeTemplateEdge[] = edges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }));

        const newTemplate: NodeTemplate = {
          id,
          name,
          description,
          category,
          tags,
          nodes: templateNodes,
          edges: templateEdges,
          createdAt: now,
          updatedAt: now,
          usageCount: 0
        };

        set((state) => ({
          templates: {
            ...state.templates,
            [id]: newTemplate
          }
        }));

        return id;
      },

      updateTemplate: (
        id: string,
        updates: Partial<Omit<NodeTemplate, "id" | "createdAt">>
      ) => {
        set((state) => {
          const template = state.templates[id];
          if (!template) {
            return state;
          }

          return {
            templates: {
              ...state.templates,
              [id]: {
                ...template,
                ...updates,
                updatedAt: Date.now()
              }
            }
          };
        });
      },

      deleteTemplate: (id: string) => {
        set((state) => {
          const { [id]: deleted, ...remaining } = state.templates;
          return { templates: remaining };
        });
      },

      duplicateTemplate: (id: string): string | null => {
        const template = get().templates[id];
        if (!template) {
          return null;
        }

        const newId = uuidv4();
        const now = Date.now();

        const duplicatedTemplate: NodeTemplate = {
          ...template,
          id: newId,
          name: `${template.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
          usageCount: 0,
          category: "custom"
        };

        set((state) => ({
          templates: {
            ...state.templates,
            [newId]: duplicatedTemplate
          }
        }));

        return newId;
      },

      getTemplate: (id: string): NodeTemplate | null => {
        return get().templates[id] || null;
      },

      getTemplatesByCategory: (categoryId: string): NodeTemplate[] => {
        const templates = Object.values(get().templates);
        if (categoryId === "all") {
          return templates;
        }
        return templates.filter((t) => t.category === categoryId);
      },

      getAllTemplates: (): NodeTemplate[] => {
        return Object.values(get().templates);
      },

      searchTemplates: (query: string): NodeTemplate[] => {
        const templates = Object.values(get().templates);
        if (!query.trim()) {
          return templates;
        }

        const lowerQuery = query.toLowerCase();
        return templates.filter(
          (t) =>
            t.name.toLowerCase().includes(lowerQuery) ||
            t.description.toLowerCase().includes(lowerQuery) ||
            t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery)) ||
            t.category.toLowerCase().includes(lowerQuery)
        );
      },

      incrementUsageCount: (id: string) => {
        set((state) => {
          const template = state.templates[id];
          if (!template) {
            return state;
          }

          return {
            templates: {
              ...state.templates,
              [id]: {
                ...template,
                usageCount: template.usageCount + 1,
                updatedAt: Date.now()
              }
            }
          };
        });
      },

      setSelectedTemplateId: (id: string | null) => {
        set({ selectedTemplateId: id });
      },

      setTemplateBrowserOpen: (open: boolean) => {
        set({ isTemplateBrowserOpen: open });
      },

      setSaveDialogOpen: (open: boolean) => {
        set({ isSaveDialogOpen: open });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      addCategory: (name: string, icon?: string): string => {
        const id = uuidv4();
        const newCategory: NodeTemplateCategory = { id, name, icon };
        set((state) => ({
          categories: [...state.categories, newCategory]
        }));
        return id;
      },

      deleteCategory: (id: string) => {
        set((state) => ({
          categories: state.categories.filter((c) => c.id !== id)
        }));
      },

      clearState: () => {
        set({
          templates: {},
          categories: DEFAULT_CATEGORIES,
          selectedTemplateId: null,
          isTemplateBrowserOpen: false,
          isSaveDialogOpen: false,
          searchQuery: ""
        });
      }
    }),
    {
      name: "node-selection-template-storage",
      partialize: (state) => ({
        templates: state.templates,
        categories: state.categories
      })
    }
  )
);

export default useNodeSelectionTemplateStore;
