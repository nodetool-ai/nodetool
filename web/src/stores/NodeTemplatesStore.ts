/**
 * NodeTemplatesStore
 *
 * Manages workflow node templates for reusability.
 * Templates are groups of connected nodes that can be saved and inserted into workflows.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { NodeData } from "./NodeData";

export type TemplateCategory =
  | "common"
  | "image-processing"
  | "audio"
  | "video"
  | "text"
  | "data"
  | "ai-models"
  | "custom";

export interface TemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface TemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface NodeTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  nodes: TemplateNode[];
  edges: TemplateEdge[];
  thumbnail?: string;
  createdAt: number;
  updatedAt: number;
}

interface NodeTemplatesStore {
  templates: NodeTemplate[];
  addTemplate: (template: Omit<NodeTemplate, "id" | "createdAt" | "updatedAt">) => string;
  updateTemplate: (id: string, updates: Partial<Omit<NodeTemplate, "id" | "createdAt">>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => NodeTemplate | undefined;
  getTemplatesByCategory: (category: TemplateCategory) => NodeTemplate[];
  getAllTemplates: () => NodeTemplate[];
  clearTemplates: () => void;
  exportTemplate: (id: string) => string | undefined;
  importTemplate: (templateJson: string) => NodeTemplate | null;
  reorderTemplates: (fromIndex: number, toIndex: number) => void;
}

const MAX_TEMPLATES = 50;

/**
 * Generate a unique template ID.
 */
const generateTemplateId = (): string => {
  return `template-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Validate template structure.
 */
const validateTemplate = (template: unknown): template is NodeTemplate => {
  if (typeof template !== "object" || template === null) {
    return false;
  }

  const t = template as Record<string, unknown>;

  return (
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.description === "string" &&
    typeof t.category === "string" &&
    Array.isArray(t.nodes) &&
    Array.isArray(t.edges) &&
    typeof t.createdAt === "number" &&
    typeof t.updatedAt === "number"
  );
};

export const useNodeTemplatesStore = create<NodeTemplatesStore>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (templateData) => {
        const id = generateTemplateId();
        const now = Date.now();
        const newTemplate: NodeTemplate = {
          ...templateData,
          id,
          createdAt: now,
          updatedAt: now
        };

        set((state) => {
          const updated = [newTemplate, ...state.templates];
          return {
            templates: updated.slice(0, MAX_TEMPLATES)
          };
        });

        return id;
      },

      updateTemplate: (id, updates) => {
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? { ...template, ...updates, updatedAt: Date.now() }
              : template
          )
        }));
      },

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id)
        }));
      },

      getTemplate: (id) => {
        return get().templates.find((template) => template.id === id);
      },

      getTemplatesByCategory: (category) => {
        return get().templates.filter((template) => template.category === category);
      },

      getAllTemplates: () => {
        return get().templates;
      },

      clearTemplates: () => {
        set({ templates: [] });
      },

      exportTemplate: (id) => {
        const template = get().getTemplate(id);
        if (!template) {
          return undefined;
        }

        try {
          return JSON.stringify(template, null, 2);
        } catch {
          return undefined;
        }
      },

      importTemplate: (templateJson) => {
        try {
          const parsed = JSON.parse(templateJson);

          if (!validateTemplate(parsed)) {
            return null;
          }

          // Generate new ID and timestamps to avoid conflicts
          const newTemplate: NodeTemplate = {
            ...parsed,
            id: generateTemplateId(),
            createdAt: Date.now(),
            updatedAt: Date.now()
          };

          set((state) => ({
            templates: [newTemplate, ...state.templates].slice(0, MAX_TEMPLATES)
          }));

          return newTemplate;
        } catch {
          return null;
        }
      },

      reorderTemplates: (fromIndex, toIndex) => {
        set((state) => {
          const updated = [...state.templates];
          if (
            fromIndex >= 0 &&
            fromIndex < updated.length &&
            toIndex >= 0 &&
            toIndex < updated.length
          ) {
            const [removed] = updated.splice(fromIndex, 1);
            updated.splice(toIndex, 0, removed);
          }
          return { templates: updated };
        });
      }
    }),
    {
      name: "nodetool-node-templates",
      version: 1
    }
  )
);

export default useNodeTemplatesStore;
