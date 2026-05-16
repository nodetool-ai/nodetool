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
 *         property and a matching `{opacity:1, blend_mode:'over',
 *         visible:true}` entry to `layers`.
 *
 * Input handles for each `image_N` are rendered via `HandleColumn` over
 * the preview area, pinned to the left edge — synthesized Property
 * entries are fed in for each dynamic input.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import ImageIcon from "@mui/icons-material/Image";
import { shallow } from "zustand/shallow";

import {
  CheckerDropzone,
  DynamicInputButton,
  FlexColumn
} from "../../ui_primitives";
import HandleColumn from "../../node/HandleColumn";
import { NodeOutputs } from "../../node/NodeOutputs";
import NodeProgress from "../../node/NodeProgress";
import LayerRow from "./LayerRow";

import type { NodeMetadata, Property } from "../../../stores/ApiTypes";
import type { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { useNodes, useNodeStoreRef } from "../../../contexts/NodeContext";
import { useBespokePropertyWriter } from "../../../hooks/nodes/useBespokePropertyWriter";
import { useDynamicProperty } from "../../../hooks/nodes/useDynamicProperty";

const COMPOSITOR_NODE_TYPE = "nodetool.image.Compositor";

export type CompositorBlendMode =
  | "over"
  | "multiply"
  | "screen"
  | "overlay"
  | "darken"
  | "lighten"
  | "color-dodge"
  | "color-burn"
  | "hard-light"
  | "soft-light"
  | "difference"
  | "exclusion"
  | "add";

export interface CompositorLayerState {
  opacity: number;
  blend_mode: CompositorBlendMode;
  visible: boolean;
}

const DEFAULT_LAYER_STATE: CompositorLayerState = {
  opacity: 1,
  blend_mode: "over",
  visible: true
};

const BLEND_MODES: { value: CompositorBlendMode; label: string }[] = [
  { value: "over", label: "Normal" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "overlay", label: "Overlay" },
  { value: "darken", label: "Darken" },
  { value: "lighten", label: "Lighten" },
  { value: "color-dodge", label: "Color Dodge" },
  { value: "color-burn", label: "Color Burn" },
  { value: "hard-light", label: "Hard Light" },
  { value: "soft-light", label: "Soft Light" },
  { value: "difference", label: "Difference" },
  { value: "exclusion", label: "Exclusion" },
  { value: "add", label: "Add" }
];

export { BLEND_MODES };

export interface ImageRefLike {
  uri?: string;
  width?: number;
  height?: number;
  data?: unknown;
}

const asImageRef = (value: unknown): ImageRefLike | undefined => {
  if (!value || typeof value !== "object") return undefined;
  const v = value as Record<string, unknown>;
  return {
    uri: typeof v.uri === "string" ? v.uri : undefined,
    width: typeof v.width === "number" ? v.width : undefined,
    height: typeof v.height === "number" ? v.height : undefined,
    data: v.data
  };
};

const unwrapOutput = (value: unknown, handle?: string | null): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  if (handle && handle in v) return v[handle];
  if ("output" in v) return v.output;
  return value;
};

const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Hook that resolves an `ImageRefLike` to a displayable URL.
 * Converts Uint8Array to a base64 data URI to avoid blob URL leaks.
 */
export const useImageUrl = (image: ImageRefLike | undefined): string | undefined => {
  return useMemo(() => {
    if (!image) return undefined;
    if (image.uri) return image.uri;
    if (typeof image.data === "string") {
      if (
        image.data.startsWith("data:") ||
        image.data.startsWith("blob:") ||
        image.data.startsWith("http")
      ) {
        return image.data;
      }
      return `data:image/png;base64,${image.data}`;
    }
    if (image.data instanceof Uint8Array) {
      return `data:image/png;base64,${uint8ArrayToBase64(image.data)}`;
    }
    return undefined;
  }, [image]);
};

/** Sort `image_N` keys by their numeric suffix. */
export const sortImageKeys = (keys: string[]): string[] =>
  keys
    .filter((k) => /^image_\d+$/.test(k))
    .sort((a, b) => {
      const ia = Number(a.slice("image_".length));
      const ib = Number(b.slice("image_".length));
      return ia - ib;
    });

/** Next unused `image_N` index given existing dynamic property keys. */
export const nextImageIndex = (keys: string[]): number => {
  let max = -1;
  for (const k of keys) {
    const m = /^image_(\d+)$/.exec(k);
    if (m) {
      const n = Number(m[1]);
      if (n > max) max = n;
    }
  }
  return max + 1;
};

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
      "& > .handle-column": {
        top: 0,
        bottom: 0,
        left: `calc(${theme.spacing(-0.5)})`
      },
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
      paddingRight: theme.spacing(0.25)
    },
    ".add-row": {
      flex: "0 0 auto",
      display: "flex",
      justifyContent: "flex-start",
      paddingTop: theme.spacing(0.25)
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
      const blend_mode =
        typeof raw.blend_mode === "string" &&
        BLEND_MODES.some((m) => m.value === raw.blend_mode)
          ? (raw.blend_mode as CompositorBlendMode)
          : DEFAULT_LAYER_STATE.blend_mode;
      const visible =
        raw.visible === undefined ? DEFAULT_LAYER_STATE.visible : !!raw.visible;
      return { opacity, blend_mode, visible };
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
  const edges = useNodes(
    (state) => state.edges.filter((e) => e.target === id),
    shallow
  );

  const results = useResultsStore((state) => state.results);
  const upstreamForKey = useCallback(
    (key: string): ImageRefLike | undefined => {
      const edge = edges.find((e) => (e.targetHandle ?? "") === key);
      if (!edge) {
        return asImageRef(dynamicProperties[key]);
      }
      const sourceResult = results[`${workflowId}:${edge.source}`];
      return asImageRef(unwrapOutput(sourceResult, edge.sourceHandle));
    },
    [edges, results, workflowId, dynamicProperties]
  );

  // Own composited output for the top preview.
  const myResult = useResultsStore(
    (state) => state.getResult(workflowId, id),
    shallow
  );
  const previewImage = useMemo(
    () => asImageRef(unwrapOutput(myResult)),
    [myResult]
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

  const handleProperties = useMemo<Property[]>(
    () =>
      imageKeys.map((key) => ({
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

  return (
    <div css={cssStyles} className="compositor-body" data-bespoke-body="Compositor">
      <div className="preview-area">
        {previewSrc ? (
          <img src={previewSrc} alt="Composited output" />
        ) : (
          <CheckerDropzone
            message="Add layers, then run"
            icon={<ImageIcon />}
          />
        )}
        <HandleColumn id={id} properties={handleProperties} />
      </div>

      <FlexColumn className="layers" gap={0.5}>
        {imageKeys.length === 0 ? (
          <div className="empty-state">No layers yet — add one below.</div>
        ) : (
          imageKeys.map((key, idx) => (
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
          ))
        )}
      </FlexColumn>

      <div className="add-row">
        <DynamicInputButton
          itemLabel="layer"
          onAdd={onAddLayer}
        />
      </div>

      {!isOutputNode && (
        <div className="outputs-row">
          <NodeOutputs
            id={id}
            outputs={nodeMetadata.outputs}
            isStreamingOutput={nodeMetadata.is_streaming_output}
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
