/**
 * useEditorLifecycle
 *
 * Dedicated editor lifecycle/controller hook that owns:
 * - Initial-document seeding (layout-effect store hydration)
 * - Canvas-ready gating (prevents SketchCanvas from mounting before store is seeded)
 * - Autosave snapshotting (fires only on committed document changes)
 * - Tool-transition side effects (cancel/init when switching tools)
 * - Canvas-resize-handles preference (localStorage-backed)
 *
 * Extracted from SketchEditor to keep the component body focused on
 * composition/layout rather than orchestration.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import type { SketchDocument, SketchTool } from "../types";
import { hydrateSketchStore } from "../state";
import { useSketchInstance } from "../../../stores/sketch/SketchInstance";
import type { useCanvasActions } from "./useCanvasActions";
import type { useSegmentation } from "./useSegmentation";
import {
  DEFAULT_SKETCH_PAN,
  DEFAULT_SKETCH_ZOOM,
  type SketchPersistenceSnapshot
} from "../../../stores/sketch/persistence";

const SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY =
  "nodetool-sketch-canvas-resize-handles";

function readCanvasResizeHandlesEnabled(): boolean {
  if (typeof window === "undefined") {
    return true;
  }
  try {
    const raw = window.localStorage.getItem(
      SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY
    );
    if (raw === null) {
      return true;
    }
    return raw === "1" || raw === "true";
  } catch {
    return true;
  }
}

interface UseEditorLifecycleParams {
  initialDocument: SketchDocument | undefined;
  initialEditorState?: SketchPersistenceSnapshot;
  /**
   * Stable id of the document being edited. When supplied and equal to the
   * session store's `documentId`, the initial hydrate is skipped so the
   * global sketch store keeps the user's latest edits — necessary because
   * the trpc cache may be stale while an autosave is mid-flight.
   */
  documentId?: string;
  onDocumentChange: ((doc: SketchDocument) => void) | undefined;

  // Store actions
  setDocument: (doc: SketchDocument) => void;
  activeTool: SketchTool;
  document: SketchDocument;

  // Composed action hooks
  canvasActions: ReturnType<typeof useCanvasActions>;
  segmentation: ReturnType<typeof useSegmentation>;

  /** Ref to the latest toolSettings — read at snapshot time without dependency. */
  liveToolSettingsRef: { current: SketchDocument["toolSettings"] };
}

export interface EditorLifecycleResult {
  canvasReady: boolean;
  initialDocumentRef: React.RefObject<SketchDocument | undefined>;
  canvasResizeHandlesEnabled: boolean;
  handleCanvasResizeHandlesEnabledChange: (enabled: boolean) => void;
}

