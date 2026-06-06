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
  Chip,
  CollapsibleSection,
  ColorSwatch,
  Container,
  FlexColumn,
  FlexRow,
  Text
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
  ConnectedModePromptBar,
  ConnectedStatusBar,
  ConnectedToolbar,
  ConnectedToolTopBar,
  ConnectedLayersPanel,
  ConnectedCanvasSizePanel,
  ConnectedContextMenu,
  SketchCanvasPane
} from "./editor-shell";
import { ConnectedGeneratedLayerSection } from "./Inspector";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchWorkflowFreshnessCheck } from "../../hooks/sketch/useSketchWorkflowFreshnessCheck";
import { SKETCH_SIZE, SKETCH_FONT } from "./sketchStyles";
import { ColorFieldPicker } from "./ColorFieldPicker";
import { SKETCH_PRESET_SWATCHES, colorToHex6 } from "./types";
import { useSketchStore } from "./state/useSketchStore";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
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

const PRESET_SWATCH_SIZE = 18;

/** Bright, uppercase, letter-spaced label for the right-panel section headers. */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Text
    size="small"
    sx={{
      textTransform: "uppercase",
      letterSpacing: "0.06em",
      fontWeight: 600,
      color: "text.primary",
      fontSize: SKETCH_FONT.section
    }}
  >
    {children}
  </Text>
);

const ConnectedColorPanel = memo(function ConnectedColorPanel() {
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  const handleFgColorChange = useColorIntentRouter();
  const currentHex = colorToHex6(foregroundColor);

  return (
    <FlexColumn gap={1} sx={{ p: 1 }}>
      <ColorFieldPicker
        color={foregroundColor}
        onColorChange={handleFgColorChange}
      />
      <FlexRow gap={0.5} sx={{ flexWrap: "wrap" }}>
        {SKETCH_PRESET_SWATCHES.map((c) => (
          <ColorSwatch
            key={c}
            color={c}
            size={PRESET_SWATCH_SIZE}
            selected={colorToHex6(c) === currentHex}
            onClick={handleFgColorChange}
            showTooltip
          />
        ))}
      </FlexRow>
    </FlexColumn>
  );
});

