import { renderHook, act } from '@testing-library/react';
import { useProfilerStore, ProfilingSession } from '../ProfilerStore';

describe('ProfilerStore', () => {
  beforeEach(() => {
    act(() => {
      useProfilerStore.getState().clearAllSessions();
    });
  });

  describe('startProfiling', () => {
    it('should start a new profiling session', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
      });
      
      expect(result.current.isProfiling).toBe(true);
      expect(result.current.currentSession).not.toBeNull();
      expect(result.current.currentSession?.workflowId).toBe('workflow-1');
      expect(result.current.currentSession?.status).toBe('running');
    });

    it('should create session with unique id', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
      });
      
      const session1 = result.current.currentSession;
      
      act(() => {
        useProfilerStore.getState().clearAllSessions();
        result.current.startProfiling('workflow-2');
      });
      
      const session2 = result.current.currentSession;
      
      expect(session1?.id).not.toBe(session2?.id);
    });

    it('should add session to sessions list', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
      });
      
      const sessions = result.current.getAllSessions();
      expect(sessions.length).toBe(1);
      expect(sessions[0].workflowId).toBe('workflow-1');
    });
  });

  describe('endProfiling', () => {
    it('should end profiling and set status to completed', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
      });
      
      const sessionId = result.current.currentSession?.id;
      
      act(() => {
        result.current.endProfiling('workflow-1');
      });
      
      expect(result.current.isProfiling).toBe(false);
      expect(result.current.currentSession).toBeNull();
      
      const sessions = result.current.getAllSessions();
      const completedSession = sessions.find(s => s.id === sessionId);
      expect(completedSession?.status).toBe('completed');
      expect(completedSession?.endTime).toBeDefined();
      expect(completedSession?.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('cancelProfiling', () => {
    it('should cancel profiling and set status to cancelled', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
      });
      
      const sessionId = result.current.currentSession?.id;
      
      act(() => {
        result.current.cancelProfiling('workflow-1');
      });
      
      expect(result.current.isProfiling).toBe(false);
      expect(result.current.currentSession).toBeNull();
      
      const sessions = result.current.getAllSessions();
      const cancelledSession = sessions.find(s => s.id === sessionId);
      expect(cancelledSession?.status).toBe('cancelled');
    });
  });

  describe('startNodeExecution', () => {
    it('should record node execution start', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'node-1', 'nodetool.llm.LLMNode', 'My LLM Node');
      });
      
      const session = result.current.currentSession;
      expect(session?.nodeProfiles['node-1']).toBeDefined();
      expect(session?.nodeProfiles['node-1'].nodeType).toBe('nodetool.llm.LLMNode');
      expect(session?.nodeProfiles['node-1'].status).toBe('running');
    });

    it('should track parent nodes', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'node-2', 'nodetool.output.TextOutput', 'Output', ['node-1']);
      });
      
      const session = result.current.currentSession;
      expect(session?.nodeProfiles['node-2'].parentIds).toEqual(['node-1']);
    });
  });

  describe('endNodeExecution', () => {
    it('should record node execution end with duration', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'node-1', 'nodetool.llm.LLMNode', 'My LLM Node');
      });
      
      act(() => {
        result.current.endNodeExecution('workflow-1', 'node-1', 'completed', 1024, 500, 2000);
      });
      
      const session = result.current.currentSession;
      expect(session?.nodeProfiles['node-1'].status).toBe('completed');
      expect(session?.nodeProfiles['node-1'].duration).toBeGreaterThan(0);
      expect(session?.nodeProfiles['node-1'].memoryUsage).toBe(1024);
    });

    it('should handle failed status', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'node-1', 'nodetool.llm.LLMNode', 'My LLM Node');
      });
      
      act(() => {
        result.current.endNodeExecution('workflow-1', 'node-1', 'failed', 0, 0, 0);
      });
      
      const session = result.current.currentSession;
      expect(session?.nodeProfiles['node-1'].status).toBe('failed');
    });
  });

  describe('getProfilerSummary', () => {
    it('should return null when no session exists', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      const summary = result.current.getProfilerSummary('workflow-1');
      expect(summary).toBeNull();
    });

    it('should return complete summary after execution', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'node-1', 'nodetool.input.StringInput', 'Input');
        result.current.endNodeExecution('workflow-1', 'node-1', 'completed', 100, 50, 100);
        result.current.startNodeExecution('workflow-1', 'node-2', 'nodetool.llm.LLMNode', 'LLM');
        result.current.endNodeExecution('workflow-1', 'node-2', 'completed', 2048, 100, 500);
        result.current.endProfiling('workflow-1');
      });
      
      const summary = result.current.getProfilerSummary('workflow-1');
      
      expect(summary).not.toBeNull();
      expect(summary?.totalNodes).toBe(2);
      expect(summary?.executedNodes).toBe(2);
      expect(summary?.failedNodes).toBe(0);
      expect(summary?.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('getBottlenecks', () => {
    it('should identify bottlenecks correctly', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.startNodeExecution('workflow-1', 'fast-node', 'nodetool.input.StringInput', 'Fast');
        result.current.endNodeExecution('workflow-1', 'fast-node', 'completed', 100, 50, 100);
        result.current.startNodeExecution('workflow-1', 'slow-node', 'nodetool.llm.LLMNode', 'Slow LLM');
        result.current.endNodeExecution('workflow-1', 'slow-node', 'completed', 2048, 100, 500);
        result.current.endProfiling('workflow-1');
      });
      
      const bottlenecks = result.current.getBottlenecks('workflow-1');
      
      expect(bottlenecks.length).toBeGreaterThan(0);
      const slowBottleneck = bottlenecks.find(b => b.nodeId === 'slow-node');
      expect(slowBottleneck).toBeDefined();
    });
  });

  describe('clearSession', () => {
    it('should remove a specific session', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.endProfiling('workflow-1');
      });
      
      const sessionId = result.current.getAllSessions()[0]?.id;
      
      act(() => {
        result.current.clearSession(sessionId!);
      });
      
      expect(result.current.getAllSessions().length).toBe(0);
    });
  });

  describe('clearAllSessions', () => {
    it('should clear all sessions', () => {
      const { result } = renderHook(() => useProfilerStore());
      
      act(() => {
        result.current.startProfiling('workflow-1');
        result.current.endProfiling('workflow-1');
        result.current.startProfiling('workflow-2');
        result.current.endProfiling('workflow-2');
      });
      
      expect(result.current.getAllSessions().length).toBe(2);
      
      act(() => {
        result.current.clearAllSessions();
      });
      
      expect(result.current.getAllSessions().length).toBe(0);
      expect(result.current.isProfiling).toBe(false);
    });
  });
});
