/**
 * ExecutionTraceStore manages workflow execution trace data for visualization.
 *
 * Captures the execution path of a workflow including node execution order,
 * timing information, and status. This enables visual replay of workflow execution
 * with animated edges and highlighted nodes.
 *
 * @module ExecutionTraceStore
 */

import { create } from 'zustand';

/**
 * Represents a single trace event during workflow execution
 */
export interface TraceEvent {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  timestamp: number;
  duration?: number;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  errorMessage?: string;
}

/**
 * Represents a complete execution trace for a workflow
 */
export interface ExecutionTrace {
  workflowId: string;
  workflowName: string;
  startTime: number;
  endTime?: number;
  events: TraceEvent[];
  isComplete: boolean;
}

/**
 * Represents the playback state for trace visualization
 */
export interface PlaybackState {
  isPlaying: boolean;
  currentEventIndex: number;
  playbackSpeed: number; // 1x, 2x, 4x
  stepMode: boolean; // If true, manually step through events
}

interface ExecutionTraceStore {
  // Trace storage
  traces: Record<string, ExecutionTrace>;
  activeTraceId: string | null;

  // Playback state
  playback: PlaybackState;

  // Actions
  startTrace: (workflowId: string, workflowName: string) => void;
  addEvent: (
    workflowId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    status: TraceEvent['status'],
    errorMessage?: string
  ) => void;
  completeEvent: (workflowId: string, nodeId: string, duration: number) => void;
  endTrace: (workflowId: string) => void;
  clearTrace: (workflowId: string) => void;
  clearAllTraces: () => void;

  // Playback controls
  setActiveTrace: (workflowId: string | null) => void;
  play: () => void;
  pause: () => void;
  reset: () => void;
  step: () => void;
  setPlaybackSpeed: (speed: number) => void;
  toggleStepMode: () => void;

  // Getters
  getTrace: (workflowId: string) => ExecutionTrace | undefined;
  getActiveTrace: () => ExecutionTrace | undefined;
  getCurrentEvent: () => TraceEvent | undefined;
  getCompletedEvents: () => TraceEvent[];
  getEventsByNode: (nodeId: string) => TraceEvent[];
}