/** Section header that mirrors the active foreground color as a hex chip. */
const ColorSectionHeader = memo(function ColorSectionHeader() {
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  return (
    <FlexRow
      align="center"
      justify="space-between"
      sx={{ width: "100%", pr: 1 }}
    >
      <SectionTitle>Color</SectionTitle>
      <Chip
        compact
        label={colorToHex6(foregroundColor)}
        sx={{ fontFamily: SKETCH_FONT.familyMono }}
      />
    </FlexRow>
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
  /** Document-level actions rendered at the trailing edge of the top mode bar
   * (e.g. Save/Done when embedded in an asset tab). */
  headerActions?: React.ReactNode;
}

const SketchEditor = forwardRef<SketchEditorHandle, SketchEditorProps>(
  function SketchEditor(
    {
      initialDocument,
      initialEditorState,
      documentId,
      onDocumentChange,
      onExportImage,
      onExportMask,
      suspendKeyboardShortcuts,
      headerActions
    },
    ref
  ) {
    const theme = useTheme();
    // Tab toggles a fully chrome-less canvas view: hide the left tools
    // column AND the entire right panel column (color / layers / canvas).
    // The right column is gated here at the wrapper instead of inside
    // every child so the column's reserved width also collapses, letting
    // the canvas grow into the freed space.
    const panelsHidden = useSketchStore((s) => s.panelsHidden);

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
          canvasRef.current?.setLayerData(layerId, data),
        clearActiveLayer: () => session.canvasActions.handleClearLayer()
      });
      return () => {
        clearCanvasGetters();
      };
    }, [
      session.canvasRef,
      session.canvasActions,
      setCanvasGetters,
      clearCanvasGetters
    ]);

    // Reconcile bindings on document load: stale-mark layers whose source
    // workflow changed, merge paramOverrides against current Input* nodes,
    // and auto-resolve a missing selectedOutputNodeId.
    const sessionDocumentId = useSketchSessionStore((s) => s.documentId);
    useSketchWorkflowFreshnessCheck(sessionDocumentId);

    return (
      <FlexColumn className="sketch-editor" css={styles(theme)} gap={0}>
        {/* Top mode / prompt bar — full editor width above the 3-column body.
          Renders nothing without a bound document (in-node modal). */}
        <ConnectedModePromptBar trailingActions={headerActions} />

        <FlexRow
          className="sketch-editor__body"
          sx={{ flex: 1, minHeight: 0, width: "100%", overflow: "hidden" }}
        >
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
                onCanvasLeave={
                  session.canvasActions.flushLayerThumbnailsWhenIdle
                }
                onLayerTransformChange={
                  session.canvasActions.handleCommitLayerTransform
                }
                onLayerContentBoundsChange={
                  session.layerStore.setLayerContentBounds
                }
                onBrushSizeChange={session.colorActions.handleBrushSizeChange}
                onContextMenu={session.canvasActions.handleContextMenu}
                onTransformContextMenu={
                  session.canvasActions.handleTransformContextMenu
                }
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
                onAdjustBrightnessChange={
                  session.canvasActions.setAdjBrightness
                }
                onAdjustContrastChange={session.canvasActions.setAdjContrast}
                onAdjustSaturationChange={
                  session.canvasActions.setAdjSaturation
                }
                onAdjustApply={session.canvasActions.handleApplyAdjustments}
                onAdjustCancel={session.canvasActions.handleCancelAdjustments}
                onTransformCommit={session.canvasActions.handleTransformCommit}
                onTransformCancel={session.canvasActions.handleTransformCancel}
                onTransformReset={session.canvasActions.handleTransformReset}
                segmentation={session.segmentation}
                onRunSegmentation={commands.handleRunSegmentation}
                onClearSegmentPrompts={commands.handleClearSegmentPrompts}
                onCropCanvasToSelection={
                  session.canvasActions.handleCropCanvasToSelection
                }
                onCropCommit={session.canvasActions.handleCropCommit}
                onCropCancelPreview={
                  session.canvasActions.handleCropCancelPreview
                }
              />
            </Container>
          </FlexColumn>

          {/* Right column: color, layers, canvas size sections. The wrapper
          itself is gated on `panelsHidden` so Tab collapses the column's
          reserved width (not just blanks its contents), giving the
          canvas the freed real estate. */}
          {!panelsHidden && (
            <FlexColumn
              className="sketch-editor__panel-right"
              sx={{
                width: SKETCH_SIZE.panelWidth,
                minWidth: SKETCH_SIZE.panelWidth,
                maxWidth: SKETCH_SIZE.panelWidth,
                minHeight: 0,
                flexShrink: 0,
                backgroundColor: theme.vars.palette.background.paper,
                borderLeft: `1px solid ${theme.vars.palette.divider}`,
                overflow: "hidden"
              }}
              gap={0}
            >
              <CollapsibleSection
                className="sketch-editor__color-section"
                title={<ColorSectionHeader />}
                defaultOpen
                compact
                sx={{
                  fontSize: theme.fontSizeSmall,
                  borderBottom: `1px solid ${theme.vars.palette.divider}`,
                  "& > [role='button']": {
                    padding: theme.spacing(1, 1),
                    backgroundColor: theme.vars.palette.background.paper
                  }
                }}
              >
                <ConnectedColorPanel />
              </CollapsibleSection>

              <CollapsibleSection
                className="sketch-editor__layers-section"
                title={<SectionTitle>Layers</SectionTitle>}
                defaultOpen
                compact
                sx={{
                  fontSize: theme.fontSizeSmall,
                  minHeight: 0,
                  borderBottom: `1px solid ${theme.vars.palette.divider}`,
                  "& > [role='button']": {
                    padding: theme.spacing(1, 1),
                    backgroundColor: theme.vars.palette.background.paper
                  }
                }}
              >
                <ConnectedLayersPanel
                  onClearLayer={session.canvasActions.handleClearLayer}
                  onFlipHorizontal={session.layerActions.handleFlipHorizontal}
                  onFlipVertical={session.layerActions.handleFlipVertical}
                  onRotate180={session.layerActions.handleRotate180}
                  onMergeDown={session.layerActions.handleMergeDown}
                  onFlattenVisible={session.layerActions.handleFlattenVisible}
                  onTrimLayerToBounds={
                    session.canvasActions.handleTrimLayerToBounds
                  }
                  onCropCanvasToActiveLayerVisiblePixels={
                    session.canvasActions
                      .handleCropCanvasToActiveLayerVisiblePixels
                  }
                  onCropCanvasToActiveLayerExtents={
                    session.canvasActions.handleCropCanvasToActiveLayerExtents
                  }
                  onToggleVisibility={
                    session.layerActions.handleToggleVisibility
                  }
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
                  onToggleExposedInput={
                    session.layerActions.handleToggleExposedInput
                  }
                  onToggleExposedOutput={
                    session.layerActions.handleToggleExposedOutput
                  }
                  onLayerOpacityChange={
                    session.layerActions.handleSetLayerOpacity
                  }
                  onLayerBlendModeChange={
                    session.layerActions.handleSetLayerBlendMode
                  }
                  onRenameLayer={session.layerActions.handleRenameLayer}
                  onAddGroup={session.layerActions.handleAddGroup}
                  onToggleGroupCollapsed={
                    session.layerActions.handleToggleGroupCollapsed
                  }
                  onMoveLayerToGroup={
                    session.layerActions.handleMoveLayerToGroup
                  }
                  onUngroupLayer={session.layerActions.handleUngroupLayer}
                  onGroupSelectedLayers={
                    session.layerActions.handleGroupSelectedLayers
                  }
                  onMergeSelectedLayers={
                    session.layerActions.handleMergeSelectedLayers
                  }
                  onDeleteSelectedLayers={
                    session.layerActions.handleDeleteSelectedLayers
                  }
                  onLoadLayerAsSelection={
                    session.canvasActions.handleLoadLayerAsSelection
                  }
                />
              </CollapsibleSection>

              <CollapsibleSection
                className="sketch-editor__canvas-section"
                title={<SectionTitle>Canvas</SectionTitle>}
                defaultOpen={false}
                compact
                sx={{
                  fontSize: theme.fontSizeSmall,
                  borderBottom: `1px solid ${theme.vars.palette.divider}`,
                  "& > [role='button']": {
                    padding: theme.spacing(1, 1),
                    backgroundColor: theme.vars.palette.background.paper
                  }
                }}
              >
                <ConnectedCanvasSizePanel
                  onCanvasResize={session.canvasActions.handleCanvasResize}
                  canvasResizeHandlesEnabled={
                    session.canvasResizeHandlesEnabled
                  }
                  onCanvasResizeHandlesEnabledChange={
                    session.handleCanvasResizeHandlesEnabledChange
                  }
                />
              </CollapsibleSection>

              <ConnectedGeneratedLayerSection />
            </FlexColumn>
          )}
        </FlexRow>

        {/* Full-width status bar — standalone editor only (gates internally). */}
        <ConnectedStatusBar />

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
          onFillSelectionWithForeground={
            commands.handleFillSelectionWithForeground
          }
          onStrokeSelectionWithForeground={
            commands.handleStrokeSelectionWithForeground
          }
          onCropCanvasToSelection={
            session.canvasActions.handleCropCanvasToSelection
          }
          onLayerViaCopy={commands.handleLayerViaCopy}
          onLayerViaCut={commands.handleLayerViaCut}
        />

        <TransformContextMenu
          open={session.canvasActions.transformContextMenu !== null}
          position={session.canvasActions.transformContextMenu}
          onClose={session.canvasActions.handleTransformContextMenuClose}
          onTransformCommit={session.canvasActions.handleTransformCommit}
          onTransformCancel={session.canvasActions.handleTransformCancel}
          onTransformReset={session.canvasActions.handleTransformReset}
          onRotate90CW={() =>
            session.canvasActions.handleTransformRotate(Math.PI / 2)
          }
          onRotate90CCW={() =>
            session.canvasActions.handleTransformRotate(-Math.PI / 2)
          }
          onRotate180={() =>
            session.canvasActions.handleTransformRotate(Math.PI)
          }
          onFlipHorizontal={session.canvasActions.handleTransformFlipH}
          onFlipVertical={session.canvasActions.handleTransformFlipV}
        />
      </FlexColumn>
    );
  }
);

export default memo(SketchEditor);