export function useEditorLifecycle({
  initialDocument,
  initialEditorState,
  documentId,
  onDocumentChange,
  setDocument,
  activeTool,
  document,
  canvasActions,
  segmentation,
  liveToolSettingsRef
}: UseEditorLifecycleParams): EditorLifecycleResult {
  // ─── Canvas-ready gating ──────────────────────────────────────────
  const [canvasReady, setCanvasReady] = useState(false);

  // Stores for the surrounding editor instance (per tab / modal).
  const instance = useSketchInstance();

  // Snapshot of the document as it was when the editor first loaded
  const initialDocumentRef = useRef(initialDocument);

  // Set by the hydrate below when the document arrives with the default
  // viewport (100%, no pan) — a new document, or one whose view was never
  // changed. That view shows a 1024px artboard cropped on every side in a
  // typical window, so the first paint fits it to the viewport instead. A
  // saved non-default view is restored as is. Consumed by the effect after
  // the canvas mounts, when the viewport has a size to fit into.
  const pendingInitialFitRef = useRef(false);
  const canvasActionsRef = useRef(canvasActions);
  canvasActionsRef.current = canvasActions;

  // ─── Canvas-resize-handles preference ─────────────────────────────
  const [canvasResizeHandlesEnabled, setCanvasResizeHandlesEnabled] = useState(
    readCanvasResizeHandlesEnabled
  );

  const handleCanvasResizeHandlesEnabledChange = useCallback(
    (enabled: boolean) => {
      setCanvasResizeHandlesEnabled(enabled);
      try {
        window.localStorage.setItem(
          SKETCH_CANVAS_RESIZE_HANDLES_STORAGE_KEY,
          enabled ? "1" : "0"
        );
      } catch {
        // localStorage may be unavailable (private mode, etc.)
      }
    },
    []
  );

  // ─── Tool-transition side effects ─────────────────────────────────
  const prevAdjustToolRef = useRef(activeTool);
  useEffect(() => {
    if (
      prevAdjustToolRef.current === "adjust" &&
      activeTool !== "adjust"
    ) {
      canvasActions.handleCancelAdjustments();
    }
    // Save transform baseline when switching to "transform"
    if (
      prevAdjustToolRef.current !== "transform" &&
      activeTool === "transform"
    ) {
      canvasActions.saveTransformOriginal();
    }
    // Cancel transform when switching away from "transform"
    if (
      prevAdjustToolRef.current === "transform" &&
      activeTool !== "transform"
    ) {
      canvasActions.handleTransformCancel();
    }
    // Auto-check model availability when switching to segment tool
    if (
      prevAdjustToolRef.current !== "segment" &&
      activeTool === "segment"
    ) {
      segmentation.checkModel();
    }
    prevAdjustToolRef.current = activeTool;
  }, [activeTool, canvasActions, segmentation]);

  // ─── Seed global store from prop before SketchCanvas mounts ───────
  //
  // The hydrate is deliberately gated. `useSketchStore` is a GLOBAL store
  // that retains the user's latest edits across SketchEditorPage unmounts.
  // On revisit of the same document we'd otherwise re-hydrate it from the
  // trpc cache — and that cache lags real edits whenever an autosave is
  // mid-flight on the way out of the page, which would wipe a freshly-added
  // layer the moment the user comes back.
  //
  // The gate keys on `hydratedDocumentId` — the doc the editor has actually
  // seeded into the global store — NOT the session `documentId`. The latter
  // is set the moment a document's metadata loads, which in the standalone
  // editor happens in the parent before this child mounts; gating on it made
  // every fresh load look like a same-doc revisit and skip the seed, leaving
  // the global store on its default blank document.
  useLayoutEffect(() => {
    initialDocumentRef.current = initialDocument;

    const session = instance.session.getState();
    const isSameDocRevisit =
      documentId !== undefined && session.hydratedDocumentId === documentId;
    if (!isSameDocRevisit) {
      pendingInitialFitRef.current =
        !initialEditorState ||
        (initialEditorState.zoom === DEFAULT_SKETCH_ZOOM &&
          initialEditorState.pan.x === DEFAULT_SKETCH_PAN.x &&
          initialEditorState.pan.y === DEFAULT_SKETCH_PAN.y);
      if (initialEditorState) {
        hydrateSketchStore(instance.editor, {
          document: initialEditorState.document,
          activeTool: initialEditorState.activeTool,
          zoom: initialEditorState.zoom,
          pan: initialEditorState.pan,
          history: initialEditorState.history,
          historyIndex: initialEditorState.historyIndex
        });
      } else if (initialDocument) {
        setDocument(initialDocument);
      }
      if (documentId !== undefined) {
        session.markHydrated(documentId);
      }
    }
    setCanvasReady(true);
  }, [documentId, initialDocument, initialEditorState, setDocument, instance]);

  // The canvas mounts in the commit that flips `canvasReady`; one frame later
  // its container has been laid out and `handleZoomFit` can measure it.
  useEffect(() => {
    if (!canvasReady || !pendingInitialFitRef.current) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (!pendingInitialFitRef.current) {
        return;
      }
      pendingInitialFitRef.current = false;
      canvasActionsRef.current.handleZoomFit();
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasReady, documentId]);

  // ─── Autosave on document changes ─────────────────────────────────
  // ## Autosave boundary contract
  //
  // This effect fires only on **committed** document mutations (layer CRUD,
  // history undo/redo, canvas resize, etc.) — not on hot viewport state
  // (zoom, pan), tool settings slider ticks, or transient preview state.
  //
  // - `document` comes from a narrow store selector that returns the
  //   immutable document snapshot. A new reference is produced only when
  //   the document slice mutates.
  // - `toolSettings` is merged via a stable ref (`liveToolSettingsRef`)
  //   so tool settings changes do NOT fire this effect. The ref is read
  //   at snapshot time to capture the latest settings without dependency.
  useEffect(() => {
    if (onDocumentChange && canvasReady) {
      onDocumentChange({
        ...document,
        toolSettings: liveToolSettingsRef.current
      });
    }
  }, [document, onDocumentChange, canvasReady, liveToolSettingsRef]);

  return {
    canvasReady,
    initialDocumentRef,
    canvasResizeHandlesEnabled,
    handleCanvasResizeHandlesEnabledChange
  };
}
