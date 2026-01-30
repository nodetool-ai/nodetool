import { useCallback, useEffect, useRef } from "react";
import { Viewport } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";

export function useReactFlowEvents() {
  const setViewport = useNodes((state) => state.setViewport);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);
  const viewportTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }
    };
  }, []);

  const handleMoveEnd = useCallback(
    (event: any, viewport: Viewport) => {
      if (viewportTimeoutRef.current) {
        clearTimeout(viewportTimeoutRef.current);
      }
      viewportTimeoutRef.current = setTimeout(() => {
        setViewport(viewport);
        viewportTimeoutRef.current = null;
      }, 100);
    },
    [setViewport]
  );

  const handleOnMoveStart = useCallback(
    (event: any) => {
      if (event?.type === "pan") {
        closeNodeMenu();
      }
    },
    [closeNodeMenu]
  );

  return {
    handleMoveEnd,
    handleOnMoveStart
  };
}
