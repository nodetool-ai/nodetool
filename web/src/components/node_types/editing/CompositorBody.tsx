/** @jsxImportSource @emotion/react */
/**
 * CompositorBody — bespoke body for `nodetool.image.Compositor`.
 *
 * Top: full-bleed preview of the node's own composited output.
 * Middle: per-layer rows (LayerRow) with thumbnail · opacity slider ·
 *         blend-mode dropdown · visibility toggle · delete. One row per
 *         dynamic `image_N` input. Layer state lives in the static
 *         `layers: List[Dict]` prop, indexed positionally against the
 *         sorted dynamic image inputs.
 * Bottom: "+ Add another layer" — appends a fresh `image_N` dynamic
 *         property and a matching `{opacity:1, blend_mode:'normal',
 *         visible:true}` entry to `layers`.
 *
 * Input handles for each `image_N` are rendered via `HandleColumn` over
 * the preview area, pinned to the left edge — synthesized Property
 * entries are fed in for each dynamic input.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  type BlendMode,
  BLEND_MODES,
  coerceBlendMode
} from "@nodetool-ai/gpu";
import type { LayerTransform2D } from "@nodetool-ai/gpu/webgpu";

import {
  CheckerDropzone,
  DynamicInputButton,
  EditButton,
  FlexColumn,
  FlexRow
} from "../../ui_primitives";
import CompositorEditorModal from "../../compositor/CompositorEditorModal";
import type { CompositorEditorLayer } from "../../compositor/types";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import LayerRow from "./LayerRow";
import {
  asImageRef,
  resolveImageUrl,
  useImageUrl,
  sortImageKeys,
  nextImageIndex,
  type ImageRefLike
} from "./CompositorBody.helpers";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useNodeOutput, useUpstreamValues } from "../../../hooks/nodes/useNodeIO";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";
import { COMPOSITOR_NODE_TYPE } from "../../../constants/nodeTypes";

/** Canonical blend modes are owned by `@nodetool-ai/gpu`. */
export type CompositorBlendMode = BlendMode;

export interface CompositorLayerState {
  opacity: number;
  blend_mode: CompositorBlendMode;
  visible: boolean;
  transform?: LayerTransform2D;
}

const DEFAULT_LAYER_STATE: CompositorLayerState = {
  opacity: 1,
  blend_mode: "normal",
  visible: true
};

/** Parse a persisted layer transform; undefined unless a position is pinned. */
const parseTransform = (raw: unknown): LayerTransform2D | undefined => {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.x !== "number" || typeof r.y !== "number") return undefined;
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    x: r.x,
    y: r.y,
    scaleX: num(r.scaleX, 1),
    scaleY: num(r.scaleY, 1),
    rotation: num(r.rotation, 0)
  };
};

export { BLEND_MODES };

const styles = (theme: Theme) =>
  css({
    "&.compositor-body": {
      position: "relative",
      width: "100%",
      height: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      padding: theme.spacing(0.5),
      minHeight: 0
    },
    ".preview-area": {
      position: "relative",
      flex: "0 0 auto",
      minHeight: 160,
      maxHeight: 280,
      borderRadius: "var(--rounded-sm)",
      overflow: "hidden",
      backgroundColor: theme.vars.palette.grey[900],
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      "& img": {
        maxWidth: "100%",
        maxHeight: 280,
        objectFit: "contain",
        display: "block"
      }
    },
    ".layers": {
      flex: "1 1 auto",
      minHeight: 0,
      overflowY: "auto",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(0.5),
      paddingRight: theme.spacing(0.5)
    },
    ".add-row": {
      flex: "0 0 auto",
      display: "flex",
      justifyContent: "flex-start",
      paddingTop: theme.spacing(0.5)
    },
    ".outputs-row": {
      flex: "0 0 auto"
    },
    ".empty-state": {
      padding: theme.spacing(1),
      color: theme.vars.palette.text.secondary,
      fontFamily: theme.fontFamily2,
      fontSize: theme.fontSizeSmaller,
      textAlign: "center"
    }
  });

export interface CompositorBodyProps {
  id: string;
  nodeType: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  workflowId: string;
  status?: string;
  isOutputNode: boolean;
}

