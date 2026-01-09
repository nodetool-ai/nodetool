/**
 * NodeGroupTemplateStore
 *
 * Manages node group templates for quick insertion into workflows.
 * Templates store a group of connected nodes with their configuration
 * that can be reused across different workflows.
 * Persists to localStorage for cross-session availability.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Node, Edge } from "@xyflow/react";
import { NodeData } from "./NodeData";
import { v4 as uuidv4 } from "uuid";

export interface NodeGroupTemplateNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  targetPosition?: "left" | "right" | "top" | "bottom";
  sourcePosition?: "left" | "right" | "top" | "bottom";
  selected?: boolean;
  draggable?: boolean;
  connectable?: boolean;
}

export interface NodeGroupTemplateEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string;
  animated?: boolean;
  style?: React.CSSProperties;
}

export interface NodeGroupTemplate {
  id: string;
  name: string;
  description?: string;
  nodes: NodeGroupTemplateNode[];
  edges: NodeGroupTemplateEdge[];
  createdAt: number;
  updatedAt: number;
  usageCount: number;
}

interface NodeGroupTemplateStore {
  templates: NodeGroupTemplate[];
  isDialogOpen: boolean;
  insertPosition: { x: number; y: number } | null;

  addTemplate: (template: Omit<NodeGroupTemplate, "id" | "createdAt" | "updatedAt" | "usageCount">) => string;
  updateTemplate: (id: string, updates: Partial<Omit<NodeGroupTemplate, "id" | "createdAt">>) => void;
  deleteTemplate: (id: string) => void;
  getTemplate: (id: string) => NodeGroupTemplate | undefined;
  getTemplates: () => NodeGroupTemplate[];
  incrementUsageCount: (id: string) => void;

  setDialogOpen: (open: boolean) => void;
  setInsertPosition: (position: { x: number; y: number } | null) => void;

  createTemplateFromSelection: (
    name: string,
    description: string,
    nodes: Node<NodeData>[],
    edges: Edge[]
  ) => string;
}

export const useNodeGroupTemplateStore = create<NodeGroupTemplateStore>()(
  persist(
    (set, get) => ({
      templates: [],

      isDialogOpen: false,
      insertPosition: null,

      addTemplate: (templateData) => {
        const id = `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = Date.now();
        const template: NodeGroupTemplate = {
          ...templateData,
          id,
          createdAt: now,
          updatedAt: now,
          usageCount: 0
        };

        set((state) => ({
          templates: [template, ...state.templates]
        }));

        return id;
      },

      updateTemplate: (id, updates) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? { ...t, ...updates, updatedAt: Date.now() }
              : t
          )
        }));
      },

      deleteTemplate: (id) => {
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== id)
        }));
      },

      getTemplate: (id) => {
        return get().templates.find((t) => t.id === id);
      },

      getTemplates: () => {
        return get().templates;
      },

      incrementUsageCount: (id) => {
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id ? { ...t, usageCount: t.usageCount + 1 } : t
          )
        }));
      },

      setDialogOpen: (open) => {
        set({ isDialogOpen: open });
      },

      setInsertPosition: (position) => {
        set({ insertPosition: position });
      },

      createTemplateFromSelection: (name, description, nodes, edges) => {
        const idMapping = new Map<string, string>();
        nodes.forEach((node) => {
          idMapping.set(node.id, uuidv4());
        });

        const templateNodes: NodeGroupTemplateNode[] = nodes.map((node) => ({
          id: idMapping.get(node.id)!,
          type: node.type ?? "default",
          position: { x: node.position.x, y: node.position.y },
          data: { ...node.data },
          targetPosition: node.targetPosition,
          sourcePosition: node.sourcePosition,
          selected: false,
          draggable: node.draggable,
          connectable: node.connectable
        }));

        const templateEdges: NodeGroupTemplateEdge[] = edges.map((edge) => ({
          id: uuidv4(),
          source: idMapping.get(edge.source)!,
          target: idMapping.get(edge.target)!,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          type: edge.type,
          animated: edge.animated,
          style: edge.style
        }));

        const minX = Math.min(...templateNodes.map((n) => n.position.x));
        const minY = Math.min(...templateNodes.map((n) => n.position.y));

        templateNodes.forEach((node) => {
          node.position.x -= minX;
          node.position.y -= minY;
        });

        return get().addTemplate({
          name,
          description,
          nodes: templateNodes,
          edges: templateEdges
        });
      }
    }),
    {
      name: "nodetool-node-group-templates",
      version: 1
    }
  )
);

export default useNodeGroupTemplateStore;
