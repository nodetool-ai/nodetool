/** @jsxImportSource @emotion/react */
/**
 * CompositorEditor — sketch-style layout for the Compositor node.
 *
 * Left: the interactive WebGPU stage (drag/scale/rotate the selected layer).
 * Right: canvas size, the layer stack (top-first), and transform fields for
 * the selected layer. All edits write straight back to the node's `layers` /
 * `canvas_*` props through the callbacks the body supplies, so the node renders
 * exactly what the editor shows.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { blendModeGpuId, type BlendMode } from "@nodetool-ai/gpu";
import type { LayerTransform2D } from "@nodetool-ai/gpu/webgpu";

import {
  Caption,
  Divider,
  DynamicInputButton,
  FlexColumn,
  FlexRow,
  StateIconButton,
  Text
} from "../ui_primitives";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import NumberInput from "../inputs/NumberInput";
import LayerRow from "../node_types/editing/LayerRow";
import type { CompositorBlendMode } from "../node_types/editing/CompositorBody";

import CompositorEditorCanvas, {
  type CanvasLayer
} from "./CompositorEditorCanvas";
import LayerTransformFields from "./LayerTransformFields";
import { useLayerBitmaps } from "./useLayerBitmaps";
import { defaultTransform, type CompositorEditorLayer } from "./types";

export interface CompositorEditorProps {
  canvasWidth: number;
  canvasHeight: number;
  layers: CompositorEditorLayer[];
  onCanvasSizeChange: (width: number, height: number, complete: boolean) => void;
  onOpacityChange: (index: number, value: number) => void;
  onOpacityComplete: () => void;
  onBlendChange: (index: number, value: CompositorBlendMode) => void;
  onToggleVisible: (index: number) => void;
  onDelete: (index: number) => void;
  onAddLayer: () => void;
  onTransformChange: (
    index: number,
    transform: LayerTransform2D,
    complete: boolean
  ) => void;
}

const PANEL_WIDTH = 320;

const styles = (theme: Theme) =>
  css({
    "&.compositor-editor": {
      width: "100%",
      height: "100%",
      display: "flex",
      minHeight: 0
    },
    ".stage-pane": {
      flex: "1 1 auto",
      minWidth: 0,
      minHeight: 0
    },
    ".side-panel": {
      flex: `0 0 ${PANEL_WIDTH}px`,
      width: PANEL_WIDTH,
      borderLeft: `1px solid ${theme.vars.palette.divider}`,
      background: theme.vars.palette.grey[800],
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      padding: theme.spacing(1),
      gap: theme.spacing(1),
      overflowY: "auto"
    },
    ".size-row .field": {
      flex: 1,
      minWidth: 0
    },
    ".field-label": {
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      marginBottom: 2
    },
    ".layer-stack": {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5)
    },
    ".layer-slot": {
      borderRadius: "var(--rounded-sm)",
      border: "1px solid transparent",
      cursor: "pointer",
      "&.selected": {
        borderColor: theme.vars.palette.primary.main
      }
    },
    ".empty": {
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      textAlign: "center",
      padding: theme.spacing(1)
    }
  });

const CompositorEditorInner: React.FC<CompositorEditorProps> = ({
  canvasWidth,
  canvasHeight,
  layers,
  onCanvasSizeChange,
  onOpacityChange,
  onOpacityComplete,
  onBlendChange,
  onToggleVisible,
  onDelete,
  onAddLayer,
  onTransformChange
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    id: string;
    transform: LayerTransform2D;
  } | null>(null);

  const urls = useMemo(() => {
    const out: Record<string, string | undefined> = {};
    for (const l of layers) out[l.id] = l.url;
    return out;
  }, [layers]);
  const bitmaps = useLayerBitmaps(urls);

  const indexOf = useCallback(
    (id: string) => layers.findIndex((l) => l.id === id),
    [layers]
  );

  const dimsFor = useCallback(
    (id: string) => {
      const b = bitmaps[id];
      return { width: b?.width ?? 1, height: b?.height ?? 1 };
    },
    [bitmaps]
  );

  const effectiveTransform = useCallback(
    (layer: CompositorEditorLayer): LayerTransform2D | undefined => {
      if (preview && preview.id === layer.id) return preview.transform;
      return layer.transform;
    },
    [preview]
  );

  const canvasLayers = useMemo<CanvasLayer[]>(
    () =>
      layers.map((l) => ({
        id: l.id,
        opacity: l.opacity,
        blendModeId: blendModeGpuId(l.blendMode),
        visible: l.visible,
        transform: effectiveTransform(l)
      })),
    [layers, effectiveTransform]
  );

  const onTransformPreview = useCallback(
    (id: string, transform: LayerTransform2D) =>
      setPreview({ id, transform }),
    []
  );

  const onTransformCommit = useCallback(
    (id: string, transform: LayerTransform2D) => {
      setPreview(null);
      const idx = indexOf(id);
      if (idx >= 0) onTransformChange(idx, transform, true);
    },
    [indexOf, onTransformChange]
  );

  // Selected layer transform for the numeric fields (committed value).
  const selectedLayer = selectedId
    ? layers.find((l) => l.id === selectedId)
    : undefined;
  const selectedTransform: LayerTransform2D | null = useMemo(() => {
    if (!selectedLayer) return null;
    const { width, height } = dimsFor(selectedLayer.id);
    return (
      selectedLayer.transform ??
      defaultTransform(width, height, canvasWidth, canvasHeight)
    );
  }, [selectedLayer, dimsFor, canvasWidth, canvasHeight]);

  const handleFieldChange = useCallback(
    (transform: LayerTransform2D, complete: boolean) => {
      if (!selectedId) return;
      const idx = indexOf(selectedId);
      if (idx >= 0) onTransformChange(idx, transform, complete);
    },
    [selectedId, indexOf, onTransformChange]
  );

  const handleResetTransform = useCallback(() => {
    if (!selectedId) return;
    const idx = indexOf(selectedId);
    const { width, height } = dimsFor(selectedId);
    if (idx >= 0) {
      onTransformChange(
        idx,
        defaultTransform(width, height, canvasWidth, canvasHeight),
        true
      );
    }
  }, [
    selectedId,
    indexOf,
    dimsFor,
    onTransformChange,
    canvasWidth,
    canvasHeight
  ]);

  // Render the stack top-first (highest index on top of the composite).
  const stack = useMemo(
    () => layers.map((l, i) => ({ layer: l, index: i })).reverse(),
    [layers]
  );

  return (
    <div css={cssStyles} className="compositor-editor">
      <div className="stage-pane">
        <CompositorEditorCanvas
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
          layers={canvasLayers}
          bitmaps={bitmaps}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onTransformPreview={onTransformPreview}
          onTransformCommit={onTransformCommit}
        />
      </div>

      <div className="side-panel">
        <FlexColumn gap={0.5}>
          <Caption>Canvas size</Caption>
          <FlexRow className="size-row" gap={0.5}>
            <div className="field">
              <div className="field-label">Width</div>
              <NumberInput
                id="compositor-canvas-width"
                nodeId=""
                name="canvas_width"
                description="Canvas width (px)"
                value={canvasWidth}
                min={1}
                max={16384}
                size="small"
                color="secondary"
                inputType="int"
                showSlider={false}
                hideLabel
                onChange={(_, v) =>
                  onCanvasSizeChange(Math.round(v), canvasHeight, false)
                }
                onChangeComplete={(v) =>
                  onCanvasSizeChange(Math.round(v), canvasHeight, true)
                }
              />
            </div>
            <div className="field">
              <div className="field-label">Height</div>
              <NumberInput
                id="compositor-canvas-height"
                nodeId=""
                name="canvas_height"
                description="Canvas height (px)"
                value={canvasHeight}
                min={1}
                max={16384}
                size="small"
                color="secondary"
                inputType="int"
                showSlider={false}
                hideLabel
                onChange={(_, v) =>
                  onCanvasSizeChange(canvasWidth, Math.round(v), false)
                }
                onChangeComplete={(v) =>
                  onCanvasSizeChange(canvasWidth, Math.round(v), true)
                }
              />
            </div>
          </FlexRow>
        </FlexColumn>

        <Divider />

        {selectedTransform ? (
          <FlexColumn gap={0.5}>
            <FlexRow justify="space-between" align="center">
              <Text sx={{ fontWeight: 500 }}>Selected layer</Text>
              <StateIconButton
                icon={<RestartAltIcon fontSize="small" />}
                onClick={handleResetTransform}
                ariaLabel="Reset transform"
                tooltip="Reset transform"
              />
            </FlexRow>
            <LayerTransformFields
              transform={selectedTransform}
              onChange={handleFieldChange}
            />
            <Divider />
          </FlexColumn>
        ) : (
          <Caption>Select a layer to transform it.</Caption>
        )}

        <FlexColumn gap={0.5}>
          <Caption>Layers</Caption>
          {layers.length === 0 ? (
            <div className="empty">No layers yet - add one below.</div>
          ) : (
            <div className="layer-stack">
              {stack.map(({ layer, index }) => (
                <div
                  key={layer.id}
                  className={`layer-slot ${
                    selectedId === layer.id ? "selected" : ""
                  }`}
                  onPointerDownCapture={() => setSelectedId(layer.id)}
                >
                  <LayerRow
                    index={index}
                    propertyKey={layer.id}
                    state={{
                      opacity: layer.opacity,
                      blend_mode: layer.blendMode as BlendMode,
                      visible: layer.visible
                    }}
                    image={layer.url ? { uri: layer.url } : undefined}
                    onOpacityChange={onOpacityChange}
                    onOpacityComplete={onOpacityComplete}
                    onBlendChange={onBlendChange}
                    onToggleVisible={onToggleVisible}
                    onDelete={onDelete}
                  />
                </div>
              ))}
            </div>
          )}
          <DynamicInputButton itemLabel="layer" onAdd={onAddLayer} />
        </FlexColumn>
      </div>
    </div>
  );
};

export const CompositorEditor = memo(CompositorEditorInner);
CompositorEditor.displayName = "CompositorEditor";

export default CompositorEditor;
