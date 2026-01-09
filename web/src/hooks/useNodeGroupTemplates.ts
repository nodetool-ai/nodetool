import { useCallback } from "react";
import { Node, Edge, useReactFlow, Position } from "@xyflow/react";
import { v4 as uuidv4 } from "uuid";
import { useNodeGroupTemplateStore, NodeGroupTemplate } from "../stores/NodeGroupTemplateStore";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";

interface UseNodeGroupTemplatesReturn {
  templates: NodeGroupTemplate[];
  saveTemplate: (name: string, description: string) => string | null;
  insertTemplate: (templateId: string, position?: { x: number; y: number }) => void;
  deleteTemplate: (templateId: string) => void;
  updateTemplate: (templateId: string, updates: Partial<NodeGroupTemplate>) => void;
  getTemplate: (templateId: string) => NodeGroupTemplate | undefined;
  openTemplateDialog: () => void;
  closeTemplateDialog: () => void;
  isDialogOpen: boolean;
}

export const useNodeGroupTemplates = (): UseNodeGroupTemplatesReturn => {
  const {
    templates,
    createTemplateFromSelection,
    deleteTemplate: removeTemplate,
    updateTemplate: modifyTemplate,
    getTemplate,
    setDialogOpen,
    isDialogOpen,
    incrementUsageCount
  } = useNodeGroupTemplateStore();

  const { nodes, edges, setNodes, setEdges, getSelectedNodes, generateNodeIds } = useNodes(
    (state) => ({
      nodes: state.nodes,
      edges: state.edges,
      setNodes: state.setNodes,
      setEdges: state.setEdges,
      getSelectedNodes: state.getSelectedNodes,
      generateNodeIds: state.generateNodeIds
    })
  );

  const { screenToFlowPosition, getViewport } = useReactFlow();

  const saveTemplate = useCallback(
    (name: string, description: string): string | null => {
      const selectedNodes = getSelectedNodes();

      if (selectedNodes.length === 0) {
        return null;
      }

      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      const connectedEdges = edges.filter(
        (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
      );

      return createTemplateFromSelection(name, description, selectedNodes, connectedEdges);
    },
    [createTemplateFromSelection, getSelectedNodes, edges]
  );

  const insertTemplate = useCallback(
    (templateId: string, position?: { x: number; y: number }) => {
      const template = getTemplate(templateId);
      if (!template) return;

      incrementUsageCount(templateId);

      const idMapping = new Map<string, string>();
      const newIds = generateNodeIds(template.nodes.length);
      template.nodes.forEach((node, index) => {
        idMapping.set(node.id, newIds[index]);
      });

      const insertX = position?.x ?? 100;
      const insertY = position?.y ?? 100;

      const newNodes: Node<NodeData>[] = template.nodes.map((node) => ({
        ...node,
        id: idMapping.get(node.id)!,
        type: node.type,
        position: {
          x: node.position.x + insertX,
          y: node.position.y + insertY
        },
        sourcePosition: node.sourcePosition as Position | undefined,
        targetPosition: node.targetPosition as Position | undefined,
        data: {
          ...node.data,
          positionAbsolute: {
            x: node.position.x + insertX,
            y: node.position.y + insertY
          }
        },
        selected: false,
        dragging: false
      }));

      const newEdges: Edge[] = template.edges
        .filter((edge) => idMapping.has(edge.source) && idMapping.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: uuidv4(),
          source: idMapping.get(edge.source)!,
          target: idMapping.get(edge.target)!
        }));

      setNodes([...nodes, ...newNodes]);
      setEdges([...edges, ...newEdges]);
    },
    [getTemplate, generateNodeIds, nodes, edges, setNodes, setEdges, incrementUsageCount]
  );

  const deleteTemplate = useCallback(
    (templateId: string) => {
      removeTemplate(templateId);
    },
    [removeTemplate]
  );

  const updateTemplate = useCallback(
    (templateId: string, updates: Partial<NodeGroupTemplate>) => {
      modifyTemplate(templateId, updates);
    },
    [modifyTemplate]
  );

  const openTemplateDialog = useCallback(() => {
    setDialogOpen(true);
  }, [setDialogOpen]);

  const closeTemplateDialog = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);

  return {
    templates,
    saveTemplate,
    insertTemplate,
    deleteTemplate,
    updateTemplate,
    getTemplate,
    openTemplateDialog,
    closeTemplateDialog,
    isDialogOpen
  };
};

export default useNodeGroupTemplates;
