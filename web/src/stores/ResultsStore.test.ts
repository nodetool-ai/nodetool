import { renderHook, act } from '@testing-library/react';
import useResultsStore, { hashKey } from './ResultsStore';

describe('ResultsStore', () => {
  beforeEach(() => {
    useResultsStore.setState(useResultsStore.getInitialState());
  });

  describe('hashKey', () => {
    it('creates correct composite key', () => {
      expect(hashKey('workflow1', 'node1')).toBe('workflow1:node1');
      expect(hashKey('wf-123', 'node-456')).toBe('wf-123:node-456');
    });
  });

  describe('Initial State', () => {
    it('initializes with empty results', () => {
      const { result } = renderHook(() => useResultsStore());
      expect(result.current.results).toEqual({});
      expect(result.current.outputResults).toEqual({});
      expect(result.current.progress).toEqual({});
      expect(result.current.chunks).toEqual({});
      expect(result.current.tasks).toEqual({});
      expect(result.current.toolCalls).toEqual({});
      expect(result.current.edges).toEqual({});
      expect(result.current.planningUpdates).toEqual({});
      expect(result.current.previews).toEqual({});
    });
  });

  describe('setResult and getResult', () => {
    it('sets and gets a result for a node', () => {
      const { result } = renderHook(() => useResultsStore());
      const testResult = { data: 'test', value: 42 };

      act(() => {
        result.current.setResult('workflow1', 'node1', testResult);
      });

      expect(result.current.getResult('workflow1', 'node1')).toEqual(testResult);
    });

    it('appends to array when append is true and existing result is array', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('workflow1', 'node1', 'first', true);
        result.current.setResult('workflow1', 'node1', 'second', true);
      });

      expect(result.current.getResult('workflow1', 'node1')).toEqual(['first', 'second']);
    });

    it('creates array when append is true and existing result is not array', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('workflow1', 'node1', 'first');
        result.current.setResult('workflow1', 'node1', 'second', true);
      });

      expect(result.current.getResult('workflow1', 'node1')).toEqual(['first', 'second']);
    });

    it('stores results for different workflows separately', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('workflow1', 'node1', { data: 'wf1-node1' });
        result.current.setResult('workflow2', 'node1', { data: 'wf2-node1' });
      });

      expect(result.current.getResult('workflow1', 'node1')).toEqual({ data: 'wf1-node1' });
      expect(result.current.getResult('workflow2', 'node1')).toEqual({ data: 'wf2-node1' });
    });
  });

  describe('setOutputResult and getOutputResult', () => {
    it('sets and gets output results', () => {
      const { result } = renderHook(() => useResultsStore());
      const outputResult = { output: 'test output' };

      act(() => {
        result.current.setOutputResult('workflow1', 'node1', outputResult);
      });

      expect(result.current.getOutputResult('workflow1', 'node1')).toEqual(outputResult);
    });

    it('appends output results correctly', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setOutputResult('workflow1', 'node1', 'first', true);
        result.current.setOutputResult('workflow1', 'node1', 'second', true);
      });

      expect(result.current.getOutputResult('workflow1', 'node1')).toEqual(['first', 'second']);
    });
  });

  describe('deleteResult', () => {
    it('deletes a specific result', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('workflow1', 'node1', { data: 'test' });
        result.current.setResult('workflow1', 'node2', { data: 'test2' });
        result.current.deleteResult('workflow1', 'node1');
      });

      expect(result.current.getResult('workflow1', 'node1')).toBeUndefined();
      expect(result.current.getResult('workflow1', 'node2')).toEqual({ data: 'test2' });
    });
  });

  describe('clearResults', () => {
    it('clears all results for a workflow', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('workflow1', 'node1', { data: 'test' });
        result.current.setResult('workflow1', 'node2', { data: 'test2' });
        result.current.setResult('workflow2', 'node1', { data: 'test3' });
        result.current.clearResults('workflow1');
      });

      expect(result.current.getResult('workflow1', 'node1')).toBeUndefined();
      expect(result.current.getResult('workflow1', 'node2')).toBeUndefined();
      expect(result.current.getResult('workflow2', 'node1')).toEqual({ data: 'test3' });
    });
  });

  describe('clearOutputResults', () => {
    it('clears output results for a workflow', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setOutputResult('workflow1', 'node1', 'output1');
        result.current.setOutputResult('workflow2', 'node1', 'output2');
        result.current.clearOutputResults('workflow1');
      });

      expect(result.current.getOutputResult('workflow1', 'node1')).toBeUndefined();
      expect(result.current.getOutputResult('workflow2', 'node1')).toEqual('output2');
    });
  });

  describe('Progress Tracking', () => {
    describe('setProgress and getProgress', () => {
      it('sets and gets progress', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setProgress('workflow1', 'node1', 50, 100);
        });

        expect(result.current.getProgress('workflow1', 'node1')).toEqual({
          progress: 50,
          total: 100,
          chunk: ''
        });
      });

      it('accumulates chunks in progress', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setProgress('workflow1', 'node1', 25, 100, 'chunk1');
          result.current.setProgress('workflow1', 'node1', 50, 100, 'chunk2');
        });

        expect(result.current.getProgress('workflow1', 'node1')).toEqual({
          progress: 50,
          total: 100,
          chunk: 'chunk1chunk2'
        });
      });
    });

    describe('clearProgress', () => {
      it('clears progress for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setProgress('workflow1', 'node1', 50, 100);
          result.current.setProgress('workflow2', 'node1', 75, 100);
          result.current.clearProgress('workflow1');
        });

        expect(result.current.getProgress('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getProgress('workflow2', 'node1')).toEqual({
          progress: 75,
          total: 100,
          chunk: ''
        });
      });
    });

    describe('addChunk and getChunk', () => {
      it('adds chunks and retrieves them', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.addChunk('workflow1', 'node1', 'chunk1');
          result.current.addChunk('workflow1', 'node1', 'chunk2');
        });

        expect(result.current.getChunk('workflow1', 'node1')).toBe('chunk1chunk2');
      });

      it('handles different workflows separately', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.addChunk('workflow1', 'node1', 'wf1-data');
          result.current.addChunk('workflow2', 'node1', 'wf2-data');
        });

        expect(result.current.getChunk('workflow1', 'node1')).toBe('wf1-data');
        expect(result.current.getChunk('workflow2', 'node1')).toBe('wf2-data');
      });
    });

    describe('clearChunks', () => {
      it('clears chunks for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.addChunk('workflow1', 'node1', 'chunk1');
          result.current.addChunk('workflow2', 'node1', 'chunk2');
          result.current.clearChunks('workflow1');
        });

        expect(result.current.getChunk('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getChunk('workflow2', 'node1')).toBe('chunk2');
      });
    });
  });

  describe('Edge Status', () => {
    describe('setEdge and getEdge', () => {
      it('sets and gets edge status', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setEdge('workflow1', 'edge1', 'running');
        });

        expect(result.current.getEdge('workflow1', 'edge1')).toEqual({ status: 'running' });
      });

      it('preserves counter when updating status without counter', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setEdge('workflow1', 'edge1', 'running', 5);
          result.current.setEdge('workflow1', 'edge1', 'completed');
        });

        expect(result.current.getEdge('workflow1', 'edge1')).toEqual({ status: 'completed', counter: 5 });
      });

      it('updates counter when provided', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setEdge('workflow1', 'edge1', 'running', 5);
          result.current.setEdge('workflow1', 'edge1', 'completed', 10);
        });

        expect(result.current.getEdge('workflow1', 'edge1')).toEqual({ status: 'completed', counter: 10 });
      });
    });

    describe('clearEdges', () => {
      it('clears edges for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setEdge('workflow1', 'edge1', 'running');
          result.current.setEdge('workflow2', 'edge1', 'running');
          result.current.clearEdges('workflow1');
        });

        expect(result.current.getEdge('workflow1', 'edge1')).toBeUndefined();
        expect(result.current.getEdge('workflow2', 'edge1')).toEqual({ status: 'running' });
      });
    });
  });

  describe('Tasks', () => {
    describe('setTask and getTask', () => {
      it('sets and gets tasks', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setTask('workflow1', 'node1', {
            type: 'task',
            id: 'task1',
            title: 'Test task',
            description: '',
            steps: [],
            created_at: '',
            updated_at: '',
            output_schema: {}
          } as any);
        });

        expect(result.current.getTask('workflow1', 'node1')).toBeDefined();
        expect(result.current.getTask('workflow1', 'node1')?.id).toBe('task1');
      });
    });

    describe('clearTasks', () => {
      it('clears tasks for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setTask('workflow1', 'node1', {
            type: 'task',
            id: 'task1',
            title: 'Test task',
            description: '',
            steps: [],
            created_at: '',
            updated_at: '',
            output_schema: {}
          } as any);
          result.current.setTask('workflow2', 'node1', {
            type: 'task',
            id: 'task2',
            title: 'Test task 2',
            description: '',
            steps: [],
            created_at: '',
            updated_at: '',
            output_schema: {}
          } as any);
          result.current.clearTasks('workflow1');
        });

        expect(result.current.getTask('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getTask('workflow2', 'node1')).toBeDefined();
      });
    });
  });

  describe('Tool Calls', () => {
    describe('setToolCall and getToolCall', () => {
      it('sets and gets tool calls', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setToolCall('workflow1', 'node1', {
            type: 'tool_call_update',
            tool_call_id: 'call1'
          } as any);
        });

        expect(result.current.getToolCall('workflow1', 'node1')).toBeDefined();
        expect(result.current.getToolCall('workflow1', 'node1')?.tool_call_id).toBe('call1');
      });
    });

    describe('clearToolCalls', () => {
      it('clears tool calls for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setToolCall('workflow1', 'node1', {
            type: 'tool_call_update',
            tool_call_id: 'call1'
          } as any);
          result.current.setToolCall('workflow2', 'node1', {
            type: 'tool_call_update',
            tool_call_id: 'call2'
          } as any);
          result.current.clearToolCalls('workflow1');
        });

        expect(result.current.getToolCall('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getToolCall('workflow2', 'node1')).toBeDefined();
      });
    });
  });

  describe('Planning Updates', () => {
    describe('setPlanningUpdate and getPlanningUpdate', () => {
      it('sets and gets planning updates', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPlanningUpdate('workflow1', 'node1', {
            type: 'planning_update',
            phase: 'planning',
            status: 'working',
            content: 'Working on plan'
          });
        });

        expect(result.current.getPlanningUpdate('workflow1', 'node1')).toBeDefined();
        expect(result.current.getPlanningUpdate('workflow1', 'node1')?.phase).toBe('planning');
      });
    });

    describe('clearPlanningUpdates', () => {
      it('clears planning updates for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPlanningUpdate('workflow1', 'node1', {
            type: 'planning_update',
            phase: 'planning',
            status: 'working',
            content: 'Working on plan'
          });
          result.current.setPlanningUpdate('workflow2', 'node1', {
            type: 'planning_update',
            phase: 'planning',
            status: 'working',
            content: 'Working on plan 2'
          });
          result.current.clearPlanningUpdates('workflow1');
        });

        expect(result.current.getPlanningUpdate('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getPlanningUpdate('workflow2', 'node1')).toBeDefined();
      });
    });
  });

  describe('Previews', () => {
    describe('setPreview and getPreview', () => {
      it('sets and gets previews', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPreview('workflow1', 'node1', { image: 'preview1.jpg' });
        });

        expect(result.current.getPreview('workflow1', 'node1')).toEqual({ image: 'preview1.jpg' });
      });

      it('appends to previews array when append is true', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPreview('workflow1', 'node1', 'preview1', true);
          result.current.setPreview('workflow1', 'node1', 'preview2', true);
        });

        expect(result.current.getPreview('workflow1', 'node1')).toEqual(['preview1', 'preview2']);
      });

      it('converts non-array to array when appending to non-array', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPreview('workflow1', 'node1', 'first');
          result.current.setPreview('workflow1', 'node1', 'second', true);
        });

        expect(result.current.getPreview('workflow1', 'node1')).toEqual(['first', 'second']);
      });
    });

    describe('clearPreviews', () => {
      it('clears previews for a workflow', () => {
        const { result } = renderHook(() => useResultsStore());

        act(() => {
          result.current.setPreview('workflow1', 'node1', 'preview1');
          result.current.setPreview('workflow2', 'node1', 'preview2');
          result.current.clearPreviews('workflow1');
        });

        expect(result.current.getPreview('workflow1', 'node1')).toBeUndefined();
        expect(result.current.getPreview('workflow2', 'node1')).toEqual('preview2');
      });
    });
  });

  describe('Multiple Workflows Isolation', () => {
    it('maintains isolation between workflows', () => {
      const { result } = renderHook(() => useResultsStore());

      act(() => {
        result.current.setResult('wf1', 'n1', { data: 'wf1-n1' });
        result.current.setResult('wf1', 'n2', { data: 'wf1-n2' });
        result.current.setResult('wf2', 'n1', { data: 'wf2-n1' });
        result.current.setProgress('wf1', 'n1', 50, 100);
        result.current.setProgress('wf2', 'n1', 75, 100);
        result.current.setEdge('wf1', 'e1', 'running');
        result.current.setEdge('wf2', 'e1', 'completed');
        result.current.setPreview('wf1', 'n1', 'preview1');
        result.current.setPreview('wf2', 'n1', 'preview2');
      });

      expect(result.current.getResult('wf1', 'n1')).toEqual({ data: 'wf1-n1' });
      expect(result.current.getResult('wf1', 'n2')).toEqual({ data: 'wf1-n2' });
      expect(result.current.getResult('wf2', 'n1')).toEqual({ data: 'wf2-n1' });
      expect(result.current.getProgress('wf1', 'n1')).toEqual({ progress: 50, total: 100, chunk: '' });
      expect(result.current.getProgress('wf2', 'n1')).toEqual({ progress: 75, total: 100, chunk: '' });
      expect(result.current.getEdge('wf1', 'e1')).toEqual({ status: 'running' });
      expect(result.current.getEdge('wf2', 'e1')).toEqual({ status: 'completed' });
      expect(result.current.getPreview('wf1', 'n1')).toEqual('preview1');
      expect(result.current.getPreview('wf2', 'n1')).toEqual('preview2');

      act(() => {
        result.current.clearResults('wf1');
        result.current.clearProgress('wf1');
        result.current.clearEdges('wf1');
        result.current.clearPreviews('wf1');
      });

      expect(result.current.getResult('wf1', 'n1')).toBeUndefined();
      expect(result.current.getResult('wf1', 'n2')).toBeUndefined();
      expect(result.current.getResult('wf2', 'n1')).toEqual({ data: 'wf2-n1' });
      expect(result.current.getProgress('wf1', 'n1')).toBeUndefined();
      expect(result.current.getProgress('wf2', 'n1')).toEqual({ progress: 75, total: 100, chunk: '' });
      expect(result.current.getEdge('wf1', 'e1')).toBeUndefined();
      expect(result.current.getEdge('wf2', 'e1')).toEqual({ status: 'completed' });
      expect(result.current.getPreview('wf1', 'n1')).toBeUndefined();
      expect(result.current.getPreview('wf2', 'n1')).toEqual('preview2');
    });
  });
});
