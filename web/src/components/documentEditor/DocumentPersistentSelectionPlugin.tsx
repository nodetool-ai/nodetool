/**
 * Keeps the selected text visually highlighted when the document editor loses
 * focus — for example when clicking into the docked AI Assistant composer
 * (document editor PRD R7). Renders non-interactive overlay rectangles inside
 * the page container from the DOM Range's client rects, and clears them as
 * soon as focus returns or the selection collapses.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { mergeRegister } from "@lexical/utils";
import {
  $getSelection,
  $isRangeSelection,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  SELECTION_CHANGE_COMMAND
} from "lexical";

interface OverlayRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface DocumentPersistentSelectionPluginProps {
  containerRef: RefObject<HTMLElement | null>;
  zoom?: number;
}

function captureDomRange(root: HTMLElement | null): Range | null {
  if (!root || typeof window === "undefined") {
    return null;
  }
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }
  const range = selection.getRangeAt(0);
  if (range.collapsed) {
    return null;
  }
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  ) {
    return null;
  }
  return range.cloneRange();
}

function measureOverlayRects(
  range: Range,
  container: HTMLElement
): OverlayRect[] {
  if (!range.startContainer.isConnected || !range.endContainer.isConnected) {
    return [];
  }
  const containerRect = container.getBoundingClientRect();
  const clientRects = Array.from(range.getClientRects());
  const next: OverlayRect[] = [];
  for (const rect of clientRects) {
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    next.push({
      top: rect.top - containerRect.top + container.scrollTop,
      left: rect.left - containerRect.left + container.scrollLeft,
      width: rect.width,
      height: rect.height
    });
  }
  return next;
}

export function DocumentPersistentSelectionPlugin({
  containerRef,
  zoom
}: DocumentPersistentSelectionPluginProps) {
  const [editor] = useLexicalComposerContext();
  const [rects, setRects] = useState<OverlayRect[]>([]);
  const savedRangeRef = useRef<Range | null>(null);
  const blurredRef = useRef(false);

  const recomputeOverlay = useCallback((): void => {
    if (!blurredRef.current) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      setRects([]);
      return;
    }
    const range = savedRangeRef.current;
    if (
      !range ||
      range.collapsed ||
      !range.startContainer.isConnected ||
      !range.endContainer.isConnected
    ) {
      savedRangeRef.current = null;
      setRects([]);
      return;
    }
    const nextRects = measureOverlayRects(range, container);
    if (nextRects.length === 0) {
      savedRangeRef.current = null;
      setRects([]);
      return;
    }
    setRects(nextRects);
  }, [containerRef]);

  useEffect(() => {
    const isLexicalCollapsed = (): boolean =>
      editor.getEditorState().read(() => {
        const selection = $getSelection();
        return $isRangeSelection(selection) && selection.isCollapsed();
      });

    const refreshSavedRange = (): void => {
      if (isLexicalCollapsed()) {
        savedRangeRef.current = null;
        setRects([]);
        return;
      }
      const root = editor.getRootElement();
      const captured = captureDomRange(root);
      if (captured) {
        savedRangeRef.current = captured;
      } else if (!blurredRef.current) {
        savedRangeRef.current = null;
      }
    };

    const showOverlay = (): void => {
      blurredRef.current = true;
      const container = containerRef.current;
      if (!container) {
        setRects([]);
        return;
      }
      if (isLexicalCollapsed()) {
        savedRangeRef.current = null;
        setRects([]);
        return;
      }
      const root = editor.getRootElement();
      const liveRange = captureDomRange(root);
      const activeRange = liveRange ?? savedRangeRef.current;
      if (!activeRange || activeRange.collapsed) {
        setRects([]);
        return;
      }
      savedRangeRef.current = activeRange;
      setRects(measureOverlayRects(activeRange, container));
    };

    const hideOverlay = (): void => {
      blurredRef.current = false;
      setRects([]);
    };

    const onSelectionChange = (): void => {
      const root = editor.getRootElement();
      if (!root || blurredRef.current) {
        return;
      }
      const active = document.activeElement;
      if (active === root || (active !== null && root.contains(active))) {
        refreshSavedRange();
      }
    };

    document.addEventListener("selectionchange", onSelectionChange);

    let rootCleanup: (() => void) | null = null;
    const bindRoot = (root: HTMLElement | null): void => {
      rootCleanup?.();
      rootCleanup = null;
      if (!root) {
        return;
      }
      const handleBlur = (): void => {
        showOverlay();
      };
      const handleFocus = (): void => {
        hideOverlay();
      };
      root.addEventListener("blur", handleBlur);
      root.addEventListener("focus", handleFocus);
      rootCleanup = () => {
        root.removeEventListener("blur", handleBlur);
        root.removeEventListener("focus", handleFocus);
      };
    };

    bindRoot(editor.getRootElement());

    let updateRafId: number | null = null;
    const cancelUpdateFrame = (): void => {
      if (updateRafId !== null) {
        window.cancelAnimationFrame(updateRafId);
        updateRafId = null;
      }
    };

    const unregister = mergeRegister(
      editor.registerRootListener((nextRoot) => {
        bindRoot(nextRoot);
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          if (blurredRef.current) {
            hideOverlay();
          }
          refreshSavedRange();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        BLUR_COMMAND,
        () => {
          showOverlay();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        FOCUS_COMMAND,
        () => {
          hideOverlay();
          return false;
        },
        COMMAND_PRIORITY_LOW
      ),
      editor.registerUpdateListener(({ dirtyElements, dirtyLeaves }) => {
        if (blurredRef.current) {
          if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
            cancelUpdateFrame();
            updateRafId = window.requestAnimationFrame(() => {
              updateRafId = null;
              recomputeOverlay();
            });
          }
          return;
        }
        refreshSavedRange();
      })
    );

    return () => {
      cancelUpdateFrame();
      document.removeEventListener("selectionchange", onSelectionChange);
      rootCleanup?.();
      unregister();
    };
  }, [containerRef, editor, recomputeOverlay]);

  useEffect(() => {
    if (!blurredRef.current || !savedRangeRef.current) {
      return;
    }
    const frameId = window.requestAnimationFrame(() => {
      recomputeOverlay();
    });
    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [recomputeOverlay, zoom]);

  useEffect(() => {
    if (rects.length === 0) {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const scrollParent = container.parentElement;
    window.addEventListener("resize", recomputeOverlay);
    container.addEventListener("scroll", recomputeOverlay, { passive: true });
    scrollParent?.addEventListener("scroll", recomputeOverlay, {
      passive: true
    });

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(recomputeOverlay);
      observer.observe(container);
    }

    return () => {
      window.removeEventListener("resize", recomputeOverlay);
      container.removeEventListener("scroll", recomputeOverlay);
      scrollParent?.removeEventListener("scroll", recomputeOverlay);
      observer?.disconnect();
    };
  }, [containerRef, recomputeOverlay, rects.length]);

  const container = containerRef.current;
  if (!container || rects.length === 0) {
    return null;
  }

  return createPortal(
    <>
      {rects.map((rect, index) => (
        <div
          key={`${index}-${rect.top}-${rect.left}-${rect.width}-${rect.height}`}
          className="doc-persistent-selection"
          aria-hidden="true"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height
          }}
        />
      ))}
    </>,
    container
  );
}

export default DocumentPersistentSelectionPlugin;
