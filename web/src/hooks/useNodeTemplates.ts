/**
 * useNodeTemplates
 *
 * Hook for managing workflow node templates.
 * Provides operations for saving, loading, and manipulating node templates.
 *
 * @example
 * ```typescript
 * const { saveAsTemplate, insertTemplate, deleteTemplate, templates } = useNodeTemplates();
 *
 * // Save selected nodes as a template
 * saveAsTemplate({
 *   name: "Image Processor",
 *   description: "Common image processing pipeline",
 *   category: "image-processing",
 *   nodes: selectedNodes,
 *   edges: connectedEdges
 * });
 *
 * // Insert a template into the workflow
 * insertTemplate(templateId, { x: 100, y: 100 });
 * ```
 */

import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type { Edge, Node } from "@xyflow/react";
import { useNodeStoreRef, useNodes } from "../contexts/NodeContext";
import { useNodeTemplatesStore } from "../stores/NodeTemplatesStore";
import type { NodeData } from "../stores/NodeData";
import type { NodeTemplate, TemplateCategory } from "../stores/NodeTemplatesStore";

interface UseNodeTemplatesReturn {
  templates: NodeTemplate[];
  saveAsTemplate: (options: SaveTemplateOptions) => string | null;
  insertTemplate: (templateId: string, position: { x: number; y: number }) => void;
  deleteTemplate: (templateId: string) => void;
  updateTemplate: (templateId: string, updates: UpdateTemplateOptions) => void;
  exportTemplate: (templateId: string) => string | undefined;
  importTemplate: (templateJson: string) => boolean;
  getTemplate: (templateId: string) => NodeTemplate | undefined;
}

interface SaveTemplateOptions {
  name: string;
  description: string;
  category: TemplateCategory;
  nodes: Node<NodeData>[];
  edges: Edge[];
}

interface UpdateTemplateOptions {
  name?: string;
  description?: string;
  category?: TemplateCategory;
}

/**
 * Custom hook for managing workflow node templates.
 *
 * Provides functionality to save groups of nodes as reusable templates,
 * insert templates into workflows, and manage the template library.
 *
 * @returns Object containing template management functions and current templates
 *
 * @example
 * ```typescript
 * const { saveAsTemplate, insertTemplate, templates } = useNodeTemplates();
 *
 * // Save selected nodes as a template
 * const templateId = saveAsTemplate({
 *   name: "My Pipeline",
 *   description: "A common processing pipeline",
 *   category: "common",
 *   nodes: selectedNodes,
 *   edges: selectedEdges
 * });
 * ```
 */
export const useNodeTemplates = (): UseNodeTemplatesReturn => {
  // Use selective subscriptions to avoid unnecessary re-renders
  const templates = useNodeTemplatesStore((state) => state.templates);
  const addTemplate = useNodeTemplatesStore((state) => state.addTemplate);
  const updateTemplateStore = useNodeTemplatesStore((state) => state.updateTemplate);
  const deleteTemplateStore = useNodeTemplatesStore((state) => state.deleteTemplate);
  const getTemplate = useNodeTemplatesStore((state) => state.getTemplate);
  const exportTemplateStore = useNodeTemplatesStore((state) => state.exportTemplate);
  const importTemplateStore = useNodeTemplatesStore((state) => state.importTemplate);

  // Get store ref for insertTemplate
  const store = useNodeStoreRef();
  const setNodes = useNodes((state) => state.setNodes);
  const setEdges = useNodes((state) => state.setEdges);

  /**
   * Save selected nodes and their connections as a reusable template.
   *
   * @param options - Template configuration including name, description, category, nodes, and edges
   * @returns The ID of the created template, or null if creation failed
   */
  const saveAsTemplate = useCallback(
    (options: SaveTemplateOptions): string | null => {
      const { name, description, category, nodes, edges } = options;

      if (nodes.length === 0) {
        return null;
      }

      // Normalize node positions relative to top-left corner
      const minX = Math.min(...nodes.map((n) => n.position.x));
      const minY = Math.min(...nodes.map((n) => n.position.y));

      const normalizedNodes = nodes.map((node) => ({
        id: node.id,
        type: node.type || "default",
        position: {
          x: node.position.x - minX,
          y: node.position.y - minY
        },
        data: node.data
      }));

      // Get edges that connect only the selected nodes
      const selectedNodeIds = new Set(nodes.map((n) => n.id));
      const templateEdges = edges.filter(
        (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
      );

      const templateId = addTemplate({
        name,
        description,
        category,
        nodes: normalizedNodes,
        edges: templateEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle ?? undefined,
          targetHandle: edge.targetHandle ?? undefined
        }))
      });

      return templateId;
    },
    [addTemplate]
  );

  /**
   * Insert a template into the workflow at the specified position.
   *
   * @param templateId - The ID of the template to insert
   * @param position - The position where the template should be inserted (top-left corner)
   */
  const insertTemplate = useCallback(
    (templateId: string, position: { x: number; y: number }) => {
      const template = getTemplate(templateId);
      if (!template) {
        return;
      }

      const nodeIdMap: Record<string, string> = {};

      // Create new nodes with unique IDs
      const newNodes: Node<NodeData>[] = template.nodes.map((node) => {
        const newId = uuidv4();
        nodeIdMap[node.id] = newId;

        return {
          id: newId,
          type: node.type,
          position: {
            x: node.position.x + position.x,
            y: node.position.y + position.y
          },
          data: { ...node.data },
          selected: false
        };
      });

      // Create new edges with updated source/target IDs
      const newEdges: Edge[] = template.edges.map((edge) => ({
        id: uuidv4(),
        source: nodeIdMap[edge.source] || edge.source,
        target: nodeIdMap[edge.target] || edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle
      }));

      // Get current state and add new nodes/edges
      const { nodes: currentNodes, edges: currentEdges } = store.getState();

      setNodes([...currentNodes, ...newNodes]);
      setEdges([...currentEdges, ...newEdges]);
    },
    [getTemplate, store, setNodes, setEdges]
  );

  /**
   * Delete a template from the library.
   *
   * @param templateId - The ID of the template to delete
   */
  const deleteTemplate = useCallback(
    (templateId: string) => {
      deleteTemplateStore(templateId);
    },
    [deleteTemplateStore]
  );

  /**
   * Update template metadata.
   *
   * @param templateId - The ID of the template to update
   * @param updates - The fields to update (name, description, category)
   */
  const updateTemplate = useCallback(
    (templateId: string, updates: UpdateTemplateOptions) => {
      updateTemplateStore(templateId, updates);
    },
    [updateTemplateStore]
  );

  /**
   * Export a template as JSON for sharing.
   *
   * @param templateId - The ID of the template to export
   * @returns JSON string of the template, or undefined if not found
   */
  const exportTemplate = useCallback(
    (templateId: string): string | undefined => {
      return exportTemplateStore(templateId);
    },
    [exportTemplateStore]
  );

  /**
   * Import a template from JSON.
   *
   * @param templateJson - JSON string of the template
   * @returns true if import was successful, false otherwise
   */
  const importTemplate = useCallback(
    (templateJson: string): boolean => {
      const result = importTemplateStore(templateJson);
      return result !== null;
    },
    [importTemplateStore]
  );

  return {
    templates,
    saveAsTemplate,
    insertTemplate,
    deleteTemplate,
    updateTemplate,
    exportTemplate,
    importTemplate,
    getTemplate
  };
};

export default useNodeTemplates;
