/**
 * SketchEditorSurface — the sketch editor as a tutorial shows it: the real
 * toolbar down the left, the layers panel down the right, the status bar along
 * the bottom, and the canvas in the middle.
 *
 * The chrome is the production `editor-shell/` components, unchanged. They
 * subscribe to a `SketchInstance` this surface owns and seeds from the cast, so
 * a replayed frame drives the same store reads the app does — a tool lights up
 * in the toolbar because `activeTool` says so, the layer rows and their opacity
 * sliders come from the document, the status bar counts the layers it was given.
 *
 * The middle is `SketchRenderer`, not the interactive `SketchCanvasPane`: a
 * replay renders state and never accepts input, and the pane's painting,
 * pointer, and history machinery has nothing to drive it here. The panel
 * callbacks are no-ops for the same reason — nothing in a replay clicks them.
 */
/** @jsxImportSource @emotion/react */
import React, { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useTheme } from "@mui/material/styles";

import {
  ConnectedLayersPanel,
  ConnectedStatusBar,
  ConnectedToolbar
} from "../../components/sketch/editor-shell";
import type { ConnectedLayersPanelProps } from "../../components/sketch/editor-shell";
import SketchRenderer from "../../components/sketch/SketchRenderer";
import { hydrateSketchStore } from "../../components/sketch/state/useSketchStore";
import {
  createSketchInstance,
  SketchProvider,
  type SketchInstance
} from "../../stores/sketch/SketchInstance";
import type { SketchCastDoc } from "./docCastTypes";

/**
 * Every panel action a replay never takes. One frozen bag so the memoised
 * panel keeps its props identity across frames.
 */
const NOOP_PANEL_ACTIONS: ConnectedLayersPanelProps = Object.freeze({
  onClearLayer: () => {},
  onFlipHorizontal: () => {},
  onFlipVertical: () => {},
  onRotate180: () => {},
  onMergeDown: () => {},
  onFlattenVisible: () => {},
  onTrimLayerToBounds: () => {},
  onCropCanvasToActiveLayerVisiblePixels: () => {},
  onCropCanvasToActiveLayerExtents: () => {},
  onToggleVisibility: () => {},
  onAddLayer: () => {},
  onRemoveLayer: () => {},
  onDuplicateLayer: () => {},
  onReorderLayers: () => {},
  onSetMaskLayer: () => {},
  onToggleAlphaLock: () => {},
  onToggleExposedInput: () => {},
  onToggleExposedOutput: () => {},
  onLayerOpacityChange: () => {},
  onLayerBlendModeChange: () => {},
  onRenameLayer: () => {},
  onAddGroup: () => {},
  onToggleGroupCollapsed: () => {},
  onMoveLayerToGroup: () => {},
  onUngroupLayer: () => {},
  onGroupSelectedLayers: () => {},
  onMergeSelectedLayers: () => {},
  onDeleteSelectedLayers: () => {},
  onLoadLayerAsSelection: () => {}
});

/**
 * Push a cast frame into the editor stores. Called before paint on every seek,
 * so what the chrome renders is exactly the cast state at that time.
 */
export function seedSketchInstance(
  instance: SketchInstance,
  documentId: string,
  doc: SketchCastDoc
): void {
  const editor = doc.editor ?? {};
  hydrateSketchStore(instance.editor, {
    document: doc.document,
    activeTool: editor.activeTool,
    zoom: editor.zoom
  });
  instance.editor.setState({
    foregroundColor: editor.foregroundColor ?? "#ffffff",
    backgroundColor: editor.backgroundColor ?? "#000000",
    selectedLayerIds: editor.selectedLayerIds ?? [],
    cursorDocPos: editor.cursorDocPos ?? null
  });
  // The status bar hides itself until a document is open.
  instance.session.setState({ documentId });
}

export interface SketchEditorSurfaceProps {
  /** Row id the editor keys this document by — the status bar reads it. */
  documentId: string;
  /** The cast's document and editor state at the frame being rendered. */
  doc: SketchCastDoc;
  ariaLabel?: string;
}

/** The sketch editor for one replayed frame. `doc` may change every frame. */
export function SketchEditorSurface({
  documentId,
  doc,
  ariaLabel
}: SketchEditorSurfaceProps): React.JSX.Element {
  const theme = useTheme();
  const [instance] = useState(createSketchInstance);

  // Seed before paint, the way the other two players seek.
  useLayoutEffect(() => {
    seedSketchInstance(instance, documentId, doc);
  }, [instance, documentId, doc]);

  useEffect(
    () => () => {
      instance.session.setState({ documentId: null });
    },
    [instance]
  );

  const canvasStyle = useMemo(
    () => ({
      flex: 1,
      minWidth: 0,
      display: "flex",
      padding: theme.spacing(1),
      backgroundColor: theme.vars.palette.grey[900]
    }),
    [theme]
  );

  return (
    // `active={false}`: a replay must never take over the imperative statics
    // (keyboard shortcuts, save) from a real editor mounted alongside it.
    <SketchProvider instance={instance} active={false}>
      <div
        data-demo-sketch-editor
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          backgroundColor: theme.vars.palette.grey[900]
        }}
      >
        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <ConnectedToolbar />
          <div style={canvasStyle}>
            <SketchRenderer
              document={doc.document}
              showDimensions
              ariaLabel={ariaLabel}
            />
          </div>
          <ConnectedLayersPanel {...NOOP_PANEL_ACTIONS} />
        </div>
        <ConnectedStatusBar />
      </div>
    </SketchProvider>
  );
}

export default SketchEditorSurface;
