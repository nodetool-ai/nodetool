import React, { createContext, useContext } from "react";

/** Inspector-only actions (e.g. expose-as-handle toggle) for the current property row. */
const InspectorHeaderActionsContext = createContext<React.ReactNode>(null);

/** Inspector-only reset control for the current property row (from PropertyInput). */
const InspectorHeaderResetContext = createContext<React.ReactNode>(null);

export function InspectorHeaderActionsProvider({
  actions,
  children
}: {
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <InspectorHeaderActionsContext.Provider value={actions}>
      {children}
    </InspectorHeaderActionsContext.Provider>
  );
}

export function InspectorHeaderResetProvider({
  reset,
  children
}: {
  reset: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <InspectorHeaderResetContext.Provider value={reset}>
      {children}
    </InspectorHeaderResetContext.Provider>
  );
}

export function useInspectorHeaderActions(): React.ReactNode {
  return useContext(InspectorHeaderActionsContext);
}

export function useInspectorHeaderReset(): React.ReactNode {
  return useContext(InspectorHeaderResetContext);
}
