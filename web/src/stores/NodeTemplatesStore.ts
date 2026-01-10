/**
 * NodeTemplatesStore
 *
 * Manages saved node templates for quick reuse.
 * Users can save a configured node's properties as a template,
 * then apply the template when creating new nodes of the same type.
 *
 * Features:
 * - Save templates from selected nodes
 * - Apply templates when creating new nodes
 * - Organize templates by node type
 * - Persist to localStorage for cross-session availability
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NodeTemplate {
  id: string;
  name: string;
  nodeType: string;
  properties: Record<string, unknown>;
  description: string;
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
    description?: string
  ) => Promise<string>;
  updateTemplate: (
    id: string,
    updates: Partial<Omit<NodeTemplate, "id" | "createdAt">>
  ) => void;
  deleteTemplate: (id: string) => void;
  getTemplatesForNodeType: (nodeType: string) => NodeTemplate[];
  getTemplateById: (id: string) => NodeTemplate | undefined;
  incrementUsage: (id: string) => void;
  clearAllTemplates: () => void;
  renameTemplate: (id: string, newName: string) => void;
}

const MAX_TEMPLATES_PER_NODE_TYPE = 20;
const MAX_TOTAL_TEMPLATES = 100;

export const useNodeTemplatesStore = create<NodeTemplatesStore>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: async (
        name: string,
        nodeType: string,
        properties: Record<string, unknown>,
        description = ""
      ): Promise<string> => {
        const id = crypto.randomUUID
          ? crypto.randomUUID()
          : `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        set((state) => {
          const newTemplate: NodeTemplate = {
            id,
            name,
            nodeType,
            properties,
            description,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            usageCount: 0,
          };

          const existingForType = state.templates.filter(
            (t) => t.nodeType === nodeType
          );

          if (existingForType.length >= MAX_TEMPLATES_PER_NODE_TYPE) {
            const oldest = existingForType
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(0, 1)[0];
            if (oldest) {
              return {
                templates: state.templates
                  .filter((t) => t.id !== oldest.id)
                  .concat(newTemplate),
              };
            }
          }

          if (state.templates.length >= MAX_TOTAL_TEMPLATES) {
            const oldest = state.templates
              .sort((a, b) => a.createdAt - b.createdAt)
              .slice(0, 1)[0];
            if (oldest) {
              return {
                templates: state.templates
                  .filter((t) => t.id !== oldest.id)
                  .concat(newTemplate),
              };
            }
          }

          return {
            templates: state.templates.concat(newTemplate),
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
          ),
        }));
      },

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id),
        }));
      },

      getTemplatesForNodeType: (nodeType) => {
        return get()
          .templates.filter((t) => t.nodeType === nodeType)
          .sort((a, b) => b.usageCount - a.usageCount || b.updatedAt - a.updatedAt);
      },

      getTemplateById: (id) => {
        return get().templates.find((template) => template.id === id);
      },

      incrementUsage: (id) => {
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? { ...template, usageCount: template.usageCount + 1 }
              : template
          ),
        }));
      },

      clearAllTemplates: () => {
        set({ templates: [] });
      },

      renameTemplate: (id, newName) => {
        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? { ...template, name: newName, updatedAt: Date.now() }
              : template
          ),
        }));
      },
    }),
    {
      name: "nodetool-node-templates",
      version: 1,
    }
  )
);

export default useNodeTemplatesStore;
