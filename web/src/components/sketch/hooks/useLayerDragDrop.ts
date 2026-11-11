import { useCallback, useMemo, useRef, useState } from "react";
import type { DragEvent, PointerEvent, RefObject } from "react";
import { getDescendantIds, type Layer } from "../types";

export type LayerDropPosition = "before" | "after" | "into";

interface DropTarget {
  layerId: string;
  position: LayerDropPosition;
}

interface LayerDragDrop {
  dropTarget: DropTarget | null;
  layerListRef: RefObject<HTMLDivElement | null>;
  onDragStart: (event: DragEvent, layerId: string) => void;
  onDragOver: (event: DragEvent, layerId: string) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
  onTouchDrag: (event: PointerEvent<SVGSVGElement>, layerId: string) => void;
}

export function useLayerDragDrop(
  layers: Layer[],
  onReorderLayers: (fromIndex: number, toIndex: number) => void,
  onMoveLayerToGroup?: (layerId: string, groupId: string | null) => void
): LayerDragDrop {
  const layerListRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ layerId: string; target: DropTarget | null } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const indexById = useMemo(() => new Map(layers.map((layer, index) => [layer.id, index])), [layers]);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDropTarget(null);
  }, []);

  const previewDrop = useCallback((row: Element | null, layerId: string | undefined, clientY: number): boolean => {
    const drag = dragRef.current;
    if (!drag) {
      return false;
    }
    const source = layers[indexById.get(drag.layerId) ?? -1];
    const target = layers[indexById.get(layerId ?? "") ?? -1];
    let next: DropTarget | null = null;
    if (
      row && source && target && source.id !== target.id &&
      (onMoveLayerToGroup || (source.parentId ?? null) === (target.parentId ?? null))
    ) {
      const { top, height } = row.getBoundingClientRect();
      const y = clientY - top;
      let position: LayerDropPosition;
      if (target.type === "group") {
        position = y < height * 0.25 ? "before" : y > height * 0.75 ? "after" : "into";
      } else {
        position = y < height * 0.5 ? "before" : "after";
      }
      next = { layerId: target.id, position };
    }
    if (next?.layerId !== drag.target?.layerId || next?.position !== drag.target?.position) {
      drag.target = next;
      setDropTarget(next);
    }
    return next !== null;
  }, [indexById, layers, onMoveLayerToGroup]);

  const commitDrop = useCallback(() => {
    const drag = dragRef.current;
    onDragEnd();
    if (!drag?.target) {
      return;
    }
    const from = indexById.get(drag.layerId) ?? -1;
    const targetIndex = indexById.get(drag.target.layerId) ?? -1;
    const source = layers[from];
    const target = layers[targetIndex];
    if (!source || !target || from === targetIndex) {
      return;
    }
    if (source.type === "group" && getDescendantIds(layers, source.id).includes(target.id)) {
      return;
    }
    const { position } = drag.target;
    if (position === "into") {
      if (target.type === "group") {
        onMoveLayerToGroup?.(source.id, target.id);
      }
      return;
    }
    const parentId = target.parentId ?? null;
    if ((source.parentId ?? null) !== parentId) {
      if (!onMoveLayerToGroup) {
        return;
      }
      onMoveLayerToGroup(source.id, parentId);
    }
    // Higher indices render above lower indices. Account for removing the source first.
    const insertionIndex = position === "before" ? targetIndex + 1 : targetIndex;
    const to = insertionIndex - (from < insertionIndex ? 1 : 0);
    if (to !== from) {
      onReorderLayers(from, to);
    }
  }, [indexById, layers, onDragEnd, onMoveLayerToGroup, onReorderLayers]);

  const onDragStart = useCallback((event: DragEvent, layerId: string) => {
    if (event.target instanceof Element && event.target.closest("button")) {
      event.preventDefault();
      return;
    }
    dragRef.current = { layerId, target: null };
    setDropTarget(null);
    try {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", layerId);
    } catch {
      // The drag source is tracked locally even when the browser restricts setData.
    }
  }, []);

  const onDragOver = useCallback((event: DragEvent, layerId: string) => {
    if (previewDrop(event.currentTarget, layerId, event.clientY)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
    }
  }, [previewDrop]);

  const onDrop = useCallback((event: DragEvent) => {
    if (dragRef.current) {
      event.preventDefault();
      event.stopPropagation();
      commitDrop();
    }
  }, [commitDrop]);

  const onTouchDrag = useCallback((event: PointerEvent<SVGSVGElement>, layerId: string) => {
    if (event.pointerType !== "touch" || !event.isPrimary) {
      return;
    }
    if (event.type === "pointerdown") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { layerId, target: null };
      setDropTarget(null);
      return;
    }
    if (dragRef.current?.layerId !== layerId) {
      return;
    }
    if (event.type === "pointercancel" || event.type === "lostpointercapture") {
      onDragEnd();
      return;
    }
    const row = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-sketch-layer-id]");
    const targetRow = row && layerListRef.current?.contains(row) ? row : null;
    previewDrop(targetRow, targetRow?.dataset.sketchLayerId, event.clientY);
    if (event.type === "pointerup") {
      commitDrop();
    }
  }, [commitDrop, onDragEnd, previewDrop]);

  return { dropTarget, layerListRef, onDragStart, onDragOver, onDrop, onDragEnd, onTouchDrag };
}
