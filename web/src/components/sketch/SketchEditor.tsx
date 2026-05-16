/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 *
 * ## Subscription architecture (passes 1 & 2)
 *
 * Shell components (toolbar, top bar, layers panel) subscribe directly to the
 * store slices they need via narrow connected wrappers in `editor-shell/`.
 * This means a hot-path change (e.g. `zoom`, `pan`, `selection`, or a
 * tool-settings slider) does **not** force the entire editor tree to
 * re-render — only the subtree that actually consumes the changed value
 * is invalidated.
 *
 * SketchEditor itself subscribes only to the state needed for its own effects
 * and action-hook creation (`document`, `activeTool`, `transientMoveModifierHeld`,
 * `toolSettings` via ref). Children are wired through connected components.
 *
 * ## Refactor structure
 *
 * - **useEditorSession** owns all transient session state: canvasRef, store
 *   action bundles, narrow selectors, interaction tool derivation, composed
 *   action hooks (history, layer, canvas, color, segmentation), and lifecycle
 *   (bootstrap, autosave, tool transitions, resize-handle preference).
 * - **useEditorCommands** owns the editor command surface: keyboard shortcuts,
 *   context-menu actions, segmentation bridge callbacks, free-transform entry,
 *   and the imperative handle for modal header actions.
 * - **useTransformAdapter** provides a shared transform display/action model
 *   consumed by both ConnectedToolTopBar and ConnectedContextMenu.
 * - **useToolChromeActions** centralizes per-tool settings setters and selection
 *   actions shared between ConnectedToolTopBar and ConnectedContextMenu.
 * - **useEditorStoreActions** groups the flat action grab-bag into focused bundles
 *   for history, layer, canvas, color, and session concerns.
 * - **editor-shell/** contains connected shell subscriber components.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, forwardRef, useEffect } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  CollapsibleSection,
  Container,
  FlexColumn,
  FlexRow
} from "../ui_primitives";
import TransformContextMenu from "./TransformContextMenu";
import type { SketchDocument } from "./types";
import type { SketchPersistenceSnapshot } from "../../stores/sketch/persistence";
import {
  useColorIntentRouter,
  useEditorSession,
  useEditorCommands
} from "./hooks";
import {
  ConnectedToolbar,
  ConnectedToolTopBar,
  ConnectedLayersPanel,
  ConnectedContextMenu,
  SketchCanvasPane
} from "./editor-shell";
import { ConnectedGeneratedLayerSection } from "./Inspector";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchWorkflowFreshnessCheck } from "../../hooks/sketch/useSketchWorkflowFreshnessCheck";
import { SKETCH_SIZE } from "./sketchStyles";
import HueTriangleColorPicker from "./HueTriangleColorPicker";
import { useSketchStore } from "./state/useSketchStore";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.grey[900],
    overflow: "hidden"
  });

export interface SketchEditorHandle {
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  exportPng: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  mergeDown: () => void;
  flattenVisible: () => void;
  discardToInitial: () => void;
  flushPendingChanges: () => void;
}

const ConnectedColorPanel = memo(function ConnectedColorPanel() {
  const foregroundColor =
    useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const handleFgColorChange = useColorIntentRouter();

  return (
    <Container padding="none" sx={{ p: 1 }}>
      <HueTriangleColorPicker
        color={foregroundColor}
        onColorChange={handleFgColorChange}
      />
    </Container>
  );
});

export interface SketchEditorProps {
  initialDocument?: SketchDocument;
  initialEditorState?: SketchPersistenceSnapshot;
  /**
   * Stable id of the document being edited (standalone editor only). When
   * supplied, the lifecycle hook uses it to detect a revisit of the same
   * document and skips re-hydrating the global sketch store from the trpc
   * cache — see `useEditorLifecycle` for why.
   */
  documentId?: string;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
  /** When true, window keyboard shortcuts for the editor are disabled (e.g. shortcuts help open). */
  suspendKeyboardShortcuts?: boolean;
}

