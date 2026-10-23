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
 * - The desktop panels sit in the shared dock (`components/dock`), the same
 *   draggable, resizable layout the timeline and game editors use. The panels
 *   and the built-in layouts are in `stores/sketch/SketchDockLayout`.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import ViewSidebarOutlinedIcon from "@mui/icons-material/ViewSidebarOutlined";
import {
  CollapsibleSection,
  ColorSwatch,
  Container,
  EmptyState,
  Fab,
  FlexColumn,
  FlexRow,
  InspectorSectionTitle,
  MobileBottomSheet,
  Tooltip,
  Z_INDEX
} from "../ui_primitives";
import TransformContextMenu from "./TransformContextMenu";
import { sketchSectionSx } from "./Inspector/sketchSectionSx";
import type { SketchDocument } from "./types";
import type { SketchPersistenceSnapshot } from "../../stores/sketch/persistence";
import {
  useColorIntentRouter,
  useEditorSession,
  useEditorCommands,
  useSketchIsMobile,
  useSketchAssistantCramped
} from "./hooks";
import {
  ConnectedStatusBar,
  ConnectedToolbar,
  ConnectedToolTopBar,
  ConnectedLayersPanel,
  ConnectedCanvasSizePanel,
  ConnectedContextMenu,
  SketchCanvasPane
} from "./editor-shell";
import { ConnectedGeneratedLayerSection } from "./Inspector/ConnectedGeneratedLayerSection";
import SketchAgentPanel from "./SketchAgentPanel";
import { SketchRulersAndGuides } from "./guides/SketchRulersAndGuides";
import { SketchHistoryPanel } from "./history/SketchHistoryPanel";
import { DockCanvas } from "../dock/DockCanvas";
import { DockLayoutMenu } from "../dock/DockLayoutMenu";
import { useDockPresentation, type DockPanelView } from "../dock/useDockPresentation";
import { sketchPanelRegistrations } from "./dock/sketchPanels";
import { useSketchDockLayoutStore } from "../../stores/sketch/useSketchDockLayoutStore";
import type { SketchPanelId } from "../../stores/sketch/SketchDockLayout";
import { useSketchAgentBridge } from "../../hooks/sketch/useSketchAgentBridge";
import { useSketchCanvasRefStore } from "../../stores/sketch/SketchCanvasRefStore";
import { useSketchSessionStore } from "../../stores/sketch/SketchSessionStore";
import { useSketchWorkflowFreshnessCheck } from "../../hooks/sketch/useSketchWorkflowFreshnessCheck";
import { ColorFieldPicker } from "./ColorFieldPicker";
import { SKETCH_PRESET_SWATCHES, colorToHex6 } from "./types";
import { useSketchStore } from "./state/useSketchStore";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    position: "relative",
    backgroundColor: theme.vars.palette.background.default,
    overflow: "hidden"
  });

export interface SketchEditorHandle {
  undo: () => void;
  redo: () => void;
  clearLayer: () => void;
  exportPng: () => void;
  /** Download the document as a layered PSD. */
  exportPsd: () => void;
  /** Pick a PSD file and import its layers. */
  importPsd: () => void;
  flipHorizontal: () => void;
  flipVertical: () => void;
  mergeDown: () => void;
  flattenVisible: () => void;
  discardToInitial: () => void;
  flushPendingChanges: () => void;
}

const PRESET_SWATCH_SIZE = 18;

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

/** Mounts before its first activation, so the canvas is ready under any layout. */
const EAGER_DOCK_PANELS: readonly SketchPanelId[] = ["canvas"];

/** Scrolling body of a docked side panel. The dock tab names the panel. */
function SketchDockPanel({ children }: { children: React.ReactNode }) {
  return (
    <FlexColumn
      className="sketch-editor__dock-panel"
      gap={0}
      sx={{ flex: 1, minHeight: 0, overflowY: "auto", userSelect: "none" }}
    >
      {children}
    </FlexColumn>
  );
}

