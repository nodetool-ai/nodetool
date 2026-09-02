import { useEffect } from "react";
import { useStoreApi } from "@xyflow/react";

/**
 * Silent instrument for the intermittent "nodes select but no longer move" bug.
 *
 * A node moves because d3-drag receives the `mousedown` that follows a
 * `pointerdown` on an element matching the node's `dragHandle`. Three things
 * break that chain, and the console line below says which one it was:
 *
 * 1. `handleMiss` — the pointer went down outside `.node-drag-handle`.
 * 2. `defaultPrevented` — something (React Flow's pane runs a capture-phase
 *    `preventDefault` while `selectionKeyPressed` is true) swallowed the
 *    compatibility mouse events, so d3-drag never saw a `mousedown`.
 * 3. neither, and `mouseDownSeen` is false — the drag handler is not attached.
 *
 * Logs nothing on a healthy gesture.
 */
export function useNodeDragDiagnostics(enabled: boolean): void {
  const store = useStoreApi();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    type Pending = {
      nodeId: string;
      dragHandle: string | undefined;
      handleMiss: boolean;
      targetPath: string;
      nodeDraggable: boolean | undefined;
      storeNodesDraggable: boolean;
      nodeDragThreshold: number;
      userSelectionActive: boolean;
      paneIsSelecting: boolean;
      mouseDownSeen: boolean;
    };
    let pending: Pending | null = null;

    const describe = (el: Element | null): string => {
      if (!el) {
        return "<none>";
      }
      const cls = typeof el.className === "string" ? el.className : "";
      return `${el.tagName.toLowerCase()}.${cls.split(/\s+/).filter(Boolean).join(".")}`;
    };

    const onPointerDownCapture = (event: PointerEvent): void => {
      pending = null;
      if (event.button !== 0) {
        return;
      }
      const target = event.target instanceof Element ? event.target : null;
      const nodeEl = target?.closest(".react-flow__node");
      if (!nodeEl) {
        return;
      }
      const nodeId = nodeEl.getAttribute("data-id") ?? "";
      const state = store.getState();
      const node = state.nodeLookup.get(nodeId);
      const dragHandle = node?.dragHandle;
      pending = {
        nodeId,
        dragHandle,
        handleMiss: dragHandle
          ? !nodeEl.contains(target?.closest(dragHandle) ?? null)
          : false,
        targetPath: describe(target),
        nodeDraggable: node?.draggable,
        storeNodesDraggable: state.nodesDraggable,
        nodeDragThreshold: state.nodeDragThreshold,
        userSelectionActive: state.userSelectionActive,
        paneIsSelecting: !!document.querySelector(".react-flow__pane.selection"),
        mouseDownSeen: false
      };
    };

    const onMouseDownCapture = (): void => {
      if (pending) {
        pending.mouseDownSeen = true;
      }
    };

    // Bubble phase on window: every capture and bubble handler has run, so
    // `defaultPrevented` is final. The compatibility `mousedown` is dispatched
    // after this task, so read `mouseDownSeen` from a timeout, not a microtask
    // (microtasks flush between listeners, before `mousedown` exists).
    const onPointerDownBubble = (event: PointerEvent): void => {
      const record = pending;
      if (!record) {
        return;
      }
      const defaultPrevented = event.defaultPrevented;
      setTimeout(() => {
        if (record.mouseDownSeen && !record.handleMiss && !defaultPrevented) {
          return;
        }
        // eslint-disable-next-line no-console
        console.warn("[drag-diag] node press did not start a drag", {
          ...record,
          defaultPrevented
        });
      }, 0);
    };

    window.addEventListener("pointerdown", onPointerDownCapture, true);
    window.addEventListener("mousedown", onMouseDownCapture, true);
    window.addEventListener("pointerdown", onPointerDownBubble);
    return () => {
      window.removeEventListener("pointerdown", onPointerDownCapture, true);
      window.removeEventListener("mousedown", onMouseDownCapture, true);
      window.removeEventListener("pointerdown", onPointerDownBubble);
    };
  }, [enabled, store]);
}
