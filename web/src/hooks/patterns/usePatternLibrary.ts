import { useCallback, useMemo } from 'react';
import { usePatternStore, WorkflowPattern, PatternNode, PatternEdge } from '../../stores/research/PatternStore';
import { useNodeStore } from '../../stores/NodeStore';
import { Node, Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';

const getNodeStoreState = () => useNodeStore.getState();

export const usePatternLibrary = (): UsePatternLibraryReturn => {
  const { patterns, selectedPatternId, searchQuery, addPattern: storeAddPattern, duplicatePattern, deletePattern, selectPattern, setSearchQuery, getPatternById, searchPatterns } = usePatternStore();

  const nodeStoreState = useMemo(() => getNodeStoreState(), []);
  const nodes = nodeStoreState.nodes;
  const edges = nodeStoreState.edges;
  const generateNodeId = nodeStoreState.generateNodeId;

  const selectedPattern = useMemo(
    () => (selectedPatternId ? getPatternById(selectedPatternId) ?? null : null),
    [selectedPatternId, getPatternById]
  );

  const filteredPatterns = useMemo(() => {
    if (!searchQuery.trim()) {
      return patterns.sort((a, b) => b.usageCount - a.usageCount);
    }
    return searchPatterns(searchQuery);
  }, [patterns, searchQuery, searchPatterns]);

  const getCategories = useCallback(() => {
    const categories = new Set(patterns.map((p) => p.category));
    return Array.from(categories).sort();
  }, [patterns]);

  const createPatternFromSelection = useCallback(
    (name: string, description: string, category: string, tags: string[]) => {
      const selectedNodes = nodes.filter((n: Node) => n.selected);
      if (selectedNodes.length === 0) {
        throw new Error('No nodes selected');
      }

      const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
      const selectedEdges = edges.filter((e: Edge) => selectedNodeIds.has(e.source) && selectedNodeIds.has(e.target));

      const nodeIdMap = new Map<string, string>();
      const newNodes: PatternNode[] = selectedNodes.map((node: Node) => {
        const newId = uuidv4();
        nodeIdMap.set(node.id, newId);
        return {
          id: newId,
          type: node.type,
          position: { x: node.position.x, y: node.position.y },
          data: node.data as Record<string, unknown>,
        };
      });

      const newEdges: PatternEdge[] = selectedEdges.map((edge: Edge) => ({
        id: uuidv4(),
        source: nodeIdMap.get(edge.source) || edge.source,
        target: nodeIdMap.get(edge.target) || edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      }));

      const patternId = storeAddPattern({
        name,
        description,
        category,
        tags,
        nodes: newNodes,
        edges: newEdges,
      });

      return patternId;
    },
    [nodes, edges, storeAddPattern]
  );

  const applyPattern = useCallback(
    (patternId: string, position?: { x: number; y: number }): { nodes: Node[]; edges: Edge[] } => {
      const pattern = getPatternById(patternId);
      if (!pattern) {
        throw new Error('Pattern not found');
      }

      const nodeIdMap = new Map<string, string>();
      const offsetX = position?.x ?? 200;
      const offsetY = position?.y ?? 200;

      const newNodes: Node[] = pattern.nodes.map((node) => {
        const newId = generateNodeId();
        nodeIdMap.set(node.id, newId);
        return {
          id: newId,
          type: node.type,
          position: {
            x: node.position.x + offsetX,
            y: node.position.y + offsetY,
          },
          data: node.data,
          selected: false,
          dragging: false,
        } as Node;
      });

      const newEdges: Edge[] = pattern.edges.map((edge) => ({
        id: `e-${uuidv4()}`,
        source: nodeIdMap.get(edge.source) || edge.source,
        target: nodeIdMap.get(edge.target) || edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
        selected: false,
      }));

      return { nodes: newNodes, edges: newEdges };
    },
    [generateNodeId, getPatternById]
  );

  return {
    patterns,
    selectedPattern,
    searchQuery,
    setSearchQuery,
    addPattern: storeAddPattern,
    duplicatePattern,
    deletePattern,
    applyPattern,
    createPatternFromSelection,
    getCategories,
    filteredPatterns,
  };
};