/** Section header that mirrors the active foreground color as a hex chip. */
const ColorSectionHeader = memo(function ColorSectionHeader() {
  const { t } = useTranslation();
  const foregroundColor = useSketchStore((s) => s.foregroundColor) || "#ffffff";
  return (
    <InspectorSectionTitle title={t("i18n-next4.sketch.color.title")} meta={colorToHex6(foregroundColor)} />
  );
});

interface SketchEditorProps {
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
  /** Compact document actions rendered inline at the trailing edge of the tool
   * bar (e.g. Save/Done when embedded in an asset tab). Keep to one or two
   * buttons — the bar shares its row with the tool settings. */
  headerActions?: React.ReactNode;
  /** Document actions appended to the tool bar's overflow menu. Receives the
   * menu's close callback, and returns an array — MUI's Menu rejects a
   * Fragment child. */
  menuItems?: (close: () => void) => React.ReactNode[];
  ref?: React.Ref<SketchEditorHandle>;
}

function SketchEditor({
  initialDocument,
  initialEditorState,
  documentId,
  onDocumentChange,
  onExportImage,
  onExportMask,
  suspendKeyboardShortcuts,
  headerActions,
  menuItems,
  ref
}: SketchEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  // Tab toggles a fully chrome-less canvas view: hide the left tools
  // column AND the entire right panel column (color / layers / canvas).
  // The right column is gated here at the wrapper instead of inside
  // every child so the column's reserved width also collapses, letting
  // the canvas grow into the freed space.
  const panelsHidden = useSketchStore((s) => s.panelsHidden);
  const togglePanelsHidden = useSketchStore((s) => s.togglePanelsHidden);
  const assistantPanelOpen = useSketchStore((s) => s.assistantPanelOpen);

  // Measure the editor itself, including when embedded in a workspace pane.
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobile = useSketchIsMobile(containerRef);
  const mobilePanelsOpen = useSketchStore((s) => s.mobilePanelsOpen);
  const setMobilePanelsOpen = useSketchStore((s) => s.setMobilePanelsOpen);
  const setAssistantPanelOpen = useSketchStore((s) => s.setAssistantPanelOpen);

  // The mobile panels sheet is a mobile-only surface. Clear its flag when the
  // viewport grows to desktop (rotate/resize) so it doesn't silently reopen
  // the next time the viewport shrinks back to mobile. Also keep the two
  // mobile bottom sheets mutually exclusive: when the Assistant opens (its
  // toggle lives in the tool bar menu), close the panels sheet so two stacked
  // SwipeableDrawer modals never fight over focus/scroll.
  useEffect(() => {
    if (!mobilePanelsOpen) {
      return;
    }
    if (!isMobile || assistantPanelOpen) {
      setMobilePanelsOpen(false);
    }
  }, [isMobile, assistantPanelOpen, mobilePanelsOpen, setMobilePanelsOpen]);

  // The assistant remembers being open across sessions, which on desktop is
  // a docked column beside the canvas. On a phone it is a sheet over the
  // whole canvas, so a remembered "open" meant the editor came up with no
  // canvas in sight. Close it on entering the mobile layout without touching
  // the remembered preference; the tool bar toggle reopens it.
  useEffect(() => {
    if (isMobile) {
      setAssistantPanelOpen(false, { persist: false });
    }
  }, [isMobile, setAssistantPanelOpen]);

  // A workspace side panel (Chats, Assets) can narrow a desktop editor until
  // the docked assistant leaves the canvas a few hundred pixels wide. Close
  // the dock when that happens, keeping the remembered preference.
  const assistantCramped = useSketchAssistantCramped(containerRef);
  useEffect(() => {
    if (assistantCramped) {
      setAssistantPanelOpen(false, { persist: false });
    }
  }, [assistantCramped, setAssistantPanelOpen]);

  // Register the agent bridge under this document's id so the `ui_sketch_*`
  // tools can address it whether or not this surface is focused. The session
  // store is the authority: a never-saved document has no id yet, and gains
  // one the moment it is persisted.
  const sessionDocumentId = useSketchSessionStore((s) => s.documentId);
  useSketchAgentBridge(sessionDocumentId);

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
    const pushHistory = session.historyStore.pushHistory;
    setCanvasGetters({
      flattenToDataUrl: () => canvasRef.current?.flattenToDataUrl() ?? "",
      getMaskDataUrl: () => canvasRef.current?.getMaskDataUrl() ?? null,
      setLayerData: (layerId, data) =>
        canvasRef.current?.setLayerData(layerId, data),
      getLayerData: (layerId) =>
        canvasRef.current?.getLayerData(layerId) ?? null,
      fillLayerWithColor: (layerId, color) =>
        canvasRef.current?.fillLayerWithColor(layerId, color),
      paintStrokes: (strokes) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error(t("i18n-next102.sketch.errors.canvasNotReady"));
        }
        // A pointer stroke may still be waiting for its rAF merge; drain it so
        // the checkpoint below snapshots the layer as the user last saw it.
        canvas.drainPendingStrokeCommit();

        const targets = [...new Set(strokes.map((s) => s.layerId))];
        const snapshots: Record<string, HTMLCanvasElement | null> = {};
        for (const layerId of targets) {
          snapshots[layerId] = canvas.snapshotLayerCanvas(layerId);
        }
        // One checkpoint for the whole batch, pushed before any pixel moves —
        // the push-before-mutate convention a pointer stroke uses on
        // pointer-down. Undo therefore rewinds the entire batch at once.
        pushHistory(
          strokes.length === 1
            ? "paint stroke"
            : `paint ${strokes.length} strokes`,
          snapshots,
          { timing: "before" }
        );

        const outcomes = canvas.paintStrokes(strokes);

        // Same finalization a pointer stroke runs: persist the pixels onto the
        // document (which marks it dirty for autosave) and flag the sketch
        // node's image/mask outputs for re-export.
        for (const layerId of targets) {
          session.canvasActions.handleStrokeEnd(
            layerId,
            canvas.getLayerData(layerId)
          );
        }
        return outcomes;
      },
      applyLayerRasterOp: (layerId, label, mutate) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error(t("i18n-next102.sketch.errors.canvasNotReady"));
        }
        canvas.drainPendingStrokeCommit();
        pushHistory(
          label,
          { [layerId]: canvas.snapshotLayerCanvas(layerId) },
          { timing: "before" }
        );
        canvas.mutateLayerPixels(layerId, mutate);
        session.canvasActions.handleStrokeEnd(
          layerId,
          canvas.getLayerData(layerId)
        );
      },
      cropDocument: (x, y, width, height) => {
        session.canvasActions.handleCropComplete(x, y, width, height);
      },
      sampleColor: (layerId, x, y) => {
        const canvas = canvasRef.current;
        if (!canvas) {
          throw new Error(t("i18n-next102.sketch.errors.canvasNotReady"));
        }
        if (layerId === null) {
          return canvas.sampleComposite(x, y);
        }
        return canvas.sampleLayer(layerId, x, y);
      },
      clearActiveLayer: () => session.canvasActions.handleClearLayer(),
      fitViewToScreen: () => session.canvasActions.handleZoomFit(),
      // The whole layer verb, runtime bake included. The agent bridge calls
      // these instead of the store actions: merge and flatten are two-part
      // operations whose store half assumes the runtime already baked the
      // pixels, so running the store half alone silently discards them.
      addLayer: (options) => session.layerActions.handleAddLayer(options),
      removeLayer: (layerId) => session.layerActions.handleRemoveLayer(layerId),
      duplicateLayer: (layerId) =>
        session.layerActions.handleDuplicateLayer(layerId),
      mergeLayerDown: (upperLayerId) =>
        session.layerActions.handleMergeLayerDown(upperLayerId),
      flattenVisible: () => session.layerActions.handleFlattenVisible(),
      resizeCanvas: (width, height) =>
        session.canvasActions.handleCanvasResize(width, height)
    });
    return () => {
      clearCanvasGetters();
    };
  }, [
    session.canvasRef,
    session.canvasActions,
    session.layerActions,
    session.historyStore,
    setCanvasGetters,
    clearCanvasGetters
  ]);

  // Reconcile bindings on document load: stale-mark layers whose source
  // workflow changed, merge paramOverrides against current Input* nodes,
  // and auto-resolve a missing selectedOutputNodeId.
  useSketchWorkflowFreshnessCheck(sessionDocumentId);

  // ─── Dock (the shared panel layout the timeline and game editors use) ─
  const dockStore = useSketchDockLayoutStore();
  const dockLayout = useStore(dockStore, (state) => state.layout);
  const dockRoot = useRef<HTMLDivElement>(null);
  const dockRegistrations = useMemo(() => sketchPanelRegistrations(t), [t]);
  useEffect(() => {
    dockStore.getState().registerPanels(dockRegistrations);
  }, [dockStore, dockRegistrations, dockLayout]);

  // The assistant's open flag also drives the phone sheet and the toolbar
  // toggle, so it and the dock's hidden list follow each other: the toggle
  // shows or hides the dock panel, and closing the tab or choosing a layout
  // updates the flag.
  const assistantDockHidden = dockLayout.hidden.includes("assistant");
  useEffect(() => {
    const state = dockStore.getState();
    if (assistantPanelOpen) {
      state.revealPanel("assistant");
    } else {
      state.dispatch({ type: "hide", panelId: "assistant" });
    }
  }, [assistantPanelOpen, dockStore]);
  const lastAssistantDockHidden = useRef(assistantDockHidden);
  useEffect(() => {
    if (lastAssistantDockHidden.current === assistantDockHidden) {
      return;
    }
    lastAssistantDockHidden.current = assistantDockHidden;
    if (assistantDockHidden === assistantPanelOpen) {
      setAssistantPanelOpen(!assistantDockHidden);
    }
  }, [assistantDockHidden, assistantPanelOpen, setAssistantPanelOpen]);

  const layoutMenu = useMemo(
    () =>
      isMobile ? undefined : (
        <DockLayoutMenu store={dockStore} panels={dockRegistrations} />
      ),
    [dockStore, dockRegistrations, isMobile]
  );

  // The panel bodies. The desktop dock shows each as its own panel; the
  // mobile bottom sheet stacks them as collapsible sections.
  const layersPanel = (
    <ConnectedLayersPanel
      onClearLayer={session.canvasActions.handleClearLayer}
      onFlipHorizontal={session.layerActions.handleFlipHorizontal}
      onFlipVertical={session.layerActions.handleFlipVertical}
      onRotate180={session.layerActions.handleRotate180}
      onMergeDown={session.layerActions.handleMergeDown}
      onFlattenVisible={session.layerActions.handleFlattenVisible}
      onTrimLayerToBounds={session.canvasActions.handleTrimLayerToBounds}
      onCropCanvasToActiveLayerVisiblePixels={
        session.canvasActions.handleCropCanvasToActiveLayerVisiblePixels
      }
      onCropCanvasToActiveLayerExtents={
        session.canvasActions.handleCropCanvasToActiveLayerExtents
      }
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
      onLoadLayerAsSelection={session.canvasActions.handleLoadLayerAsSelection}
    />
  );
  const historyPanel = (
    <SketchHistoryPanel onUndo={session.handleUndo} onRedo={session.handleRedo} />
  );
  const canvasSizePanel = (
    <ConnectedCanvasSizePanel
      onCanvasResize={session.canvasActions.handleCanvasResize}
      canvasResizeHandlesEnabled={session.canvasResizeHandlesEnabled}
      onCanvasResizeHandlesEnabledChange={
        session.handleCanvasResizeHandlesEnabledChange
      }
    />
  );

  const sectionSx = sketchSectionSx(theme);
  const mobilePanelSections = (
    <>
      <CollapsibleSection
        className="sketch-editor__color-section"
        title={<ColorSectionHeader />}
        defaultOpen={false}
        compact
        sx={sectionSx}
      >
        <ConnectedColorPanel />
      </CollapsibleSection>

      <CollapsibleSection
        className="sketch-editor__layers-section"
        title={<InspectorSectionTitle title={t("i18n-next4.sketch.layers")} />}
        defaultOpen
        compact
        sx={{ ...sectionSx, minHeight: 0 }}
      >
        {layersPanel}
      </CollapsibleSection>

      <CollapsibleSection
        className="sketch-editor__history-section"
        title={<InspectorSectionTitle title={t("i18n-next4.sketch.history")} />}
        defaultOpen={false}
        compact
        sx={sectionSx}
      >
        {historyPanel}
      </CollapsibleSection>

      <CollapsibleSection
        className="sketch-editor__canvas-section"
        title={<InspectorSectionTitle title={t("i18n-next4.sketch.canvas")} />}
        defaultOpen={false}
        compact
        sx={sectionSx}
      >
        {canvasSizePanel}
      </CollapsibleSection>

      <ConnectedGeneratedLayerSection />
    </>
  );

  const canvasPane = (
    <FlexColumn
      className="sketch-editor__workspace"
      sx={{
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
        minWidth: 0,
        containerType: "inline-size",
        containerName: "sketch-workspace",
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
          zIndex: Z_INDEX.raised,
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
          onLayerTransformChange={
            session.canvasActions.handleCommitLayerTransform
          }
          onLayerContentBoundsChange={session.layerStore.setLayerContentBounds}
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
        <SketchRulersAndGuides />
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
          zIndex: Z_INDEX.raised + 1,
          pointerEvents: "none",
          "& > *": { pointerEvents: "auto" }
        }}
      >
        <ConnectedToolTopBar
          compactLayout={isMobile}
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
          onCropCanvasToSelection={
            session.canvasActions.handleCropCanvasToSelection
          }
          onCropCommit={session.canvasActions.handleCropCommit}
          onCropCancelPreview={session.canvasActions.handleCropCancelPreview}
          headerActions={headerActions}
          menuItems={menuItems}
          layoutMenu={layoutMenu}
        />
      </Container>

      {/* Restoring the chrome is otherwise Tab-only, and a touch device
          has no Tab key — keep one always-visible affordance on the bare
          canvas. */}
      {panelsHidden && (
        <Tooltip title={t("i18n-next4.sketch.showPanels")}>
          <Fab
            className="sketch-editor__show-panels-fab"
            size="small"
            aria-label={t("i18n-next4.sketch.showPanels")}
            onClick={togglePanelsHidden}
            sx={{
              position: "absolute",
              top: (t) => t.spacing(1),
              right: (t) => t.spacing(1),
              zIndex: Z_INDEX.raised + 2
            }}
          >
            <ViewSidebarOutlinedIcon fontSize="small" />
          </Fab>
        </Tooltip>
      )}
    </FlexColumn>
  );

  // The side panels sit in the dock on desktop. On a phone, and while Tab
  // hides the chrome, only the canvas shows; the panels keep their places in
  // the layout. The canvas never leaves the dock, so it never remounts.
  const sidePanelsShown = !isMobile && !panelsHidden;
  const dockViews: DockPanelView[] = [
    { id: "canvas", node: canvasPane },
    {
      id: "color",
      node: <SketchDockPanel><ConnectedColorPanel /></SketchDockPanel>,
      visible: sidePanelsShown
    },
    { id: "layers", node: <SketchDockPanel>{layersPanel}</SketchDockPanel>, visible: sidePanelsShown },
    { id: "history", node: <SketchDockPanel>{historyPanel}</SketchDockPanel>, visible: sidePanelsShown },
    {
      id: "properties",
      node: (
        <SketchDockPanel>
          <ConnectedGeneratedLayerSection
            emptyState={
              <EmptyState
                size="small"
                icon={<TuneOutlinedIcon />}
                title={t("i18n-next4.sketch.dock.noProperties")}
                description={t("i18n-next4.sketch.dock.noPropertiesDescription")}
              />
            }
          />
        </SketchDockPanel>
      ),
      visible: sidePanelsShown
    },
    { id: "canvasSize", node: <SketchDockPanel>{canvasSizePanel}</SketchDockPanel>, visible: sidePanelsShown },
    {
      id: "assistant",
      node: (
        <FlexColumn
          className="sketch-editor__assistant-panel"
          gap={0}
          sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          <SketchAgentPanel />
        </FlexColumn>
      ),
      visible: sidePanelsShown
    }
  ];
  const shownDockViews = dockViews.filter((view) => view.visible !== false);
  const dockPresentation = useDockPresentation({
    store: dockStore,
    layout: dockLayout,
    registry: dockRegistrations,
    availableIds: shownDockViews.map((view) => view.id),
    views: shownDockViews,
    root: dockRoot
  });

  return (
    <FlexColumn ref={containerRef} className="sketch-editor" css={styles(theme)} gap={0}>
      <FlexRow
        className="sketch-editor__body"
        sx={{ flex: 1, minHeight: 0, width: "100%", overflow: "hidden" }}
      >
        {/* ConnectedToolbar subscribes to its own state — no prop drilling */}
        <ConnectedToolbar />

        <FlexColumn
          ref={dockRoot}
          className="sketch-editor__dock"
          sx={{ flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}
        >
          <DockCanvas
            presentation={dockPresentation}
            store={dockStore}
            eagerPanels={EAGER_DOCK_PANELS}
            tabless={!sidePanelsShown}
          />
        </FlexColumn>
      </FlexRow>

      {/* ── Mobile chrome ─────────────────────────────────────────────
          On narrow viewports the right panel and assistant can't dock beside
          the canvas, so they become bottom sheets and a floating button opens
          the panels sheet. Gated on the same panelsHidden chrome toggle. */}
      {isMobile && !panelsHidden && (
        <>
          <Tooltip title={t("i18n-next4.sketch.layersAndColor")}>
            <Fab
              className="sketch-editor__mobile-panels-fab"
              size="medium"
              color="primary"
              aria-label={t("i18n-next4.sketch.openLayersAndColorPanel")}
              onClick={() => {
                // Last action wins — never stack the two mobile sheets.
                setAssistantPanelOpen(false);
                setMobilePanelsOpen(true);
              }}
              sx={{
                position: "absolute",
                bottom: (t) => t.spacing(2),
                right: (t) => t.spacing(2),
                zIndex: Z_INDEX.raised + 2
              }}
            >
              <LayersOutlinedIcon />
            </Fab>
          </Tooltip>

          {mobilePanelsOpen && (
            <MobileBottomSheet
              open={mobilePanelsOpen}
              onClose={() => setMobilePanelsOpen(false)}
              title={t("i18n-next4.sketch.layersAndColor")}
              ariaLabel={t("i18n-next4.sketch.layersAndColorPanel")}
            >
              <FlexColumn
                className="sketch-editor__panel-right sketch-editor__panel-right--mobile"
                sx={{ minHeight: 0, overflow: "auto" }}
                gap={0}
              >
                {mobilePanelSections}
              </FlexColumn>
            </MobileBottomSheet>
          )}

          {assistantPanelOpen && (
            <MobileBottomSheet
              open={assistantPanelOpen}
              onClose={() => setAssistantPanelOpen(false)}
              title={t("i18n-next4.sketch.assistant")}
              ariaLabel={t("i18n-next4.sketch.aiAssistantPanel")}
              maxHeight="85vh"
            >
              <FlexColumn
                className="sketch-editor__assistant-panel sketch-editor__assistant-panel--mobile"
                sx={{ height: "70vh", minHeight: 0, overflow: "hidden" }}
                gap={0}
              >
                <SketchAgentPanel />
              </FlexColumn>
            </MobileBottomSheet>
          )}
        </>
      )}

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
        onRotate180={() => session.canvasActions.handleTransformRotate(Math.PI)}
        onFlipHorizontal={session.canvasActions.handleTransformFlipH}
        onFlipVertical={session.canvasActions.handleTransformFlipV}
      />
    </FlexColumn>
  );
}

export default memo(SketchEditor);
