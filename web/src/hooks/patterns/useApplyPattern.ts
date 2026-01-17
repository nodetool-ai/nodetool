import { useCallback } from 'react';
import { usePatternStore } from '../../stores/research/PatternStore';
import { useNodeStore } from '../../stores/NodeStore';
import { Node } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

const getNodeStoreState = () => useNodeStore.getState();

export const useApplyPattern = () => {
  const getPatternById = usePatternStore((state) => state.getPatternById);
  const incrementUsage = usePatternStore((state) => state.incrementUsage);

  const nodeStoreState = getNodeStoreState();
  const addNode = nodeStoreState.addNode;
  const addEdgeStore = nodeStoreState.addEdge;
  const generateNodeId = nodeStoreState.generateNodeId;

  const applyPattern = useCallback(
    (patternId: string, position?: { x: number; y: number }) => {
      const pattern = getPatternById(patternId);
      if (!pattern) {
        throw new Error('Pattern not found');
      }

      const nodeIdMap = new Map<string, string>();
      const offsetX = position?.x ?? 200;
      const offsetY = position?.y ?? 200;

      pattern.nodes.forEach((node) => {
        const newId = generateNodeId();
        nodeIdMap.set(node.id, newId);
        addNode({
          id: newId,
          type: node.type,
          position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
          },
          data: node.data,
          selected: false,
          dragging: false,
        } as Node);
      });

      pattern.edges.forEach((edge) => {
        addEdgeStore({
          id: `e-${uuidv4()}`,
          source: nodeIdMap.get(edge.source) || edge.source,
          target: nodeIdMap.get(edge.target) || edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          selected: false,
        });
      });

      incrementUsage(patternId);
    },
    [getPatternById, incrementUsage, generateNodeId, addNode, addEdgeStore]
  );

  return applyPattern;
};