const SketchEditor = forwardRef<SketchEditorHandle, SketchEditorProps>(function SketchEditor({
  initialDocument,
  initialEditorState,
  documentId,
  onDocumentChange,
  onExportImage,
  onExportMask,
  suspendKeyboardShortcuts
}, ref) {
  const theme = useTheme();

  // ─── Session layer (all transient editor-session state) ─────────────
  const session = useEditorSession({
    initialDocument,
    initialEditorState,
    documentId,
    onDocumentChange,
    onExportImage,
    onExportMask
  });

  // ─── Command surface (shortcuts, context-menu actions, imperative handle)
  const commands = useEditorCommands({
    editorRef: ref as React.RefObject<SketchEditorHandle | null>,
    canvasRef: session.canvasRef,
    initialDocumentRef: session.initialDocumentRef,
    document: session.document,
    handleUndo: session.handleUndo,
    handleRedo: session.handleRedo,
    canvasActions: session.canvasActions,
    layerActions: session.layerActions,
    colorActions: session.colorActions,
    segmentation: session.segmentation,
    canvasStore: session.canvasStore,
    colorStore: session.colorStore,
    sessionStore: session.sessionStore,
    suspendKeyboardShortcuts
  });

  // Register live canvas getters into the global ref store so consumers
  // (Inpaint Here, Re-generate Stale, etc.) can read the composite without
  // prop-drilling the canvas ref.
  const setCanvasGetters = useSketchCanvasRefStore((s) => s.setGetters);
  const clearCanvasGetters = useSketchCanvasRefStore((s) => s.clearGetters);
  useEffect(() => {
    const canvasRef = session.canvasRef;
    setCanvasGetters({
      flattenToDataUrl: () => canvasRef.current?.flattenToDataUrl() ?? "",
      getMaskDataUrl: () => canvasRef.current?.getMaskDataUrl() ?? null,
      setLayerData: (layerId, data) =>
        canvasRef.current?.setLayerData(layerId, data)
    });
    return () => {
      clearCanvasGetters();
    };
  }, [session.canvasRef, setCanvasGetters, clearCanvasGetters]);

  // Reconcile bindings on document load: stale-mark layers whose source
  // workflow changed, merge paramOverrides against current Input* nodes,
  // and auto-resolve a missing selectedOutputNodeId.
  const sessionDocumentId = useSketchSessionStore((s) => s.documentId);
  useSketchWorkflowFreshnessCheck(sessionDocumentId);

  return (
    <FlexRow className="sketch-editor" css={styles(theme)}>
      {/* ConnectedToolbar subscribes to its own state — no prop drilling */}
      <ConnectedToolbar />

      <FlexColumn
        className="sketch-editor__workspace"
        sx={{
          flex: 1,
          overflow: "hidden",
          minHeight: 0,
          position: "relative"
        }}
      >
        <Container
          className="sketch-editor__canvas-region"
          padding="none"
          sx={{
            flex: 1,
            minHeight: 0,
            position: "relative",
            zIndex: 1,
            overflow: "hidden"
          }}
        >
          <SketchCanvasPane
            canvasReady={session.canvasReady}
            canvasRef={session.canvasRef}
            document={session.document}
            activeTool={session.activeTool}
            interactionTool={session.interactionTool}
            onZoomChange={session.canvasStore.setZoom}
            onPanChange={session.canvasStore.setPan}
            onStrokeStart={session.canvasActions.handleStrokeStart}
            onStrokeEnd={session.canvasActions.handleStrokeEnd}
            onCanvasLeave={session.canvasActions.flushLayerThumbnailsWhenIdle}
            onLayerTransformChange={session.canvasActions.handleCommitLayerTransform}
            onLayerContentBoundsChange={session.layerStore.setLayerContentBounds}
            onBrushSizeChange={session.colorActions.handleBrushSizeChange}
            onContextMenu={session.canvasActions.handleContextMenu}
            onTransformContextMenu={session.canvasActions.handleTransformContextMenu}
            onCropComplete={session.canvasActions.handleCropComplete}
            onEyedropperPick={session.colorActions.handleEyedropperPick}
            onAutoPickLayer={session.layerStore.setActiveLayer}
            onDropImage={session.canvasActions.handleDropImage}
            onDropAsset={session.canvasActions.handleDropAsset}
            onCanvasResizeStart={
              session.canvasResizeHandlesEnabled
                ? session.canvasActions.handleCanvasResizeStart
                : undefined
            }
            onCanvasResize={
              session.canvasResizeHandlesEnabled
                ? session.canvasActions.handleCanvasResizeDrag
                : undefined
            }
            segmentation={session.segmentation}
          />
        </Container>
        {/*
          Tool top bar sits above the canvas in z-order but does not consume flex
          height, so wrap/resize of tool settings no longer shrinks the canvas or
          shifts the image. Pass-through clicks use pointer-events below.
        */}
        <Container
          padding="none"
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 2,
            pointerEvents: "none",
            "& > *": { pointerEvents: "auto" }
          }}
        >
          <ConnectedToolTopBar
            adjBrightness={session.canvasActions.adjBrightness}
            adjContrast={session.canvasActions.adjContrast}
            adjSaturation={session.canvasActions.adjSaturation}
            onAdjustBrightnessChange={session.canvasActions.setAdjBrightness}
            onAdjustContrastChange={session.canvasActions.setAdjContrast}
            onAdjustSaturationChange={session.canvasActions.setAdjSaturation}
            onAdjustApply={session.canvasActions.handleApplyAdjustments}
            onAdjustCancel={session.canvasActions.handleCancelAdjustments}
            onTransformCommit={session.canvasActions.handleTransformCommit}
            onTransformCancel={session.canvasActions.handleTransformCancel}
            onTransformReset={session.canvasActions.handleTransformReset}
            segmentation={session.segmentation}
            onRunSegmentation={commands.handleRunSegmentation}
            onClearSegmentPrompts={commands.handleClearSegmentPrompts}
            onCropCanvasToSelection={session.canvasActions.handleCropCanvasToSelection}
            onCropCommit={session.canvasActions.handleCropCommit}
            onCropCancelPreview={session.canvasActions.handleCropCancelPreview}
          />
        </Container>
      </FlexColumn>

      {/* Right column: layers panel above, generated-layer inspector below.
          Both subscribe directly to the sketch store so panelsHidden hides
          them independently of the rest of the editor. */}
      <FlexColumn
        className="sketch-editor__panel-right"
        sx={{
          width: SKETCH_SIZE.panelWidth,
          minWidth: SKETCH_SIZE.panelWidth,
          maxWidth: SKETCH_SIZE.panelWidth,
          minHeight: 0,
          flexShrink: 0,
          backgroundColor: theme.vars.palette.grey[800],
          borderLeft: `1px solid ${theme.vars.palette.grey[700]}`,
          overflow: "hidden"
        }}
        gap={0}
      >
        <CollapsibleSection
          className="sketch-editor__color-section"
          title="Color"
          defaultOpen
          compact
          sx={{
            borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
            "& > [role='button']": {
              padding: theme.spacing(0.75, 1),
              backgroundColor: theme.vars.palette.grey[800]
            }
          }}
        >
          <ConnectedColorPanel />
        </CollapsibleSection>

        <CollapsibleSection
          className="sketch-editor__layers-section"
          title="Layers"
          defaultOpen
          compact
          sx={{
            minHeight: 0,
            borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
            "& > [role='button']": {
              padding: theme.spacing(0.75, 1),
              backgroundColor: theme.vars.palette.grey[800]
            }
          }}
        >
          <ConnectedLayersPanel
            onClearLayer={session.canvasActions.handleClearLayer}
            onFlipHorizontal={session.layerActions.handleFlipHorizontal}
            onFlipVertical={session.layerActions.handleFlipVertical}
            onMergeDown={session.layerActions.handleMergeDown}
            onFlattenVisible={session.layerActions.handleFlattenVisible}
            onTrimLayerToBounds={session.canvasActions.handleTrimLayerToBounds}
            onCropCanvasToActiveLayerVisiblePixels={
              session.canvasActions.handleCropCanvasToActiveLayerVisiblePixels
            }
            onCropCanvasToActiveLayerExtents={
              session.canvasActions.handleCropCanvasToActiveLayerExtents
            }
            onCanvasResize={session.canvasActions.handleCanvasResize}
            onToggleVisibility={session.layerActions.handleToggleVisibility}
            onAddLayer={(fillColor) =>
              session.layerActions.handleAddLayer({
                fillColor: fillColor ?? undefined
              })
            }
            onRemoveLayer={session.layerActions.handleRemoveLayer}
            onDuplicateLayer={session.layerActions.handleDuplicateLayer}
            onReorderLayers={session.layerActions.handleReorderLayers}
            onSetMaskLayer={session.layerActions.handleSetMaskLayer}
            onToggleAlphaLock={session.layerActions.handleToggleAlphaLock}
            onToggleExposedInput={session.layerActions.handleToggleExposedInput}
            onToggleExposedOutput={session.layerActions.handleToggleExposedOutput}
            onLayerOpacityChange={session.layerActions.handleSetLayerOpacity}
            onLayerBlendModeChange={session.layerActions.handleSetLayerBlendMode}
            onRenameLayer={session.layerActions.handleRenameLayer}
            onAddGroup={session.layerActions.handleAddGroup}
            onToggleGroupCollapsed={session.layerActions.handleToggleGroupCollapsed}
            onMoveLayerToGroup={session.layerActions.handleMoveLayerToGroup}
            onUngroupLayer={session.layerActions.handleUngroupLayer}
            onGroupSelectedLayers={session.layerActions.handleGroupSelectedLayers}
            onMergeSelectedLayers={session.layerActions.handleMergeSelectedLayers}
            onDeleteSelectedLayers={session.layerActions.handleDeleteSelectedLayers}
            canvasResizeHandlesEnabled={session.canvasResizeHandlesEnabled}
            onCanvasResizeHandlesEnabledChange={
              session.handleCanvasResizeHandlesEnabledChange
            }
            onLoadLayerAsSelection={session.canvasActions.handleLoadLayerAsSelection}
          />
        </CollapsibleSection>

        <ConnectedGeneratedLayerSection />
      </FlexColumn>

      <ConnectedContextMenu
        open={session.canvasActions.contextMenu !== null}
        position={session.canvasActions.contextMenu}
        adjBrightness={session.canvasActions.adjBrightness}
        adjContrast={session.canvasActions.adjContrast}
        adjSaturation={session.canvasActions.adjSaturation}
        onClose={session.canvasActions.handleContextMenuClose}
        onAdjustBrightnessChange={session.canvasActions.setAdjBrightness}
        onAdjustContrastChange={session.canvasActions.setAdjContrast}
        onAdjustSaturationChange={session.canvasActions.setAdjSaturation}
        onAdjustApply={session.canvasActions.handleApplyAdjustments}
        onAdjustCancel={session.canvasActions.handleCancelAdjustments}
        onTransformCommit={session.canvasActions.handleTransformCommit}
        onTransformCancel={session.canvasActions.handleTransformCancel}
        onTransformReset={session.canvasActions.handleTransformReset}
        segmentation={session.segmentation}
        onRunSegmentation={commands.handleRunSegmentation}
        onClearSegmentPrompts={commands.handleClearSegmentPrompts}
        onSwapColors={session.colorStore.swapColors}
        onFillSelectionWithForeground={commands.handleFillSelectionWithForeground}
        onCropCanvasToSelection={session.canvasActions.handleCropCanvasToSelection}
        onNewLayer={commands.handleNewLayerFromContextMenu}
        onLayerViaCopy={commands.handleLayerViaCopy}
        onLayerViaCut={commands.handleLayerViaCut}
        onFreeTransform={commands.handleFreeTransform}
      />

      <TransformContextMenu
        open={session.canvasActions.transformContextMenu !== null}
        position={session.canvasActions.transformContextMenu}
        onClose={session.canvasActions.handleTransformContextMenuClose}
        onTransformCommit={session.canvasActions.handleTransformCommit}
        onTransformCancel={session.canvasActions.handleTransformCancel}
        onTransformReset={session.canvasActions.handleTransformReset}
        onRotate90CW={() => session.canvasActions.handleTransformRotate(Math.PI / 2)}
        onRotate90CCW={() => session.canvasActions.handleTransformRotate(-Math.PI / 2)}
        onRotate180={() => session.canvasActions.handleTransformRotate(Math.PI)}
        onFlipHorizontal={session.canvasActions.handleTransformFlipH}
        onFlipVertical={session.canvasActions.handleTransformFlipV}
      />
    </FlexRow>
  );
});

export default memo(SketchEditor);
