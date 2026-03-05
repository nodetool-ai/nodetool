/**
 * Tests for ExecutionTraceStore
 */

import { act } from '@testing-library/react';
import useExecutionTraceStore from '../ExecutionTraceStore';

describe('ExecutionTraceStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { clearAllTraces } = useExecutionTraceStore.getState();
    clearAllTraces();
  });

  describe('Trace Recording', () => {
    it('should start a new trace', () => {
      const { startTrace, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
      });

      const trace = getTrace('workflow-1');
      expect(trace).toBeDefined();
      expect(trace?.workflowId).toBe('workflow-1');
      expect(trace?.workflowName).toBe('Test Workflow');
      expect(trace?.events).toEqual([]);
      expect(trace?.isComplete).toBe(false);
    });

    it('should add events to a trace', () => {
      const { startTrace, addEvent, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
      });

      const trace = getTrace('workflow-1');
      expect(trace?.events).toHaveLength(1);
      expect(trace?.events[0]).toMatchObject({
        nodeId: 'node-1',
        nodeName: 'Node 1',
        nodeType: 'nodetool.test.Node',
        status: 'running',
      });
    });

    it('should complete an event with duration', () => {
      const { startTrace, addEvent, completeEvent, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
        completeEvent('workflow-1', 'node-1', 1500);
      });

      const trace = getTrace('workflow-1');
      expect(trace?.events[0].status).toBe('completed');
      expect(trace?.events[0].duration).toBe(1500);
    });

    it('should update existing event status', () => {
      const { startTrace, addEvent, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
        addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'error', 'Test error');
      });

      const trace = getTrace('workflow-1');
      expect(trace?.events).toHaveLength(1);
      expect(trace?.events[0].status).toBe('error');
      expect(trace?.events[0].errorMessage).toBe('Test error');
    });

    it('should end a trace', () => {
      const { startTrace, endTrace, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        endTrace('workflow-1');
      });

      const trace = getTrace('workflow-1');
      expect(trace?.isComplete).toBe(true);
      expect(trace?.endTime).toBeDefined();
    });
  });

  describe('Trace Management', () => {
    it('should clear a specific trace', () => {
      const { startTrace, clearTrace, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        startTrace('workflow-2', 'Test Workflow 2');
        clearTrace('workflow-1');
      });

      expect(getTrace('workflow-1')).toBeUndefined();
      expect(getTrace('workflow-2')).toBeDefined();
    });

    it('should clear all traces', () => {
      const { startTrace, clearAllTraces, getTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        startTrace('workflow-2', 'Test Workflow 2');
        clearAllTraces();
      });

      expect(getTrace('workflow-1')).toBeUndefined();
      expect(getTrace('workflow-2')).toBeUndefined();
    });

    it('should set active trace', () => {
      const { startTrace, setActiveTrace } = useExecutionTraceStore.getState();

      act(() => {
        startTrace('workflow-1', 'Test Workflow');
        startTrace('workflow-2', 'Test Workflow 2');
        setActiveTrace('workflow-2');
      });

      expect(useExecutionTraceStore.getState().activeTraceId).toBe('workflow-2');
    });
  });

  describe('Playback Controls', () => {
    beforeEach(() => {
      const store = useExecutionTraceStore.getState();

      act(() => {
        store.startTrace('workflow-1', 'Test Workflow');
        store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
        store.completeEvent('workflow-1', 'node-1', 1000);
        store.addEvent('workflow-1', 'node-2', 'Node 2', 'nodetool.test.Node', 'running');
        store.completeEvent('workflow-1', 'node-2', 1500);
        store.addEvent('workflow-1', 'node-3', 'Node 3', 'nodetool.test.Node', 'running');
        store.completeEvent('workflow-1', 'node-3', 2000);
        store.endTrace('workflow-1');
        store.setActiveTrace('workflow-1');
      });
    });

    it('should play and pause playback', () => {
      const { play, pause } = useExecutionTraceStore.getState();

      act(() => {
        play();
      });

      expect(useExecutionTraceStore.getState().playback.isPlaying).toBe(true);

      act(() => {
        pause();
      });

      expect(useExecutionTraceStore.getState().playback.isPlaying).toBe(false);
    });

    it('should reset playback', () => {
      const { step, reset } = useExecutionTraceStore.getState();

      act(() => {
        step();
        step();
        reset();
      });

      expect(useExecutionTraceStore.getState().playback.currentEventIndex).toBe(-1);
      expect(useExecutionTraceStore.getState().playback.isPlaying).toBe(false);
    });

    it('should step through events', () => {
      const { step } = useExecutionTraceStore.getState();

      act(() => {
        step();
      });

      expect(useExecutionTraceStore.getState().playback.currentEventIndex).toBe(0);
      expect(useExecutionTraceStore.getState().getCurrentEvent()?.nodeId).toBe('node-1');

      act(() => {
        step();
      });

      expect(useExecutionTraceStore.getState().playback.currentEventIndex).toBe(1);
      expect(useExecutionTraceStore.getState().getCurrentEvent()?.nodeId).toBe('node-2');
    });

    it('should set playback speed', () => {
      const { setPlaybackSpeed } = useExecutionTraceStore.getState();

      act(() => {
        setPlaybackSpeed(2);
      });

      expect(useExecutionTraceStore.getState().playback.playbackSpeed).toBe(2);
    });

    it('should toggle step mode', () => {
      const { toggleStepMode } = useExecutionTraceStore.getState();

      act(() => {
        toggleStepMode();
      });

      expect(useExecutionTraceStore.getState().playback.stepMode).toBe(true);

      act(() => {
        toggleStepMode();
      });

      expect(useExecutionTraceStore.getState().playback.stepMode).toBe(false);
    });
  });

  describe('Getters', () => {
    beforeEach(() => {
      const store = useExecutionTraceStore.getState();

      act(() => {
        store.startTrace('workflow-1', 'Test Workflow');
        store.addEvent('workflow-1', 'node-1', 'Node 1', 'nodetool.test.Node', 'running');
        store.completeEvent('workflow-1', 'node-1', 1000);
        store.addEvent('workflow-1', 'node-2', 'Node 2', 'nodetool.test.Node', 'running');
        store.completeEvent('workflow-1', 'node-2', 1500);
        store.endTrace('workflow-1');
        store.setActiveTrace('workflow-1');
        store.step();
        store.step();
      });
    });

    it('should get current event', () => {
      const currentEvent = useExecutionTraceStore.getState().getCurrentEvent();

      expect(currentEvent?.nodeId).toBe('node-2');
    });

    it('should get completed events', () => {
      const completedEvents = useExecutionTraceStore.getState().getCompletedEvents();

      expect(completedEvents).toHaveLength(2);
      expect(completedEvents[0].nodeId).toBe('node-1');
      expect(completedEvents[1].nodeId).toBe('node-2');
    });

    it('should get events by node', () => {
      const events = useExecutionTraceStore.getState().getEventsByNode('node-1');

      expect(events).toHaveLength(1);
      expect(events[0].nodeId).toBe('node-1');
    });
  });
});
