import { computeWorkflowDiff } from '../algorithm';
import type { Node, Edge } from '@xyflow/react';

describe('WorkflowDiff', () => {
  const createNode = (id: string, x: number, y: number, data?: Record<string, unknown>): Node => ({
    id,
    type: 'default',
    position: { x, y },
    data: data || { label: `Node ${id}` },
    width: 150,
    height: 50,
    selected: false,
    dragging: false,
  });

  const createEdge = (id: string, source: string, target: string, label?: string): Edge => ({
    id,
    source,
    target,
    label,
    type: 'default',
    sourceHandle: null,
    targetHandle: null,
    animated: false,
    selected: false,
  });

  describe('computeWorkflowDiff', () => {
    it('should detect added nodes', () => {
      const oldNodes: Node[] = [createNode('1', 0, 0)];
      const newNodes: Node[] = [createNode('1', 0, 0), createNode('2', 100, 100)];

      const diff = computeWorkflowDiff(oldNodes, [], newNodes, []);

      expect(diff.addedNodes).toHaveLength(1);
      expect(diff.addedNodes[0].nodeId).toBe('2');
      expect(diff.summary.nodesAdded).toBe(1);
    });

    it('should detect removed nodes', () => {
      const oldNodes: Node[] = [createNode('1', 0, 0), createNode('2', 100, 100)];
      const newNodes: Node[] = [createNode('1', 0, 0)];

      const diff = computeWorkflowDiff(oldNodes, [], newNodes, []);

      expect(diff.removedNodes).toHaveLength(1);
      expect(diff.removedNodes[0].nodeId).toBe('2');
      expect(diff.summary.nodesRemoved).toBe(1);
    });

    it('should detect modified nodes (position change)', () => {
      const oldNodes: Node[] = [createNode('1', 0, 0)];
      const newNodes: Node[] = [createNode('1', 100, 200)];

      const diff = computeWorkflowDiff(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].nodeId).toBe('1');
      expect(diff.modifiedNodes[0].changes?.position).toEqual({
        old: { x: 0, y: 0 },
        new: { x: 100, y: 200 },
      });
    });

    it('should detect modified nodes (data change)', () => {
      const oldNodes: Node[] = [createNode('1', 0, 0, { label: 'Old Label', value: 10 })];
      const newNodes: Node[] = [createNode('1', 0, 0, { label: 'New Label', value: 20 })];

      const diff = computeWorkflowDiff(oldNodes, [], newNodes, []);

      expect(diff.modifiedNodes).toHaveLength(1);
      expect(diff.modifiedNodes[0].changes?.label).toEqual({
        old: 'Old Label',
        new: 'New Label',
      });
    });

    it('should detect unchanged nodes', () => {
      const oldNodes: Node[] = [createNode('1', 0, 0)];
      const newNodes: Node[] = [createNode('1', 0, 0)];

      const diff = computeWorkflowDiff(oldNodes, [], newNodes, []);

      expect(diff.unchangedNodes).toHaveLength(1);
      expect(diff.unchangedNodes[0].nodeId).toBe('1');
    });

    it('should detect added edges', () => {
      const oldEdges: Edge[] = [];
      const newEdges: Edge[] = [createEdge('e1', '1', '2')];

      const diff = computeWorkflowDiff([], oldEdges, [], newEdges);

      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.addedEdges[0].edgeId).toBe('e1');
      expect(diff.summary.edgesAdded).toBe(1);
    });

    it('should detect removed edges', () => {
      const oldEdges: Edge[] = [createEdge('e1', '1', '2')];
      const newEdges: Edge[] = [];

      const diff = computeWorkflowDiff([], oldEdges, [], newEdges);

      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.removedEdges[0].edgeId).toBe('e1');
      expect(diff.summary.edgesRemoved).toBe(1);
    });

    it('should detect modified edges (source change)', () => {
      const oldEdges: Edge[] = [createEdge('e1', '1', '2')];
      const newEdges: Edge[] = [createEdge('e1', '3', '2')];

      const diff = computeWorkflowDiff([], oldEdges, [], newEdges);

      expect(diff.modifiedEdges).toHaveLength(1);
      expect(diff.modifiedEdges[0].changes?.source).toEqual({
        old: '1',
        new: '3',
      });
    });

    it('should handle empty workflows', () => {
      const diff = computeWorkflowDiff([], [], [], []);

      expect(diff.addedNodes).toHaveLength(0);
      expect(diff.removedNodes).toHaveLength(0);
      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.addedEdges).toHaveLength(0);
      expect(diff.removedEdges).toHaveLength(0);
      expect(diff.modifiedEdges).toHaveLength(0);
    });

    it('should handle complete workflow replacement', () => {
      const oldNodes: Node[] = [
        createNode('1', 0, 0),
        createNode('2', 100, 100),
      ];
      const oldEdges: Edge[] = [createEdge('e1', '1', '2')];

      const newNodes: Node[] = [
        createNode('3', 200, 200),
        createNode('4', 300, 300),
      ];
      const newEdges: Edge[] = [createEdge('e2', '3', '4')];

      const diff = computeWorkflowDiff(oldNodes, oldEdges, newNodes, newEdges);

      expect(diff.removedNodes).toHaveLength(2);
      expect(diff.addedNodes).toHaveLength(2);
      expect(diff.removedEdges).toHaveLength(1);
      expect(diff.addedEdges).toHaveLength(1);
      expect(diff.modifiedNodes).toHaveLength(0);
      expect(diff.modifiedEdges).toHaveLength(0);
    });
  });
});
