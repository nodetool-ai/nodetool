/**
 * SketchEditor
 *
 * Main sketch editor component that composes the canvas, toolbar, and layers panel.
 * Manages the editor state via the sketch store and handles keyboard shortcuts.
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import SketchCanvas, { SketchCanvasRef } from "./SketchCanvas";
import SketchToolbar from "./SketchToolbar";
import SketchLayersPanel from "./SketchLayersPanel";
import { useSketchStore } from "./state";
import { SketchDocument } from "./types";

const styles = (theme: Theme) =>
  css({
    display: "flex",
    width: "100%",
    height: "100%",
    backgroundColor: theme.vars.palette.grey[900],
    overflow: "hidden"
  });

export interface SketchEditorProps {
  initialDocument?: SketchDocument;
  onDocumentChange?: (doc: SketchDocument) => void;
  onExportImage?: (dataUrl: string) => void;
  onExportMask?: (dataUrl: string | null) => void;
}

const SketchEditor: React.FC<SketchEditorProps> = ({
  initialDocument,
  onDocumentChange,
  onExportImage,
  onExportMask
}) => {
  const theme = useTheme();
  const canvasRef = useRef<SketchCanvasRef>(null);
  const [mirrorX, setMirrorX] = useState(false);

  // ─── Store selectors ────────────────────────────────────────────────
  const document = useSketchStore((s) => s.document);
  const activeTool = useSketchStore((s) => s.activeTool);
  const zoom = useSketchStore((s) => s.zoom);
  const pan = useSketchStore((s) => s.pan);
  const setDocument = useSketchStore((s) => s.setDocument);
  const setActiveTool = useSketchStore((s) => s.setActiveTool);
  const setBrushSettings = useSketchStore((s) => s.setBrushSettings);
  const setEraserSettings = useSketchStore((s) => s.setEraserSettings);
  const setShapeSettings = useSketchStore((s) => s.setShapeSettings);
  const setFillSettings = useSketchStore((s) => s.setFillSettings);
  const setZoom = useSketchStore((s) => s.setZoom);
  const setPan = useSketchStore((s) => s.setPan);
  const setActiveLayer = useSketchStore((s) => s.setActiveLayer);
  const addLayer = useSketchStore((s) => s.addLayer);
  const removeLayer = useSketchStore((s) => s.removeLayer);
  const duplicateLayer = useSketchStore((s) => s.duplicateLayer);
  const reorderLayers = useSketchStore((s) => s.reorderLayers);
  const toggleLayerVisibility = useSketchStore((s) => s.toggleLayerVisibility);
  const setLayerOpacity = useSketchStore((s) => s.setLayerOpacity);
  const setLayerBlendMode = useSketchStore((s) => s.setLayerBlendMode);
  const renameLayer = useSketchStore((s) => s.renameLayer);
  const updateLayerData = useSketchStore((s) => s.updateLayerData);
  const setMaskLayer = useSketchStore((s) => s.setMaskLayer);
  const pushHistory = useSketchStore((s) => s.pushHistory);
  const undo = useSketchStore((s) => s.undo);
  const redo = useSketchStore((s) => s.redo);
  const canUndo = useSketchStore((s) => s.canUndo);
  const canRedo = useSketchStore((s) => s.canRedo);

  // ─── Initialize from prop ───────────────────────────────────────────
  const initializedRef = useRef(false);
  useEffect(() => {
    if (initialDocument && !initializedRef.current) {
      setDocument(initialDocument);
      initializedRef.current = true;
    }
  }, [initialDocument, setDocument]);

  // ─── Autosave on document changes ──────────────────────────────────
  useEffect(() => {
    if (onDocumentChange && initializedRef.current) {
      onDocumentChange(document);
    }
  }, [document, onDocumentChange]);

  // ─── Stroke handlers ───────────────────────────────────────────────
  const handleStrokeStart = useCallback(() => {
    pushHistory(`${activeTool} stroke`);
  }, [pushHistory, activeTool]);

  const handleStrokeEnd = useCallback(
    (layerId: string, data: string | null) => {
      updateLayerData(layerId, data);

      if (canvasRef.current) {
        if (onExportImage) {
          onExportImage(canvasRef.current.flattenToDataUrl());
        }
        if (onExportMask) {
          onExportMask(canvasRef.current.getMaskDataUrl());
        }
      }
    },
    [updateLayerData, onExportImage, onExportMask]
  );

  // ─── Eyedropper event ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.color) {
        setBrushSettings({ color: detail.color });
        setActiveTool("brush");
      }
    };
    window.addEventListener("sketch-eyedropper", handler);
    return () => window.removeEventListener("sketch-eyedropper", handler);
  }, [setBrushSettings, setActiveTool]);

  // ─── Undo/Redo handlers ────────────────────────────────────────────
  const handleUndo = useCallback(() => {
    const entry = undo();
    if (entry && canvasRef.current) {
      for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
        canvasRef.current.setLayerData(layerId, data);
      }
    }
  }, [undo]);

  const handleRedo = useCallback(() => {
    const entry = redo();
    if (entry && canvasRef.current) {
      for (const [layerId, data] of Object.entries(entry.layerSnapshots)) {
        canvasRef.current.setLayerData(layerId, data);
      }
    }
  }, [redo]);

  // ─── Keyboard shortcuts ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        }
        if (e.key === "y") {
          e.preventDefault();
          handleRedo();
        }
      } else {
        switch (e.key.toLowerCase()) {
          case "b": setActiveTool("brush"); break;
          case "e": setActiveTool("eraser"); break;
          case "i": setActiveTool("eyedropper"); break;
          case "g": setActiveTool("fill"); break;
          case "l": setActiveTool("line"); break;
          case "r": setActiveTool("rectangle"); break;
          case "o": setActiveTool("ellipse"); break;
          case "a": setActiveTool("arrow"); break;
          case "m": setMirrorX((prev) => !prev); break;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Zoom handlers ─────────────────────────────────────────────────
  const handleZoomIn = useCallback(() => setZoom(zoom * 1.2), [zoom, setZoom]);
  const handleZoomOut = useCallback(() => setZoom(zoom * 0.8), [zoom, setZoom]);
  const handleZoomReset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [setZoom, setPan]);

  // ─── Layer reorder ─────────────────────────────────────────────────
  const handleMoveLayerUp = useCallback(
    (index: number) => {
      if (index < document.layers.length - 1) {
        reorderLayers(index, index + 1);
      }
    },
    [document.layers.length, reorderLayers]
  );

  const handleMoveLayerDown = useCallback(
    (index: number) => {
      if (index > 0) {
        reorderLayers(index, index - 1);
      }
    },
    [reorderLayers]
  );

  return (
    <Box css={styles(theme)}>
      <SketchToolbar
        activeTool={activeTool}
        brushSettings={document.toolSettings.brush}
        eraserSettings={document.toolSettings.eraser}
        shapeSettings={document.toolSettings.shape}
        fillSettings={document.toolSettings.fill}
        zoom={zoom}
        mirrorX={mirrorX}
        canUndo={canUndo()}
        canRedo={canRedo()}
        onToolChange={setActiveTool}
        onBrushSettingsChange={setBrushSettings}
        onEraserSettingsChange={setEraserSettings}
        onShapeSettingsChange={setShapeSettings}
        onFillSettingsChange={setFillSettings}
        onMirrorXChange={setMirrorX}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onZoomReset={handleZoomReset}
      />

      <Box sx={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <SketchCanvas
          ref={canvasRef}
          document={document}
          activeTool={activeTool}
          zoom={zoom}
          pan={pan}
          mirrorX={mirrorX}
          onZoomChange={setZoom}
          onPanChange={setPan}
          onStrokeStart={handleStrokeStart}
          onStrokeEnd={handleStrokeEnd}
        />
      </Box>

      <SketchLayersPanel
        layers={document.layers}
        activeLayerId={document.activeLayerId}
        maskLayerId={document.maskLayerId}
        onSelectLayer={setActiveLayer}
        onToggleVisibility={toggleLayerVisibility}
        onAddLayer={() => addLayer()}
        onRemoveLayer={removeLayer}
        onDuplicateLayer={duplicateLayer}
        onMoveLayerUp={handleMoveLayerUp}
        onMoveLayerDown={handleMoveLayerDown}
        onSetMaskLayer={setMaskLayer}
        onLayerOpacityChange={setLayerOpacity}
        onLayerBlendModeChange={setLayerBlendMode}
        onRenameLayer={renameLayer}
      />
    </Box>
  );
};

export default memo(SketchEditor);
