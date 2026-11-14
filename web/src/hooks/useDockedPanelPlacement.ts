import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  DEFAULT_DOCKED_POSITION,
  DOCKED_PANEL_MARGIN,
  dockPanelAt,
  placeDockedPanel,
  type DockedPosition,
  type PanelArea,
  type PanelPoint,
  type PanelSize
} from "../utils/dockedPanelPosition";

/** Pixels an arrow key moves the panel. Shift moves it further. */
const KEY_STEP = 16;
const KEY_STEP_LARGE = 64;

export interface DockedPanelPlacementOptions {
  /** The element the panel floats over. The window when null. */
  canvas: HTMLElement | null;
  /** Pixels side panels cover at the canvas's left and right viewport edges. */
  insets: { left: number; right: number };
  /** The panel's preferred width. Narrow canvases shrink it. */
  width: number;
  /** The saved position, or null for the default top-left corner. */
  position: DockedPosition | null;
  onPositionChange: (position: DockedPosition | null) => void;
}

export interface DockedPanelPlacement {
  /** Attach to the panel to measure its height. */
  panelRef: (node: HTMLElement | null) => void;
  style: { left: number; top: number; width: number; maxHeight: number };
  dragging: boolean;
  /** Spread on the drag handle. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => void;
    onPointerCancel: (event: React.PointerEvent<HTMLElement>) => void;
    onDoubleClick: (event: React.MouseEvent<HTMLElement>) => void;
  };
  /** Arrow keys move the panel, Home returns it to the default corner. */
  onHandleKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

const readArea = (
  canvas: HTMLElement | null,
  insets: { left: number; right: number }
): PanelArea => {
  const viewportWidth = window.innerWidth;
  const rect = canvas?.getBoundingClientRect();
  const hasRect = rect !== undefined && rect.width > 0 && rect.height > 0;
  return {
    left: Math.max(hasRect ? rect.left : 0, insets.left),
    top: hasRect ? rect.top : 0,
    right: Math.min(hasRect ? rect.right : viewportWidth, viewportWidth - insets.right),
    bottom: hasRect ? rect.bottom : window.innerHeight
  };
};

const sameArea = (a: PanelArea, b: PanelArea): boolean =>
  a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;

/**
 * Interactive children of a handle keep their own pointer behaviour. The grip
 * marked `data-drag-handle` is a button for the keyboard but still drags.
 */
const INTERACTIVE = "button, a, input, textarea, select, [role='button']";
const isInteractive = (target: EventTarget): boolean => {
  const hit = (target as Element).closest?.(INTERACTIVE);
  return Boolean(hit) && !hit?.hasAttribute("data-drag-handle");
};

/**
 * Places a floating panel at a docked position inside the canvas and lets the
 * user drag it. The panel stays inside the canvas when the window, the side
 * panels or the panel's own height change. A drop stores the distance to the
 * nearest edges, so a panel dropped at the right edge stays there.
 */
export function useDockedPanelPlacement({
  canvas,
  insets,
  width,
  position,
  onPositionChange
}: DockedPanelPlacementOptions): DockedPanelPlacement {
  const [area, setArea] = useState<PanelArea>(() => readArea(canvas, insets));
  const [height, setHeight] = useState(0);
  const [dragPoint, setDragPoint] = useState<PanelPoint | null>(null);
  const drag = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);
  const insetLeft = insets.left;
  const insetRight = insets.right;

  useLayoutEffect(() => {
    const update = () => {
      const next = readArea(canvas, { left: insetLeft, right: insetRight });
      setArea((current) => (sameArea(current, next) ? current : next));
    };
    update();
    window.addEventListener("resize", update);
    const observer =
      canvas && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (canvas) {
      observer?.observe(canvas);
    }
    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [canvas, insetLeft, insetRight]);

  const panelObserver = useRef<ResizeObserver | null>(null);
  const panelRef = useCallback((node: HTMLElement | null) => {
    panelObserver.current?.disconnect();
    panelObserver.current = null;
    if (!node) {
      return;
    }
    setHeight(node.offsetHeight);
    if (typeof ResizeObserver !== "undefined") {
      panelObserver.current = new ResizeObserver(() => setHeight(node.offsetHeight));
      panelObserver.current.observe(node);
    }
  }, []);
  useEffect(() => () => panelObserver.current?.disconnect(), []);

  const panelWidth = Math.max(
    0,
    Math.min(width, area.right - area.left - 2 * DOCKED_PANEL_MARGIN)
  );
  const size: PanelSize = { width: panelWidth, height };
  const placed = dragPoint
    ? placeDockedPanel(
        { anchorX: "left", anchorY: "top", x: dragPoint.left - area.left, y: dragPoint.top - area.top },
        area,
        size
      )
    : placeDockedPanel(position ?? DEFAULT_DOCKED_POSITION, area, size);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (event.button !== 0 || isInteractive(event.target)) {
        return;
      }
      drag.current = {
        pointerId: event.pointerId,
        dx: event.clientX - placed.left,
        dy: event.clientY - placed.top
      };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      setDragPoint({ left: placed.left, top: placed.top });
    },
    [placed.left, placed.top]
  );

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) {
      return;
    }
    setDragPoint({ left: event.clientX - current.dx, top: event.clientY - current.dy });
  }, []);

  const finishDrag = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      const current = drag.current;
      if (!current || current.pointerId !== event.pointerId) {
        return;
      }
      drag.current = null;
      setDragPoint(null);
      onPositionChange(
        dockPanelAt(
          { left: event.clientX - current.dx, top: event.clientY - current.dy },
          area,
          { width: panelWidth, height }
        )
      );
    },
    [area, panelWidth, height, onPositionChange]
  );

  const onDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (isInteractive(event.target)) {
        return;
      }
      onPositionChange(null);
    },
    [onPositionChange]
  );

  const onHandleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Home") {
        event.preventDefault();
        onPositionChange(null);
        return;
      }
      const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      const moves: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step]
      };
      const move = moves[event.key];
      if (!move) {
        return;
      }
      event.preventDefault();
      onPositionChange(
        dockPanelAt(
          { left: placed.left + move[0], top: placed.top + move[1] },
          area,
          { width: panelWidth, height }
        )
      );
    },
    [area, panelWidth, height, placed.left, placed.top, onPositionChange]
  );

  return {
    panelRef,
    style: {
      left: placed.left,
      top: placed.top,
      width: panelWidth,
      maxHeight: Math.max(0, area.bottom - area.top - 2 * DOCKED_PANEL_MARGIN)
    },
    dragging: dragPoint !== null,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: finishDrag,
      onPointerCancel: finishDrag,
      onDoubleClick
    },
    onHandleKeyDown
  };
}
