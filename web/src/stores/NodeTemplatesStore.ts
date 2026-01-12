/**
 * NodeTemplatesStore
 *
 * Manages user-defined node templates for quick workflow creation.
 * Templates store selected nodes with their configurations for reuse.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import { NodeData } from "./NodeData";

export interface NodeTemplate {
  id: string;
  name: string;
  description?: string;
  nodes: Array<{
    id: string;
    type: string;
    data: NodeData;
    position: { x: number; y: number };
    relativePositions: boolean;
  }>;
  createdAt: number;
  updatedAt: number;
}

interface NodeTemplatesStoreState {
  templates: NodeTemplate[];
  addTemplate: (name: string, description: string | undefined, nodes: Node<NodeData>[]) => string;
  updateTemplate: (id: string, name: string, description: string | undefined, nodes: Node<NodeData>[]) => void;
  deleteTemplate: (id: string) => void;
  getTemplates: () => NodeTemplate[];
  getTemplate: (id: string) => NodeTemplate | undefined;
}

export const useNodeTemplatesStore = create<NodeTemplatesStoreState>()(
  persist(
    (set, get) => ({
      templates: [],

      addTemplate: (name: string, description: string | undefined, nodes: Node<NodeData>[]) => {
        const templateId = uuidv4();
        
        const minX = Math.min(...nodes.map((n) => n.position.x));
        const minY = Math.min(...nodes.map((n) => n.position.y));
        
        const templateNodes = nodes.map((node) => ({
          id: uuidv4(),
          type: node.type ?? "default",
          data: { ...node.data },
          position: {
            x: node.position.x - minX,
            y: node.position.y - minY
          },
          relativePositions: true
        }));

        set((state) => ({
          templates: [
            ...state.templates,
            {
              id: templateId,
              name,
              description,
              nodes: templateNodes,
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ]
        }));
        
        return templateId;
      },

      updateTemplate: (id: string, name: string, description: string | undefined, nodes: Node<NodeData>[]) => {
        const minX = Math.min(...nodes.map((n) => n.position.x));
        const minY = Math.min(...nodes.map((n) => n.position.y));
        
        const templateNodes = nodes.map((node) => ({
          id: uuidv4(),
          type: node.type ?? "default",
          data: { ...node.data },
          position: {
            x: node.position.x - minX,
            y: node.position.y - minY
          },
          relativePositions: true
        }));

        set((state) => ({
          templates: state.templates.map((template) =>
            template.id === id
              ? {
                  ...template,
                  name,
                  description,
                  nodes: templateNodes,
                  updatedAt: Date.now()
                }
              : template
          )
        }));
      },

      deleteTemplate: (id: string) => {
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id)
        }));
      },

      getTemplates: () => {
        return get().templates;
      },

      getTemplate: (id: string) => {
        return get().templates.find((template) => template.id === id);
      }
    }),
    {
      name: "nodetool-node-templates",
      version: 1
    }
  )
);
