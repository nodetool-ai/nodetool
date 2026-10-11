import { useEffect, useRef } from "react";
import type { NodeStore } from "../stores/NodeStore";

/**
 * Fits the canvas when the node store asks for it (Auto Layout, "Show" on a
 * validation issue). The store starts with the request set, but the viewport
 * is restored from stored state, so that first request is dropped.
 */
export const useFitToScreenRequest = (
  shouldFitToScreen: boolean,
  nodeStore: Pick<NodeStore, "getState">,
  fitView: () => void
): void => {
  const initialRequestHandledRef = useRef(false);
  useEffect(() => {
    // Read the live flag as well as the render's. StrictMode runs this effect
    // twice with the same `true`, and the second run fitted an empty canvas.
    // React Flow holds a fit until nodes exist, so the first node added to a
    // blank workflow opened at maximum zoom.
    const { shouldFitToScreen: requested, setShouldFitToScreen } =
      nodeStore.getState();
    if (!shouldFitToScreen || !requested) {
      initialRequestHandledRef.current = true;
      return;
    }
    setShouldFitToScreen(false);
    if (initialRequestHandledRef.current) {
      fitView();
    }
    initialRequestHandledRef.current = true;
  }, [shouldFitToScreen, nodeStore, fitView]);
};
