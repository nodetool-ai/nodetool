/**
 * Per-app-instance reactive state store.
 *
 * The state shape and every transition come from `@nodetool-ai/app-runtime`;
 * this file only wraps the pure reducer in a Zustand vanilla store so widgets
 * can subscribe to a single slot. Mirrors the web store — same reducer, same
 * four namespaces, same instance registry.
 */
import { createStore } from "zustand/vanilla";
import {
  applyEvent,
  createInstanceState,
  type AppInstanceState,
  type AppStateEvent,
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
    dispatchEvent: (event) => set((state) => applyEvent(state, event)),
  }));

const appRuntimeStores = new Map<string, AppRuntimeStore>();

/**
 * The instance id one open app uses. The key is the application id, so two
 * apps binding the same workflow keep separate state (and separate persisted
 * variables).
 */
export const appInstanceId = (key: string): string => `app:${key}`;

export const getAppRuntimeStore = (instanceId: string): AppRuntimeStore => {
  let store = appRuntimeStores.get(instanceId);
  if (!store) {
    store = createAppRuntimeStore();
    appRuntimeStores.set(instanceId, store);
  }
  return store;
};

/** Drop an app instance's state. Call when the app is closed or deleted. */
export const disposeAppRuntimeStore = (instanceId: string): void => {
  appRuntimeStores.delete(instanceId);
};
