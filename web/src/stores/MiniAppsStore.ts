import { create } from "zustand";

import {
  MiniAppInputDefinition,
  MiniAppInputValues,
  MiniAppProgress,
  MiniAppResult
} from "../components/miniapps/types";

export type MiniAppWorkflowState = {
  inputValues: MiniAppInputValues;
  results: MiniAppResult[];
  progress: MiniAppProgress | null;
};

export interface MiniAppsState {
  apps: Record<string, MiniAppWorkflowState>;
  initializeInputDefaults: (
    workflowId: string,
    definitions: MiniAppInputDefinition[]
  ) => void;
  setInputValue: (workflowId: string, name: string, value: unknown) => void;
  setInputValues: (workflowId: string, values: MiniAppInputValues) => void;
  upsertResult: (workflowId: string, result: MiniAppResult) => void;
  setResults: (workflowId: string, results: MiniAppResult[]) => void;
  clearResults: (workflowId: string) => void;
  setProgress: (workflowId: string, progress: MiniAppProgress | null) => void;
  resetWorkflowState: (workflowId: string) => void;
}

const ensureWorkflowState = (
  apps: Record<string, MiniAppWorkflowState>,
  workflowId: string
): MiniAppWorkflowState => {
  if (apps[workflowId]) {
    return apps[workflowId];
  }
  const defaultState: MiniAppWorkflowState = {
    inputValues: {},
    results: [],
    progress: null
  };
  return defaultState;
};

export const useMiniAppsStore = create<MiniAppsState>((set, get) => ({
  apps: {},
  initializeInputDefaults: (workflowId, definitions) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      const nextValues: MiniAppInputValues = { ...current.inputValues };
      definitions.forEach((definition) => {
        const key = definition.data.name;
        if (nextValues[key] !== undefined) {
          return;
        }
        if (definition.data.value !== undefined) {
          nextValues[key] = definition.data.value;
          return;
        }
        if (definition.kind === "boolean") {
          nextValues[key] = false;
          return;
        }
        nextValues[key] = undefined;
      });
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            inputValues: nextValues
          }
        }
      };
    });
  },
  setInputValue: (workflowId, name, value) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      if (current.inputValues[name] === value) {
        return state;
      }
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            inputValues: {
              ...current.inputValues,
              [name]: value
            }
          }
        }
      };
    });
  },
  setInputValues: (workflowId, values) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            inputValues: { ...values }
          }
        }
      };
    });
  },
  upsertResult: (workflowId, result) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      const index = current.results.findIndex((item) => item.id === result.id);
      const nextResults =
        index >= 0
          ? current.results.map((item, idx) => (idx === index ? result : item))
          : [...current.results, result];
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            results: nextResults
          }
        }
      };
    });
  },
  setResults: (workflowId, results) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            results: [...results]
          }
        }
      };
    });
  },
  clearResults: (workflowId) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      if (current.results.length === 0) {
        return state;
      }
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            results: []
          }
        }
      };
    });
  },
  setProgress: (workflowId, progress) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            progress: progress ? { ...progress } : null
          }
        }
      };
    });
  },
  resetWorkflowState: (workflowId) => {
    set((state) => {
      const current = ensureWorkflowState(state.apps, workflowId);
      return {
        apps: {
          ...state.apps,
          [workflowId]: {
            ...current,
            results: [],
            progress: null
          }
        }
      };
    });
  }
}));
