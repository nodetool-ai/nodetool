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

// -----------------------------------------------------------------
// CONTEXT SETUP
// -----------------------------------------------------------------

// Extend Window interface for HMR context preservation
declare global {
  interface Window {
    __WORKFLOW_MANAGER_CONTEXT__?: Context<WorkflowManagerStore | null>;
  }
}

// Create a React context to hold the workflow manager store.
// In development, preserve the context reference on window to survive HMR.
// This prevents "must be used within Provider" errors during hot reloads.
const WorkflowManagerContext: Context<WorkflowManagerStore | null> = (() => {
  // In development, reuse existing context from window if available
  if (import.meta.hot && window.__WORKFLOW_MANAGER_CONTEXT__) {
    return window.__WORKFLOW_MANAGER_CONTEXT__;
  }
  
  const ctx = createContext<WorkflowManagerStore | null>(null);
  
  // Store on window for HMR persistence in development
  if (import.meta.hot) {
    window.__WORKFLOW_MANAGER_CONTEXT__ = ctx;
  }
  
  return ctx;
})();

// -----------------------------------------------------------------
// CUSTOM HOOK
// -----------------------------------------------------------------

/**
 * Custom hook to access the WorkflowManager state.
 * @template T The type of the selected state slice
 * @param {function} selector Function to select a portion of the state
 * @returns {T} The selected portion of the state
 * @throws {Error} If used outside of WorkflowManagerProvider
 */
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

// -----------------------------------------------------------------
// COMPONENTS
// -----------------------------------------------------------------

// Provider component that sets up the WorkflowManager store and supplies it via context.
// It also sets up WebSocket connections to handle real-time workflow updates and
// restores previously open workflows from localStorage.
/**
 * Provider component that sets up the WorkflowManager store and context.
 * @param {Object} props Component props
 * @param {React.ReactNode} props.children Child components
 * @param {QueryClient} props.queryClient React Query client instance
 * @returns {React.ReactNode}
 */
export const WorkflowManagerProvider: FC<{
  children: ReactNode;
  queryClient: QueryClient;
}> = ({ children, queryClient }) => {
  const [store] = useState(() => {
    const workflowManagerStore = createWorkflowManagerStore(queryClient);
    return workflowManagerStore;
  });

  useEffect(() => {
    // Restore workflows that were previously open from localStorage
    const openWorkflows = getOpenWorkflowsFromStorage();
    openWorkflows.forEach((workflowId: string) => {
      store.getState().fetchWorkflow(workflowId);
    });
  }, [store]);

  return (
    <WorkflowManagerContext.Provider value={store}>
      {children}
    </WorkflowManagerContext.Provider>
  );
};

