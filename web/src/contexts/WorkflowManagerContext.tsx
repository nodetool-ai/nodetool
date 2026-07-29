// WorkflowManagerContext.tsx
// -----------------------------------------------
// React context + Zustand store coordinating all workflows in the app.
// Responsibilities:
// - Create/load/copy/delete workflows via API and expose helpers to the UI
// - Maintain per-workflow NodeStore instances (tabbed editors) and surface
//   validation helpers
// - Persist `currentWorkflowId` and the list/order of open workflows in
//   localStorage to restore tabs between sessions
// - Provide a shared QueryClient and system stats for child components
// -----------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type Context,
  type ReactNode,
  type FC
} from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { QueryClient } from "@tanstack/react-query";
import {
  createWorkflowManagerStore,
  WorkflowManagerStore,
  WorkflowManagerState,
  getOpenWorkflowsFromStorage
} from "../stores/WorkflowManagerStore";

declare global {
  interface Window {
    __WORKFLOW_MANAGER_CONTEXT__?: Context<WorkflowManagerStore | null>;
  }
}

// In development, preserve the context reference on window to survive HMR.
// This prevents "must be used within Provider" errors during hot reloads.
const WorkflowManagerContext: Context<WorkflowManagerStore | null> = (() => {
  if (import.meta.hot && window.__WORKFLOW_MANAGER_CONTEXT__) {
    return window.__WORKFLOW_MANAGER_CONTEXT__;
  }

  const ctx = createContext<WorkflowManagerStore | null>(null);

  if (import.meta.hot) {
    window.__WORKFLOW_MANAGER_CONTEXT__ = ctx;
  }

  return ctx;
})();

export const useWorkflowManager = <T,>(
  selector: (state: WorkflowManagerState) => T
) => {
  const context = useContext(WorkflowManagerContext);
  if (!context) {
    throw new Error(
      "useWorkflowManager must be used within a WorkflowManagerProvider"
    );
  }

  return useStoreWithEqualityFn(context, selector, shallow);
};

/**
 * Access the raw workflow-manager Zustand store, suitable for callers that
 * need `.getState()` / `.subscribe()` (long-lived subscriptions, imperative
 * lookups). Re-renders only when the store reference itself changes.
 */
export const useWorkflowManagerStore = (): WorkflowManagerStore => {
  const context = useContext(WorkflowManagerContext);
  if (!context) {
    throw new Error(
      "useWorkflowManagerStore must be used within a WorkflowManagerProvider"
    );
  }
  return context;
};

export const WorkflowManagerProvider: FC<{
  children: ReactNode;
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const [store] = useState(() => createWorkflowManagerStore(queryClient));

  useEffect(() => {
    // Restore workflows that were previously open from localStorage.
    // makeCurrent: false — the store already restored `currentWorkflowId`
    // from localStorage at creation; letting these parallel fetches each set
    // it would make the last-resolved fetch win and scramble the active tab.
    const openWorkflows = getOpenWorkflowsFromStorage();
    openWorkflows.forEach((workflowId: string) => {
      store.getState().fetchWorkflow(workflowId, { makeCurrent: false });
    });
  }, [store]);

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};

