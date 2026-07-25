/**
 * Per-app-instance reactive state store.
 *
 * The state shape and every transition come from `@nodetool-ai/app-runtime`;
 * this file only wraps the pure reducer in a Zustand vanilla store so widgets
 * can subscribe to a single slot. Values live in four namespaces — inputs,
 * outputs, variables, and widget-local view state — so a widget's own value can
 * never collide with a workflow output, and two operations over the same
 * workflow never collide with each other.
 */
import { createStore } from "zustand/vanilla";
import {
  applyEvent,
  createInstanceState,
  type AppInstanceState,
  type AppStateEvent
} from "@nodetool-ai/app-runtime";

export interface AppRuntimeState extends AppInstanceState {
  /** The only way to mutate the store: one pure reducer, one event at a time. */
  dispatchEvent: (event: AppStateEvent) => void;
}

export type AppRuntimeStore = ReturnType<typeof createAppRuntimeStore>;

export const createAppRuntimeStore = (initial?: Partial<AppInstanceState>) =>
  createStore<AppRuntimeState>((set) => ({
    ...createInstanceState(),
    ...initial,
    dispatchEvent: (event) => set((state) => applyEvent(state, event))
  }));

/**
 * Live app stores keyed by app-instance id. Two apps built on the same workflow
 * get two stores; a design canvas gets an unregistered ephemeral one, so widget
 * writes there never leak into the published app's state.
 */
const appRuntimeStores = new Map<string, AppRuntimeStore>();

/** The instance id an app opened over a workflow uses by default. */
export const workflowInstanceId = (workflowId: string): string =>
  `app:${workflowId}`;

export const getAppRuntimeStore = (instanceId: string): AppRuntimeStore => {
  let store = appRuntimeStores.get(instanceId);
  if (!store) {
    store = createAppRuntimeStore();
    appRuntimeStores.set(instanceId, store);
  }
  return store;
};

/** Drop an app instance's state. Call when the app is closed/deleted. */
export const disposeAppRuntimeStore = (instanceId: string): void => {
  appRuntimeStores.delete(instanceId);
};
