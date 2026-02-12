/**
 * DataFlowAnimationStore manages real-time data flow animation state for workflow edges.
 *
 * EXPERIMENTAL FEATURE: Visualizes data flowing through edges during workflow execution.
 *
 * Responsibilities:
 * - Track active data flow animations on edges
 * - Manage animation lifecycle (start, progress, completion)
 * - Provide enabling/disabling of data flow visualization
 * - Handle cleanup of completed animations
 *
 * Data is organized using composite keys: "workflowId:edgeId"
 *
 * @experimental
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Represents an active animation on an edge
 */
export interface EdgeAnimation {
  edgeId: string;
  workflowId: string;
  progress: number; // 0-1, representing animation progress
  startTime: number; // Timestamp when animation started
  duration: number; // Animation duration in ms
  color: string; // Color of the animated particle
  dataLabel?: string; // Optional label for data type being animated
}

/**
 * Represents the data flow animation state for a workflow
 */
export interface WorkflowDataFlowState {
  workflowId: string;
  isRunning: boolean;
  enabled: boolean;
  animations: Record<string, EdgeAnimation>;
}

/**
 * Shape of the animation settings stored in localStorage
 */
export interface DataFlowSettings {
  enabled: boolean;
  animationSpeed: number; // 1-5, controls animation speed
  showDataLabels: boolean; // Show data type labels on animated edges
  particleSize: number; // Size of animation particle in pixels
}

export type DataFlowAnimationStore = {
  // Per-workflow animation states
  workflowStates: Record<string, WorkflowDataFlowState>;

  // Global settings (persisted)
  settings: DataFlowSettings;

  // Actions for workflow-specific state
  setWorkflowRunning: (workflowId: string, running: boolean) => void;
  setWorkflowEnabled: (workflowId: string, enabled: boolean) => void;
  startEdgeAnimation: (
    workflowId: string,
    edgeId: string,
    color?: string,
    dataLabel?: string
  ) => void;
  updateEdgeAnimation: (
    workflowId: string,
    edgeId: string,
    progress: number
  ) => void;
  completeEdgeAnimation: (workflowId: string, edgeId: string) => void;
  clearWorkflowAnimations: (workflowId: string) => void;

  // Actions for global settings
  updateSettings: (settings: Partial<DataFlowSettings>) => void;
  resetSettings: () => void;

  // Getters
  getWorkflowState: (workflowId: string) => WorkflowDataFlowState | undefined;
  getEdgeAnimation: (
    workflowId: string,
    edgeId: string
  ) => EdgeAnimation | undefined;
}

export const DEFAULT_SETTINGS: DataFlowSettings = {
  enabled: true,
  animationSpeed: 3,
  showDataLabels: false,
  particleSize: 6,
};

/**
 * Creates or gets an empty workflow state
 */
const createEmptyWorkflowState = (
  workflowId: string
): WorkflowDataFlowState => ({
  workflowId,
  isRunning: false,
  enabled: true,
  animations: {},
});

/**
 * Calculate animation duration based on settings
 */
const getAnimationDuration = (speed: number): number => {
  // Speed ranges from 1 (slow) to 5 (fast)
  // Duration ranges from 1500ms (slow) to 300ms (fast)
  return 1500 - (speed - 1) * 300;
};

/**
 * Get default animation color (light blue for visibility on dark/light backgrounds)
 */
const getDefaultAnimationColor = (): string => {
  return "#60A5FA"; // Light blue, visible on both dark and light backgrounds
};

export const useDataFlowAnimationStore = create<DataFlowAnimationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      workflowStates: {},
      settings: DEFAULT_SETTINGS,

      // Workflow-specific actions
      setWorkflowRunning: (workflowId, running) => {
        set((state) => {
          const workflowStates = { ...state.workflowStates };
          if (!workflowStates[workflowId]) {
            workflowStates[workflowId] = createEmptyWorkflowState(workflowId);
          }
          workflowStates[workflowId] = {
            ...workflowStates[workflowId],
            isRunning: running,
          };
          return { workflowStates };
        });
      },

      setWorkflowEnabled: (workflowId, enabled) => {
        set((state) => {
          const workflowStates = { ...state.workflowStates };
          if (!workflowStates[workflowId]) {
            workflowStates[workflowId] = createEmptyWorkflowState(workflowId);
          }
          workflowStates[workflowId] = {
            ...workflowStates[workflowId],
            enabled,
          };
          return { workflowStates };
        });
      },

      startEdgeAnimation: (workflowId, edgeId, color, dataLabel) => {
        const state = get();
        if (!state.settings.enabled) {
          return;
        }

        const workflowState = state.workflowStates[workflowId];
        if (!workflowState || !workflowState.enabled || !workflowState.isRunning) {
          return;
        }

        const key = `${workflowId}:${edgeId}`;
        const animation: EdgeAnimation = {
          edgeId,
          workflowId,
          progress: 0,
          startTime: Date.now(),
          duration: getAnimationDuration(state.settings.animationSpeed),
          color: color ?? getDefaultAnimationColor(),
          dataLabel,
        };

        set((prevState) => ({
          workflowStates: {
            ...prevState.workflowStates,
            [workflowId]: {
              ...workflowState,
              animations: {
                ...workflowState.animations,
                [key]: animation,
              },
            },
          },
        }));
      },

      updateEdgeAnimation: (workflowId, edgeId, progress) => {
        set((state) => {
          const workflowState = state.workflowStates[workflowId];
          if (!workflowState) {
            return state;
          }

          const key = `${workflowId}:${edgeId}`;
          const existingAnimation = workflowState.animations[key];
          if (!existingAnimation) {
            return state;
          }

          return {
            workflowStates: {
              ...state.workflowStates,
              [workflowId]: {
                ...workflowState,
                animations: {
                  ...workflowState.animations,
                  [key]: { ...existingAnimation, progress },
                },
              },
            },
          };
        });
      },

      completeEdgeAnimation: (workflowId, edgeId) => {
        set((state) => {
          const workflowState = state.workflowStates[workflowId];
          if (!workflowState) {
            return state;
          }

          const key = `${workflowId}:${edgeId}`;
          const animations = { ...workflowState.animations };
          delete animations[key];

          return {
            workflowStates: {
              ...state.workflowStates,
              [workflowId]: {
                ...workflowState,
                animations,
              },
            },
          };
        });
      },

      clearWorkflowAnimations: (workflowId) => {
        set((state) => {
          const workflowState = state.workflowStates[workflowId];
          if (!workflowState) {
            return state;
          }

          return {
            workflowStates: {
              ...state.workflowStates,
              [workflowId]: {
                ...workflowState,
                animations: {},
              },
            },
          };
        });
      },

      // Settings actions
      updateSettings: (newSettings) => {
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        }));
      },

      resetSettings: () => {
        set({ settings: DEFAULT_SETTINGS });
      },

      // Getters
      getWorkflowState: (workflowId) => {
        return get().workflowStates[workflowId];
      },

      getEdgeAnimation: (workflowId, edgeId) => {
        const key = `${workflowId}:${edgeId}`;
        return get().workflowStates[workflowId]?.animations[key];
      },
    }),
    {
      name: "nodetool-dataflow-animation",
      partialize: (state) => ({ settings: state.settings }),
    }
  )
);
