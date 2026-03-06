/**
 * useExecutionTrace hook for managing workflow execution trace visualization.
 *
 * Provides methods to record, playback, and visualize workflow execution traces.
 * This hook integrates with the ExecutionTraceStore to provide a clean API
 * for components that need to interact with trace data.
 *
 * @module useExecutionTrace
 */

import { useEffect, useRef, useCallback } from 'react';
import useExecutionTraceStore, {
  type ExecutionTrace,
  type TraceEvent,
  type PlaybackState,
} from '../stores/ExecutionTraceStore';

export interface UseExecutionTraceReturn {
  // Trace data
  activeTrace: ExecutionTrace | undefined;
  playback: PlaybackState;
  currentEvent: TraceEvent | undefined;
  completedEvents: TraceEvent[];

  // Recording controls
  startRecording: (workflowId: string, workflowName: string) => void;
  addTraceEvent: (
    nodeId: string,
    nodeName: string,
    nodeType: string,
    status: TraceEvent['status'],
    errorMessage?: string
  ) => void;
  completeNode: (nodeId: string, duration: number) => void;
  endRecording: () => void;
  clearTrace: () => void;

  // Playback controls
  play: () => void;
  pause: () => void;
  reset: () => void;
  step: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleStepMode: () => void;

  // Utilities
  getNodeStatus: (nodeId: string) => TraceEvent['status'] | undefined;
  getNodeDuration: (nodeId: string) => number | undefined;
  isRecording: boolean;
  hasTrace: boolean;
}

/**
 * Hook for managing workflow execution trace visualization.
 *
 * @param workflowId - The current workflow ID to record traces for
 * @returns Object containing trace data and control methods
 *
 * @example
 * ```tsx
 * const { startRecording, addTraceEvent, completeNode, endRecording } = useExecutionTrace();
 *
 * // Start recording when workflow execution begins
 * useEffect(() => {
 *   startRecording(workflowId, workflowName);
 *   return () => endRecording();
 * }, [workflowId]);
 * ```
 */
export const useExecutionTrace = (
  workflowId?: string
): UseExecutionTraceReturn => {
  const store = useExecutionTraceStore();
  const playbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Get state from store using selectors
  const activeTrace = useExecutionTraceStore((state) => {
    if (workflowId) {
      return state.traces[workflowId];
    }
    return state.activeTraceId ? state.traces[state.activeTraceId] : undefined;
  });

  const playback = useExecutionTraceStore((state) => state.playback);
  const currentEvent = useExecutionTraceStore((state) => state.getCurrentEvent());
  const completedEvents = useExecutionTraceStore(
    (state) => state.getCompletedEvents()
  );

  const isRecording = activeTrace ? !activeTrace.isComplete : false;
  const hasTrace = !!activeTrace;

  // Recording controls
  const startRecording = useCallback(
    (id: string, name: string) => {
      store.startTrace(id, name);
    },
    [store]
  );

  const addTraceEvent = useCallback(
    (
      nodeId: string,
      nodeName: string,
      nodeType: string,
      status: TraceEvent['status'],
      errorMessage?: string
    ) => {
      const traceId = workflowId || store.activeTraceId;
      if (traceId) {
        store.addEvent(traceId, nodeId, nodeName, nodeType, status, errorMessage);
      }
    },
    [store, workflowId]
  );

  const completeNode = useCallback(
    (nodeId: string, duration: number) => {
      const traceId = workflowId || store.activeTraceId;
      if (traceId) {
        store.completeEvent(traceId, nodeId, duration);
      }
    },
    [store, workflowId]
  );

  const endRecording = useCallback(() => {
    const traceId = workflowId || store.activeTraceId;
    if (traceId) {
      store.endTrace(traceId);
    }
  }, [store, workflowId]);

  const clearTrace = useCallback(() => {
    const traceId = workflowId || store.activeTraceId;
    if (traceId) {
      store.clearTrace(traceId);
    }
  }, [store, workflowId]);

  // Playback controls
  const play = useCallback(() => {
    store.play();
  }, [store]);

  const pause = useCallback(() => {
    store.pause();
  }, [store]);

  const reset = useCallback(() => {
    store.reset();
    if (playbackIntervalRef.current) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }
  }, [store]);

  const step = useCallback(() => {
    store.step();
  }, [store]);

  const setPlaybackSpeed = useCallback(
    (speed: number) => {
      store.setPlaybackSpeed(speed);
    },
    [store]
  );

  const toggleStepMode = useCallback(() => {
    store.toggleStepMode();
  }, [store]);

  // Utilities
  const getNodeStatus = useCallback(
    (nodeId: string): TraceEvent['status'] | undefined => {
      if (!activeTrace) {return undefined;}
      const event = activeTrace.events.find((e) => e.nodeId === nodeId);
      return event?.status;
    },
    [activeTrace]
  );

  const getNodeDuration = useCallback(
    (nodeId: string): number | undefined => {
      if (!activeTrace) {return undefined;}
      const event = activeTrace.events.find((e) => e.nodeId === nodeId);
      return event?.duration;
    },
    [activeTrace]
  );

  // Auto-playback effect
  useEffect(() => {
    if (
      playback.isPlaying &&
      !playback.stepMode &&
      activeTrace &&
      activeTrace.events.length > 0
    ) {
      const baseInterval = 500; // 500ms per event at 1x speed
      const interval = baseInterval / playback.playbackSpeed;

      playbackIntervalRef.current = setInterval(() => {
        const currentIndex = store.playback.currentEventIndex;
        if (currentIndex >= activeTrace.events.length - 1) {
          // End of trace
          store.pause();
          if (playbackIntervalRef.current) {
            clearInterval(playbackIntervalRef.current);
            playbackIntervalRef.current = null;
          }
        } else {
          store.step();
        }
      }, interval);
    } else if (playbackIntervalRef.current && !playback.isPlaying) {
      clearInterval(playbackIntervalRef.current);
      playbackIntervalRef.current = null;
    }

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    };
  }, [playback.isPlaying, playback.stepMode, playback.playbackSpeed, activeTrace, store]);

  return {
    // Trace data
    activeTrace,
    playback,
    currentEvent,
    completedEvents,

    // Recording controls
    startRecording,
    addTraceEvent,
    completeNode,
    endRecording,
    clearTrace,

    // Playback controls
    play,
    pause,
    reset,
    step,
    setPlaybackSpeed,
    toggleStepMode,

    // Utilities
    getNodeStatus,
    getNodeDuration,
    isRecording,
    hasTrace,
  };
};

export default useExecutionTrace;
