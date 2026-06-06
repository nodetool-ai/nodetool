import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from "react";

/** Inspector-only actions (e.g. expose-as-handle toggle) for the current property row. */
const InspectorHeaderActionsContext = createContext<ReactNode>(null);

/** Inspector-only reset control for the current property row (from PropertyInput). */
const InspectorHeaderResetContext = createContext<ReactNode>(null);

/** Editor actions (expand, copy, etc.) registered by String/JSON property components. */
const InspectorHeaderSupplementalContext = createContext<ReactNode>(null);

type SupplementalSetter = (actions: ReactNode) => void;

const InspectorHeaderSupplementalSetterContext =
  createContext<SupplementalSetter | null>(null);

export function InspectorHeaderActionsProvider({
  actions,
  children
}: {
  actions: ReactNode;
  children: ReactNode;
}) {
  const [supplemental, setSupplemental] = useState<ReactNode>(null);
  const setSupplementalStable = useMemo<SupplementalSetter>(
    () => (next) => setSupplemental(next),
    []
  );

  return (
    <InspectorHeaderActionsContext.Provider value={actions}>
      <InspectorHeaderSupplementalSetterContext.Provider
        value={setSupplementalStable}
      >
        <InspectorHeaderSupplementalContext.Provider value={supplemental}>
          {children}
        </InspectorHeaderSupplementalContext.Provider>
      </InspectorHeaderSupplementalSetterContext.Provider>
    </InspectorHeaderActionsContext.Provider>
  );
}

export function InspectorHeaderResetProvider({
  reset,
  children
}: {
  reset: ReactNode;
  children: ReactNode;
}) {
  return (
    <InspectorHeaderResetContext.Provider value={reset}>
      {children}
    </InspectorHeaderResetContext.Provider>
  );
}

export function useInspectorHeaderActions(): ReactNode {
  return useContext(InspectorHeaderActionsContext);
}

export function useInspectorHeaderReset(): ReactNode {
  return useContext(InspectorHeaderResetContext);
}

export function useInspectorHeaderSupplemental(): ReactNode {
  return useContext(InspectorHeaderSupplementalContext);
}

export function useSetInspectorHeaderSupplemental(): SupplementalSetter | null {
  return useContext(InspectorHeaderSupplementalSetterContext);
}
