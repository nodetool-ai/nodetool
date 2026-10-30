import { useCallback } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import useNodeMenuStore from "../../stores/NodeMenuStore";
import useMetadataStore from "../../stores/MetadataStore";
import { serializeDragData } from "../../lib/dragdrop";
import { useDragDropStore } from "../../lib/dragdrop/store";

interface NodeTileDragHandlers {
  handleDragStart: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleDragEnd: () => void;
}

/**
 * Drag-to-create handlers for node tiles. The dragged tile carries its node
 * type in `data-node-type`, which keeps the handlers stable across renders.
 */
export const useNodeTileDrag = (): NodeTileDragHandlers => {
  const setDragToCreate = useNodeMenuStore((state) => state.setDragToCreate);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const setActiveDrag = useDragDropStore((s) => s.setActiveDrag);
  const clearDrag = useDragDropStore((s) => s.clearDrag);

  const handleDragStart = useCallback(
    (event: ReactDragEvent<HTMLDivElement>) => {
      const nodeType = event.currentTarget.dataset.nodeType;
      const metadata = nodeType ? getMetadata(nodeType) : undefined;
      if (!metadata) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setDragToCreate(true);
      serializeDragData(
        { type: "create-node", payload: metadata },
        event.dataTransfer
      );
      event.dataTransfer.effectAllowed = "copyMove";
      setActiveDrag({ type: "create-node", payload: metadata });
    },
    [getMetadata, setDragToCreate, setActiveDrag]
  );

  const handleDragEnd = useCallback(() => {
    setDragToCreate(false);
    clearDrag();
  }, [setDragToCreate, clearDrag]);

  return { handleDragStart, handleDragEnd };
};
