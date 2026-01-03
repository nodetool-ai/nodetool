import { useCallback } from "react";
import { Viewport } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";

export function useReactFlowEvents() {
  const setViewport = useNodes((state) => state.setViewport);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);

  const handleMoveEnd = useCallback(
    (event: any, viewport: Viewport) => {
      setViewport(viewport);
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