const useExecutionTraceStore = create<ExecutionTraceStore>((set, get) => ({
  traces: {},
  activeTraceId: null,
  playback: {
    isPlaying: false,
    currentEventIndex: -1,
    playbackSpeed: 1,
    stepMode: false,
  },

  startTrace: (workflowId: string, workflowName: string) => {
    const trace: ExecutionTrace = {
      workflowId,
      workflowName,
      startTime: Date.now(),
      events: [],
      isComplete: false,
    };
    set((state) => ({
      traces: {
        ...state.traces,
        [workflowId]: trace,
      },
      activeTraceId: workflowId,
      playback: {
        ...state.playback,
        currentEventIndex: -1,
        isPlaying: false,
      },
    }));
  },

  addEvent: (
    workflowId: string,
    nodeId: string,
    nodeName: string,
    nodeType: string,
    status: TraceEvent['status'],
    errorMessage?: string
  ) => {
    set((state) => {
      const traces = { ...state.traces };
      const trace = traces[workflowId];
      if (!trace) {return state;}

      // Check if event already exists for this node
      const existingEventIndex = trace.events.findIndex((e) => e.nodeId === nodeId);

      if (existingEventIndex >= 0) {
        // Update existing event
        const updatedEvents = [...trace.events];
        updatedEvents[existingEventIndex] = {
          ...updatedEvents[existingEventIndex],
          status,
          errorMessage,
          timestamp: Date.now(),
        };

        traces[workflowId] = {
          ...trace,
          events: updatedEvents,
        };
      } else {
        // Add new event
        const newEvent: TraceEvent = {
          nodeId,
          nodeName,
          nodeType,
          timestamp: Date.now(),
          status,
          errorMessage,
        };

        traces[workflowId] = {
          ...trace,
          events: [...trace.events, newEvent],
        };
      }

      return { traces };
    });
  },

  completeEvent: (workflowId: string, nodeId: string, duration: number) => {
    set((state) => {
      const traces = { ...state.traces };
      const trace = traces[workflowId];
      if (!trace) {return state;}

      const eventIndex = trace.events.findIndex((e) => e.nodeId === nodeId);
      if (eventIndex < 0) {return state;}

      const updatedEvents = [...trace.events];
      updatedEvents[eventIndex] = {
        ...updatedEvents[eventIndex],
        status: 'completed',
        duration,
      };

      traces[workflowId] = {
        ...trace,
        events: updatedEvents,
      };

      return { traces };
    });
  },

  endTrace: (workflowId: string) => {
    set((state) => {
      const traces = { ...state.traces };
      const trace = traces[workflowId];
      if (!trace) {return state;}

      traces[workflowId] = {
        ...trace,
        endTime: Date.now(),
        isComplete: true,
      };

      return {
        traces,
        playback: {
          ...state.playback,
          isPlaying: false,
        },
      };
    });
  },

  clearTrace: (workflowId: string) => {
    set((state) => {
      const traces = { ...state.traces };
      delete traces[workflowId];

      return {
        traces,
        activeTraceId:
          state.activeTraceId === workflowId ? null : state.activeTraceId,
      };
    });
  },

  clearAllTraces: () => {
    set({
      traces: {},
      activeTraceId: null,
      playback: {
        isPlaying: false,
        currentEventIndex: -1,
        playbackSpeed: 1,
        stepMode: false,
      },
    });
  },

  setActiveTrace: (workflowId: string | null) => {
    set((state) => ({
      activeTraceId: workflowId,
      playback: {
        ...state.playback,
        currentEventIndex: -1,
        isPlaying: false,
      },
    }));
  },

  play: () => {
    set((state) => {
      const trace = state.activeTraceId
        ? state.traces[state.activeTraceId]
        : null;
      if (!trace || trace.events.length === 0) {return state;}

      return {
        playback: {
          ...state.playback,
          isPlaying: true,
          stepMode: false,
        },
      };
    });
  },

  pause: () => {
    set((state) => ({
      playback: {
        ...state.playback,
        isPlaying: false,
      },
    }));
  },

  reset: () => {
    set((state) => ({
      playback: {
        ...state.playback,
        currentEventIndex: -1,
        isPlaying: false,
      },
    }));
  },

  step: () => {
    set((state) => {
      const trace = state.activeTraceId
        ? state.traces[state.activeTraceId]
        : null;
      if (!trace) {return state;}

      const nextIndex = state.playback.currentEventIndex + 1;
      if (nextIndex >= trace.events.length) {
        // End of trace
        return {
          playback: {
            ...state.playback,
            isPlaying: false,
          },
        };
      }

      return {
        playback: {
          ...state.playback,
          currentEventIndex: nextIndex,
          isPlaying: false,
        },
      };
    });
  },

  setPlaybackSpeed: (speed: number) => {
    set((state) => ({
      playback: {
        ...state.playback,
        playbackSpeed: speed,
      },
    }));
  },

  toggleStepMode: () => {
    set((state) => ({
      playback: {
        ...state.playback,
        stepMode: !state.playback.stepMode,
        isPlaying: false,
      },
    }));
  },

  getTrace: (workflowId: string) => {
    return get().traces[workflowId];
  },

  getActiveTrace: () => {
    const { activeTraceId, traces } = get();
    return activeTraceId ? traces[activeTraceId] : undefined;
  },

  getCurrentEvent: () => {
    const { playback, activeTraceId, traces } = get();
    const trace = activeTraceId ? traces[activeTraceId] : undefined;
    if (!trace || playback.currentEventIndex < 0) {return undefined;}
    return trace.events[playback.currentEventIndex];
  },

  getCompletedEvents: () => {
    const { playback, activeTraceId, traces } = get();
    const trace = activeTraceId ? traces[activeTraceId] : undefined;
    if (!trace || playback.currentEventIndex < 0) {return [];}
    return trace.events.slice(0, playback.currentEventIndex + 1);
  },

  getEventsByNode: (nodeId: string) => {
    const { activeTraceId, traces } = get();
    const trace = activeTraceId ? traces[activeTraceId] : undefined;
    if (!trace) {return [];}
    return trace.events.filter((e) => e.nodeId === nodeId);
  },
}));

export default useExecutionTraceStore;
