import { useCallback } from "react";
import { type OnMoveEnd, type OnMoveStart } from "@xyflow/react";
import { useNodes } from "../../contexts/NodeContext";
import useNodeMenuStore from "../../stores/NodeMenuStore";

export function useReactFlowEvents() {
  const setViewport = useNodes((state) => state.setViewport);
  const closeNodeMenu = useNodeMenuStore((state) => state.closeNodeMenu);

  const handleMoveEnd: OnMoveEnd = useCallback(
    (event, viewport) => {
      setViewport(viewport);
    },
    [setViewport]
  );

  const handleOnMoveStart: OnMoveStart = useCallback(
    (event) => {
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