const CompositorBodyInner: React.FC<CompositorBodyProps> = ({
  id,
  nodeType,
  nodeMetadata,
  data,
  workflowId,
  status,
  isOutputNode
}) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const nodeStoreRef = useNodeStoreRef();

  // Dynamic properties and per-layer state. We rely on positional
  // alignment between the sorted `image_N` inputs and `layers[i]`.
  const dynamicProperties = useMemo(
    () => (data.dynamic_properties || {}) as Record<string, unknown>,
    [data.dynamic_properties]
  );

  const imageKeys = useMemo(
    () => sortImageKeys(Object.keys(dynamicProperties)),
    [dynamicProperties]
  );

  const layersRaw = data.properties?.layers;
  const layers = useMemo<CompositorLayerState[]>(() => {
    const arr = Array.isArray(layersRaw) ? layersRaw : [];
    return imageKeys.map((_, i) => {
      const raw = (arr[i] ?? {}) as Record<string, unknown>;
      const opacity =
        typeof raw.opacity === "number"
          ? Math.max(0, Math.min(1, raw.opacity))
          : DEFAULT_LAYER_STATE.opacity;
      const blend_mode = coerceBlendMode(raw.blend_mode);
      const visible =
        raw.visible === undefined ? DEFAULT_LAYER_STATE.visible : !!raw.visible;
      return { opacity, blend_mode, visible, transform: parseTransform(raw.transform) };
    });
  }, [imageKeys, layersRaw]);

  const { setProperties, setPropertyComplete } = useBespokePropertyWriter({
    nodeId: id,
    nodeType
  });

  const { handleAddProperty, handleDeleteProperty } = useDynamicProperty(
    id,
    dynamicProperties
  );

  // ── Edge / upstream resolution for per-layer thumbnails ──────────
  // `edges` is still needed when deleting a layer (to drop its edge).
  const edges = useNodes(
    (state) => state.edges.filter((e) => e.target === id),
    shallow
  );

  // Resolve each layer's upstream image through the shared resolver, which
  // reads all three result channels (outputResults / results / previews) plus
  // the literal-source fallback. The Compositor previously read only `results`,
  // so images delivered via streaming `output_update` never reached the editor.
  const upstreamValues = useUpstreamValues(
    workflowId,
    id,
    imageKeys,
    dynamicProperties
  );
  const upstreamForKey = useCallback(
    (key: string): ImageRefLike | undefined => asImageRef(upstreamValues[key]),
    [upstreamValues]
  );

  // Own composited output for the top preview.
  const ownOutput = useNodeOutput(workflowId, id);
  const previewImage = useMemo(
    () => asImageRef(ownOutput),
    [ownOutput]
  );
  const previewSrc = useImageUrl(previewImage);

  // ── Synthesized input-handle Property entries ────────────────────
  const imageType = useMemo(
    () => ({
      type: "image",
      type_args: [],
      optional: false
    }),
    []
  );

  // Handles render top-to-bottom; highest image_N is the top (frontmost) layer.
  const handleProperties = useMemo<Property[]>(
    () =>
      [...imageKeys].reverse().map((key) => ({
        name: key,
        type: imageType,
        required: false
      })),
    [imageKeys, imageType]
  );

  // ── Layer state writer (the canonical mutation) ──────────────────
  const writeLayers = useCallback(
    (next: CompositorLayerState[], complete = false) => {
      setProperties({ layers: next });
      if (complete) setPropertyComplete();
    },
    [setProperties, setPropertyComplete]
  );

  const updateLayer = useCallback(
    (idx: number, patch: Partial<CompositorLayerState>, complete = false) => {
      const next = layers.slice();
      next[idx] = { ...(next[idx] ?? DEFAULT_LAYER_STATE), ...patch };
      writeLayers(next, complete);
    },
    [layers, writeLayers]
  );

  const onOpacityChange = useCallback(
    (idx: number, value: number) =>
      updateLayer(idx, {
        opacity: Math.max(0, Math.min(1, value))
      }),
    [updateLayer]
  );

  const onOpacityComplete = useCallback(() => {
    setPropertyComplete();
  }, [setPropertyComplete]);

  const onBlendChange = useCallback(
    (idx: number, value: CompositorBlendMode) =>
      updateLayer(idx, { blend_mode: value }, true),
    [updateLayer]
  );

  const onToggleVisible = useCallback(
    (idx: number) =>
      updateLayer(idx, { visible: !(layers[idx]?.visible ?? true) }, true),
    [layers, updateLayer]
  );

  const onDeleteLayer = useCallback(
    (idx: number) => {
      const key = imageKeys[idx];
      if (!key) return;
      // Drop the layer state at this index; the remaining states stay
      // aligned to the remaining (sorted) dynamic image inputs.
      const next = layers.slice();
      next.splice(idx, 1);
      writeLayers(next);
      // Remove any edges targeting the deleted handle.
      const edgeIds = edges
        .filter((e) => (e.targetHandle ?? "") === key)
        .map((e) => e.id);
      if (edgeIds.length > 0) {
        nodeStoreRef.getState().deleteEdges(edgeIds);
      }
      handleDeleteProperty(key);
      setPropertyComplete();
    },
    [imageKeys, layers, writeLayers, handleDeleteProperty, setPropertyComplete, edges, nodeStoreRef]
  );

  const onAddLayer = useCallback(() => {
    const idx = nextImageIndex(Object.keys(dynamicProperties));
    const key = `image_${idx}`;
    handleAddProperty(key);
    // Append a default state so positional alignment is preserved.
    const next = [...layers, { ...DEFAULT_LAYER_STATE }];
    writeLayers(next, true);
  }, [dynamicProperties, layers, handleAddProperty, writeLayers]);

  // ── Canvas size + per-layer transform (the layout editor) ────────
  const baseImage = useMemo(
    () => (imageKeys[0] ? upstreamForKey(imageKeys[0]) : undefined),
    [imageKeys, upstreamForKey]
  );
  const propCanvasW = Number(data.properties?.canvas_width) || 0;
  const propCanvasH = Number(data.properties?.canvas_height) || 0;
  const canvasWidth =
    propCanvasW > 0 ? propCanvasW : Math.round(baseImage?.width ?? 512);
  const canvasHeight =
    propCanvasH > 0 ? propCanvasH : Math.round(baseImage?.height ?? 512);

  const onCanvasSizeChange = useCallback(
    (width: number, height: number, complete: boolean) => {
      setProperties({
        canvas_width: Math.max(1, Math.round(width)),
        canvas_height: Math.max(1, Math.round(height))
      });
      if (complete) setPropertyComplete();
    },
    [setProperties, setPropertyComplete]
  );

  const onTransformChange = useCallback(
    (idx: number, transform: LayerTransform2D, complete: boolean) =>
      updateLayer(idx, { transform }, complete),
    [updateLayer]
  );

  const [editorOpen, setEditorOpen] = useState(false);

  const editorLayers = useMemo<CompositorEditorLayer[]>(
    () =>
      imageKeys.map((key, i) => ({
        id: key,
        url: resolveImageUrl(upstreamForKey(key)),
        opacity: layers[i]?.opacity ?? DEFAULT_LAYER_STATE.opacity,
        blendMode: layers[i]?.blend_mode ?? DEFAULT_LAYER_STATE.blend_mode,
        visible: layers[i]?.visible ?? DEFAULT_LAYER_STATE.visible,
        transform: layers[i]?.transform
      })),
    [imageKeys, layers, upstreamForKey]
  );

  return (
    <div css={cssStyles} className="compositor-body" data-bespoke-body="Compositor">
      <HandleColumn id={id} properties={handleProperties} />
      <div className="preview-area">
        {previewSrc ? (
          <img src={previewSrc} alt="Composited output" />
        ) : (
          <CheckerDropzone
            message="Add layers, then run"
            icon={<ImageIcon />}
          />
        )}
      </div>

      <FlexColumn className="layers" gap={0.5}>
        {imageKeys.length === 0 ? (
          <div className="empty-state">No layers yet - add one below.</div>
        ) : (
          imageKeys.map((_, reverseIndex) => {
            const idx = imageKeys.length - 1 - reverseIndex;
            const key = imageKeys[idx];
            return (
              <LayerRow
                key={key}
                index={idx}
                propertyKey={key}
                state={layers[idx] ?? DEFAULT_LAYER_STATE}
                image={upstreamForKey(key)}
                onOpacityChange={onOpacityChange}
                onOpacityComplete={onOpacityComplete}
                onBlendChange={onBlendChange}
                onToggleVisible={onToggleVisible}
                onDelete={onDeleteLayer}
              />
            );
          })
        )}
      </FlexColumn>

      <FlexRow className="add-row" gap={0.5} align="center">
        <DynamicInputButton
          itemLabel="layer"
          onAdd={onAddLayer}
        />
        <EditButton
          onClick={() => setEditorOpen(true)}
          tooltip="Open layout editor"
        />
      </FlexRow>

      <CompositorEditorModal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        canvasWidth={canvasWidth}
        canvasHeight={canvasHeight}
        layers={editorLayers}
        onCanvasSizeChange={onCanvasSizeChange}
        onOpacityChange={onOpacityChange}
        onOpacityComplete={onOpacityComplete}
        onBlendChange={onBlendChange}
        onToggleVisible={onToggleVisible}
        onDelete={onDeleteLayer}
        onAddLayer={onAddLayer}
        onTransformChange={onTransformChange}
      />

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
          />
        </div>
      )}

      {status === "running" && <NodeProgress id={id} workflowId={workflowId} />}
    </div>
  );
};

export const CompositorBody = memo(CompositorBodyInner);
CompositorBody.displayName = "CompositorBody";

export { COMPOSITOR_NODE_TYPE };
export default CompositorBody;
