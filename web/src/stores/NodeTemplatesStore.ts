/**
 * NodeTemplatesStore
 *
 * Persists user-created node templates for quick access.
 * Templates store pre-configured property values for frequently used node configurations.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export interface NodeTemplate {
  id: string;
  name: string;
  description?: string;
  nodeType: string;
  properties: Record<string, unknown>;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

interface NodeTemplatesStore {
  templates: NodeTemplate[];
  addTemplate: (
    name: string,
    nodeType: string,
    properties: Record<string, unknown>,
    description?: string,
    tags?: string[]
  ) => string;
  updateTemplate: (
    id: string,
    updates: Partial<Omit<NodeTemplate, "id" | "nodeType" | "createdAt">>
  ) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => NodeTemplate | undefined;
  getTemplatesForNodeType: (nodeType: string) => NodeTemplate[];
  incrementUsage: (id: string) => void;
  clearTemplates: () => void;
  reorderTemplates: (fromIndex: number, toIndex: number) => void;
}

const MAX_TEMPLATES = 50;

export const useNodeTemplatesStore = create<NodeTemplatesStore>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (
        name: string,
        nodeType: string,
        properties: Record<string, unknown>,
        description?: string,
        tags: string[] = []
      ): string => {
        const id = uuidv4();
        const now = Date.now();

        set((state) => {
          const newTemplate: NodeTemplate = {
            id,
            name,
            description,
            nodeType,
            properties,
            tags,
            createdAt: now,
            updatedAt: now,
            usageCount: 0
          };

          return {
            templates: [newTemplate, ...state.templates].slice(0, MAX_TEMPLATES)
          };
        });

        return id;
      },

      updateTemplate: (
        id: string,
        updates: Partial<Omit<NodeTemplate, "id" | "nodeType" | "createdAt">>
      ) => {
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? { ...template, ...updates, updatedAt: Date.now() }
              : template
          )
        }));
      },

      deleteTemplate: (id: string) => {
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id)
        }));
      },

      getTemplate: (id: string) => {
        return get().templates.find((template) => template.id === id);
      },

      getTemplatesForNodeType: (nodeType: string) => {
        return get().templates
          .filter((template) => template.nodeType === nodeType)
          .sort((a, b) => b.usageCount - a.usageCount);
      },

      incrementUsage: (id: string) => {
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? { ...template, usageCount: template.usageCount + 1 }
              : template
          )
        }));
      },

      clearTemplates: () => {
        set({ templates: [] });
      },

      reorderTemplates: (fromIndex: number, toIndex: number) => {
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
