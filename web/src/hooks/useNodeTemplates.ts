import { useCallback } from "react";
import { Node } from "@xyflow/react";
import { useNodeTemplatesStore, NodeTemplate } from "../stores/NodeTemplatesStore";
import { useNodes } from "../contexts/NodeContext";
import { NodeData } from "../stores/NodeData";

interface UseNodeTemplatesReturn {
  saveSelectedAsTemplate: (name: string, description?: string) => string | null;
  applyTemplate: (template: NodeTemplate, position: { x: number; y: number }) => void;
  updateTemplate: (id: string, name: string, description?: string) => void;
  deleteTemplate: (id: string) => void;
  getTemplates: () => NodeTemplate[];
}

export const useNodeTemplates = (): UseNodeTemplatesReturn => {
  const { addTemplate, updateTemplate: storeUpdateTemplate, deleteTemplate: storeDeleteTemplate, getTemplates } = useNodeTemplatesStore();
  const getSelectedNodes = useNodes((state) => state.getSelectedNodes);
  const { setNodes, generateNodeIds } = useNodes((state) => ({
    setNodes: state.setNodes,
    generateNodeIds: state.generateNodeIds
  }));

  const saveSelectedAsTemplate = useCallback((name: string, description?: string): string | null => {
    const selectedNodes = getSelectedNodes();
    
    if (selectedNodes.length === 0) {
      return null;
    }

    return addTemplate(name, description, selectedNodes);
  }, [getSelectedNodes, addTemplate]);

  const applyTemplate = useCallback((template: NodeTemplate, position: { x: number; y: number }) => {
    const nodeCount = template.nodes.length;
    const newIds = generateNodeIds(nodeCount);

    const newNodes: Node<NodeData>[] = template.nodes.map((templateNode, index) => {
      const newId = newIds[index];
      return {
        id: newId,
        type: templateNode.type,
        position: {
          x: position.x + templateNode.position.x,
          y: position.y + templateNode.position.y
        },
        data: templateNode.data,
        selected: true,
        dragging: false
      } as Node<NodeData>;
    });

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      ...newNodes
    ]);
  }, [generateNodeIds, setNodes]);

  const updateTemplate = useCallback((id: string, name: string, description?: string) => {
    const selectedNodes = getSelectedNodes();
    
    if (selectedNodes.length === 0) {
      return;
    }

    storeUpdateTemplate(id, name, description, selectedNodes);
  }, [getSelectedNodes, storeUpdateTemplate]);

  const deleteTemplateCallback = useCallback((id: string) => {
    storeDeleteTemplate(id);
  }, [storeDeleteTemplate]);

  return {
    saveSelectedAsTemplate,
    applyTemplate,
    updateTemplate,
    deleteTemplate: deleteTemplateCallback,
    getTemplates
  };
};

export default useNodeTemplates;
