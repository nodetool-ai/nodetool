import { useLayoutEffect, type ReactNode } from "react";
import { useSetInspectorHeaderSupplemental } from "../contexts/InspectorPropertyHeaderContext";

/** Registers extra label-row actions (expand, copy, etc.) for the current inspector property. */
export function useInspectorHeaderSupplementalRegistration(
  actions: ReactNode,
  enabled: boolean
): void {
  const setSupplemental = useSetInspectorHeaderSupplemental();

  useLayoutEffect(() => {
    if (!enabled || !setSupplemental) {
      return;
    }
    setSupplemental(actions);
    return () => setSupplemental(null);
  }, [actions, enabled, setSupplemental]);
}
