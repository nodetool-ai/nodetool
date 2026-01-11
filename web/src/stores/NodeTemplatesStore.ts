/**
 * NodeTemplatesStore
 *
 * Manages saved node templates for quick workflow creation.
 * Templates are groups of connected nodes that can be saved and reused.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Node, Edge } from "@xyflow/react";
import type { NodeData } from "./NodeData";

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
  category: string;
  createdAt: number;
  updatedAt: number;
  usageCount: number;
  thumbnail?: string;
}

export interface CreateTemplateData {
  name: string;
  description?: string;
  category?: string;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface NodeTemplatesStore {
  templates: NodeTemplate[];
  isMenuOpen: boolean;
  selectedCategory: string | null;

  // Template CRUD operations
  createTemplate: (data: CreateTemplateData) => NodeTemplate;
  updateTemplate: (id: string, data: Partial<Omit<NodeTemplate, "id" | "createdAt">>) => void;
  deleteTemplate: (id: string) => void;
  duplicateTemplate: (id: string) => NodeTemplate;

  // Template queries
  getTemplate: (id: string) => NodeTemplate | undefined;
  getTemplatesByCategory: (category: string) => NodeTemplate[];
  getAllTemplates: () => NodeTemplate[];
  getTemplateCategories: () => string[];
  searchTemplates: (query: string) => NodeTemplate[];

  // Usage tracking
  incrementUsage: (id: string) => void;

  // UI state
  setMenuOpen: (value: boolean) => void;
  setSelectedCategory: (category: string | null) => void;

  // Bulk operations
  importTemplates: (templates: NodeTemplate[]) => void;
  exportTemplates: () => string;
  clearAllTemplates: () => void;
}

const DEFAULT_CATEGORY = "My Templates";
const MAX_TEMPLATES = 50;

export const useNodeTemplatesStore = create<NodeTemplatesStore>()(
  persist(
    (set, get) => ({
      templates: [],
      isMenuOpen: false,
      selectedCategory: null,

      createTemplate: (data: CreateTemplateData): NodeTemplate => {
        const now = Date.now();
        const template: NodeTemplate = {
          id: crypto.randomUUID(),
          name: data.name,
          description: data.description ?? "",
          nodes: deepCloneNodes(data.nodes),
          edges: deepCloneEdges(data.edges),
          category: data.category ?? DEFAULT_CATEGORY,
          createdAt: now,
          updatedAt: now,
          usageCount: 0
        };

        set((state) => {
          const updated = [template, ...state.templates];
          return {
            templates: updated.slice(0, MAX_TEMPLATES)
          };
        });

        return template;
      },

      updateTemplate: (id: string, data: Partial<Omit<NodeTemplate, "id" | "createdAt">>): void => {
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id === id) {
              return {
                ...t,
                ...data,
                updatedAt: Date.now()
              };
            }
            return t;
          })
        }));
      },

      deleteTemplate: (id: string): void => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id)
        }));
      },

      duplicateTemplate: (id: string): NodeTemplate => {
        const template = get().templates.find((t) => t.id === id);
        if (!template) {
          throw new Error(`Template with id ${id} not found`);
        }

        const now = Date.now();
        const duplicate: NodeTemplate = {
          ...template,
          id: crypto.randomUUID(),
          name: `${template.name} (Copy)`,
          createdAt: now,
          updatedAt: now,
          usageCount: 0
        };

        set((state) => ({
          templates: [duplicate, ...state.templates]
        }));

        return duplicate;
      },

      getTemplate: (id: string): NodeTemplate | undefined => {
        return get().templates.find((t) => t.id === id);
      },

      getTemplatesByCategory: (category: string): NodeTemplate[] => {
        return get().templates.filter((t) => t.category === category);
      },

      getAllTemplates: (): NodeTemplate[] => {
        return get().templates;
      },

      getTemplateCategories: (): string[] => {
        const categories = new Set(get().templates.map((t) => t.category));
        return Array.from(categories).sort();
      },

      searchTemplates: (query: string): NodeTemplate[] => {
        const lowerQuery = query.toLowerCase().trim();
        if (!lowerQuery) {
          return get().templates;
        }

        return get().templates.filter(
          (t) =>
            t.name.toLowerCase().includes(lowerQuery) ||
            t.description.toLowerCase().includes(lowerQuery) ||
            t.category.toLowerCase().includes(lowerQuery)
        );
      },

      incrementUsage: (id: string): void => {
        set((state) => ({
          templates: state.templates.map((t) => {
            if (t.id === id) {
              return {
                ...t,
                usageCount: t.usageCount + 1,
                updatedAt: Date.now()
              };
            }
            return t;
          })
        }));
      },

      setMenuOpen: (value: boolean): void => {
        set({ isMenuOpen: value });
      },

      setSelectedCategory: (category: string | null): void => {
        set({ selectedCategory: category });
      },

      importTemplates: (templates: NodeTemplate[]): void => {
        set((state) => {
          const existingIds = new Set(state.templates.map((t) => t.id));
          const newTemplates = templates.filter((t) => !existingIds.has(t.id));
          const merged = [...newTemplates, ...state.templates];
          return {
            templates: merged.slice(0, MAX_TEMPLATES)
          };
        });
      },

      exportTemplates: (): string => {
        return JSON.stringify(get().templates, null, 2);
      },

      clearAllTemplates: (): void => {
        set({ templates: [] });
      }
    }),
    {
      name: "nodetool-node-templates",
      version: 1
    }
  )
);

/**
 * Deep clones nodes to ensure template data is independent of source workflow
 */
function deepCloneNodes(nodes: Node<NodeData>[]): Node<NodeData>[] {
  return nodes.map((node) => {
    const cloned: Node<NodeData> = {
      ...node,
      data: { ...node.data },
      position: { ...node.position }
    };
    if (node.width !== undefined) {
      cloned.width = node.width;
    }
    if (node.height !== undefined) {
      cloned.height = node.height;
    }
    if (node.style !== undefined) {
      cloned.style = { ...node.style };
    }
    if ("label" in node && typeof node.label === "string") {
      (cloned as Node<NodeData> & { label: string }).label = node.label;
    }
    return cloned;
  }  );
}

/**
 * Deep clones edges to ensure template data is independent of source workflow
 */
function deepCloneEdges(edges: Edge[]): Edge[] {
  return edges.map((edge) => {
    const cloned: Edge = { ...edge };
    if (edge.style !== undefined) {
      cloned.style = { ...edge.style };
    }
    if ("label" in edge && typeof edge.label === "string") {
      (cloned as Edge & { label: string }).label = edge.label;
    }
    return cloned;
  });
}

export default useNodeTemplatesStore;
