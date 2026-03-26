/**
 * SketchNode
 *
 * Custom ReactFlow node for the sketch editor.
 * Displays a sketch canvas preview with input/output handles
 * and opens the full editor in a modal on click.
 *
 * Features:
 * - Loads connected input_image into editor as base layer
 * - Exports flattened image and mask as node properties for downstream consumption
 * - Persists sketch document state for reopen/edit/continue
 */

/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, {
  memo,
  useMemo,
  useCallback,
  useState,
  useRef,
  useEffect
} from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import EditIcon from "@mui/icons-material/Edit";
import isEqual from "lodash/isEqual";
import { NodeData } from "../../../stores/NodeData";
import { NodeHeader } from "../NodeHeader";
import NodeOutput from "../NodeOutput";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeResizer from "../NodeResizer";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import HandleTooltip from "../../HandleTooltip";
import { Slugify } from "../../../utils/TypeHandler";
import { SketchModal } from "../../sketch";
import { useSketchStore } from "../../sketch";
import {
  SketchDocument,
  SKETCH_NODE_INPUT_IMAGE_LAYER_NAME,
  createDefaultDocument,
  createDefaultLayer,
  deserializeDocument,
  serializeDocument,
  flattenDocument,
  exportMask,
  exportLayer,
  canvasToDataUrl,
  loadImageWithDimensions
} from "../../sketch";
import { useNodes } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";
import { useNodeFocusStore } from "../../../stores/NodeFocusStore";
import type { Node as FlowNode } from "@xyflow/react";

// ─── Styles ──────────────────────────────────────────────────────────────────

type SketchNodeStyleOptions = {
  selected: boolean;
  isFocused: boolean;
  baseColor: string;
};

const styles = (theme: Theme, opts: SketchNodeStyleOptions) =>
  css({
    "&.sketch-node": {
      display: "block",
      overflow: "visible",
      padding: 0,
      width: "100%",
      height: "100%",
      minWidth: "250px",
      maxWidth: "unset",
      minHeight: "200px",
      borderRadius: "var(--rounded-node)",
      border: `1px solid ${theme.vars.palette.grey[900]}`,
      backgroundColor: theme.vars.palette.c_node_bg,
      position: "relative",
      transition:
        "border-color 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease",
      boxShadow: opts.selected
        ? `0 0 0 1px ${opts.baseColor}, 0 1px 10px rgba(0,0,0,0.5)`
        : opts.isFocused
          ? `0 0 0 2px ${theme.vars.palette.warning.main}`
          : "none",
      outline: opts.isFocused
        ? `2px dashed ${theme.vars.palette.warning.main}`
        : opts.selected
          ? `3px solid ${opts.baseColor}`
          : "none",
      outlineOffset: "-2px",
      "--node-primary-color": opts.baseColor,
      backdropFilter: opts.selected ? theme.vars.palette.glass.blur : "none",
      WebkitBackdropFilter: opts.selected
        ? theme.vars.palette.glass.blur
        : "none",
      "&:hover:not(.sketch-node--selected)": {
        borderColor: theme.vars.palette.grey[500]
      }
    },
    "&.sketch-node--selected": {
      backgroundColor: "transparent"
    },
    ".sketch-node-content": {
      position: "absolute",
      inset: 0,
      backgroundColor: "transparent",
      overflow: "visible",
      display: "flex",
      flexDirection: "column",
      minHeight: 0
    },
    ".sketch-node-stack": {
      flex: "1 1 auto",
      display: "flex",
      flexDirection: "column",
      minHeight: 0,
      overflow: "visible"
    },
    // Preview + handles: main fills space below header only (inputs start under header)
    ".sketch-main": {
      position: "relative",
      flex: "1 1 auto",
      minHeight: 0,
      minWidth: 0,
      overflow: "visible",
      "--sketch-handle-stack-gap": "18px"
    },
    ".sketch-input-handles": {
      position: "absolute",
      left: 0,
      top: "6px",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "var(--sketch-handle-stack-gap)"
    },
    ".sketch-output-handles": {
      position: "absolute",
      right: 0,
      top: "6px",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "var(--sketch-handle-stack-gap)"
    },
    ".sketch-preview-wrap": {
      position: "absolute",
      inset: 0,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      cursor: "pointer",
      "&:hover .edit-overlay": {
        opacity: 1
      }
    },
    ".content": {
      position: "absolute",
      inset: 0,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      "&:hover .edit-overlay": {
        opacity: 1
      }
    },
    ".preview-image": {
      width: "100%",
      height: "100%",
      objectFit: "contain"
    },
    ".edit-overlay": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.45)",
      opacity: 0,
      transition: "opacity 0.2s"
    },
    ".edit-overlay-label": {
      fontSize: "0.7rem",
      fontWeight: 500,
      color: "rgba(255,255,255,0.85)",
      letterSpacing: "0.02em"
    },
    ".hint": {
      position: "absolute",
      textAlign: "center",
      top: "50%",
      left: "50%",
      width: "80%",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: "300",
      transform: "translate(-50%, -50%)",
      zIndex: 1,
      color: theme.vars.palette.grey[400],
      opacity: 0.8,
      pointerEvents: "none"
    },
    // Per-output wrapper in vertical stack (overrides global full-height output rail)
    "& .sketch-output-handles .output-handle-container": {
      position: "relative",
      top: "auto",
      right: "auto",
      bottom: "auto",
      left: "auto",
      width: "auto",
      height: "auto",
      textAlign: "right"
    },
    // Global handle CSS pins every .react-flow__handle-left to top: 5px on the whole
    // node, so multiple targets stack. Anchor each handle inside its own relative box
    // (same idea as sketch-output-handles).
    "& .sketch-input-handles .handle-tooltip-wrapper": {
      position: "relative",
      flexShrink: 0,
      width: 18,
      minHeight: 22,
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start"
    },
    "& .sketch-input-handles .react-flow__handle.react-flow__handle-left": {
      position: "absolute",
      left: -6,
      top: "50%",
      bottom: "auto",
      transform: "translate(0, -50%)",
      transformOrigin: "right center"
    },
    "& .sketch-input-handles .react-flow__handle.react-flow__handle-left:hover":
      {
        transform: "translate(0, -50%) scale(1.75, 1.5)"
      }
  });

// Type metadata for handles
const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: true
};

const NODE_SYNC_DEBOUNCE_MS = 200;

/** Persisted alongside sketch_data so graph edge typing invalidates when layer I/O handles change (without parsing huge JSON each frame). */
const SKETCH_LAYER_IO_SIG_KEY = "sketch_layer_io_sig";

function sketchLayerIoSignature(doc: SketchDocument): string {
  return doc.layers
    .map(
      (l) =>
        `${l.id}:${l.name}:${Boolean(l.exposedAsInput)}:${Boolean(l.exposedAsOutput)}`
    )
    .join("|");
}

function getLayerInputHandleName(layerName: string): string {
  return `layer_in_${layerName}`;
}

function getLayerOutputHandleName(layerName: string): string {
  return `layer_out_${layerName}`;
}

function parseLayerInputHandleName(
  handleName: string | null | undefined
): string | null {
  if (!handleName || !handleName.startsWith("layer_in_")) {
    return null;
  }
  return handleName.slice("layer_in_".length) || null;
}

function ensureEditableActiveLayer(doc: SketchDocument): SketchDocument {
  const activeLayer = doc.layers.find((layer) => layer.id === doc.activeLayerId);
  if (activeLayer && !activeLayer.locked) {
    return doc;
  }

  const fallbackActiveLayer = [...doc.layers]
    .reverse()
    .find((layer) => !layer.locked);
  if (!fallbackActiveLayer || fallbackActiveLayer.id === doc.activeLayerId) {
    return doc;
  }

  return {
    ...doc,
    activeLayerId: fallbackActiveLayer.id
  };
}

const outputImageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: false
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const SKETCH_NODE_TYPE = "nodetool.input.SketchInput";

/** Composited `image` output from the editor (flattenToDataUrl); preferred over re-flattening sketch_data alone. */
function getSketchOutputImageUri(
  properties: Record<string, unknown> | undefined
): string | null {
  const img = properties?.image;
  if (!img || typeof img !== "object") {
    return null;
  }
  const uri = (img as { uri?: unknown }).uri;
  return typeof uri === "string" && uri.length > 0 ? uri : null;
}

/**
 * Extract an image URI from a node result value.
 * Handles the two common Nodetool result shapes:
 *   - direct image object  { type: "image", uri: "...", ... }
 *   - wrapped output       { output: { type: "image", uri: "..." } }
 */
function extractImageUri(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const r = result as Record<string, unknown>;
  if (typeof r.uri === "string" && r.uri) {
    return r.uri;
  }
  if (r.output && typeof r.output === "object") {
    const out = r.output as Record<string, unknown>;
    if (typeof out.uri === "string" && out.uri) {
      return out.uri;
    }
  }
  return null;
}

function resolveConnectedOutputValue(
  result: unknown,
  sourceHandle: string | null | undefined
): unknown {
  if (!sourceHandle || !result || typeof result !== "object") {
    return result;
  }

  const record = result as Record<string, unknown>;

  if (sourceHandle in record) {
    return record[sourceHandle];
  }

  if (record.output && typeof record.output === "object") {
    const outputRecord = record.output as Record<string, unknown>;
    if (sourceHandle in outputRecord) {
      return outputRecord[sourceHandle];
    }
  }

  return result;
}

function isLiteralSourceNode(nodeType?: string): boolean {
  if (!nodeType) {
    return false;
  }
  return (
    nodeType.startsWith("nodetool.input.") ||
    nodeType.startsWith("nodetool.constant.")
  );
}

function resolveNodePropertyValue(
  node: FlowNode<NodeData> | undefined,
  sourceHandle: string | null | undefined
): unknown {
  if (!node?.data) {
    return undefined;
  }

  const dynamicProps = node.data.dynamic_properties || {};
  if (sourceHandle && dynamicProps[sourceHandle] !== undefined) {
    return dynamicProps[sourceHandle];
  }
  if (dynamicProps.value !== undefined) {
    return dynamicProps.value;
  }

  const props = node.data.properties || {};
  if (sourceHandle && props[sourceHandle] !== undefined) {
    return props[sourceHandle];
  }
  if (props.value !== undefined) {
    return props.value;
  }

  return undefined;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SketchNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const SketchNode: React.FC<SketchNodeProps> = (props) => {
  const theme = useTheme();
  const hasParent = props.parentId !== undefined;
  const isFocused = useNodeFocusStore(
    (state) => state.focusedNodeId === props.id
  );
  const inputAccentColor = theme.vars.palette.success.main;
  const sketchCss = useMemo(
    () =>
      styles(theme, {
        selected: Boolean(props.selected),
        isFocused,
        baseColor: inputAccentColor
      }),
    [theme, props.selected, isFocused, inputAccentColor]
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editorDocument, setEditorDocument] = useState<SketchDocument | null>(
    null
  );
  const documentRef = useRef<SketchDocument | null>(null);
  const inputImageLoadedRef = useRef<string | null>(null);
  /** Last applied `layer_in_*` source URI per layer id (avoid reload loops). */
  const layerInputUriLoadedRef = useRef<Record<string, string>>({});
  /** When this changes, sketch node handles / edge ids must sync to the workflow. */
  const layerIoSignatureRef = useRef<string>("");
  const pendingDocumentSyncRef = useRef<SketchDocument | null>(null);
  const pendingNodePropsRef = useRef<Record<string, unknown>>({});
  const nodeSyncTimeoutRef = useRef<number | null>(null);
  const edges = useNodes((s) => s.edges);
  const updateNodeProperties = useNodes((s) => s.updateNodeProperties);
  const updateNodeData = useNodes((s) => s.updateNodeData);
  const updateEdgeHandle = useNodes((s) => s.updateEdgeHandle);
  const updateEdge = useNodes((s) => s.updateEdge);
  const deleteEdges = useNodes((s) => s.deleteEdges);
  const findNode = useNodes((s) => s.findNode);

  // Parse sketch document from node properties
  const sketchDoc = useMemo((): SketchDocument => {
    const sketchData = props.data.properties?.sketch_data;
    if (typeof sketchData === "string" && sketchData) {
      const parsed = deserializeDocument(sketchData);
      if (parsed) {
        return parsed;
      }
    }
    return createDefaultDocument();
  }, [props.data.properties?.sketch_data]);

  // ─── Compute exposed layer handles ────────────────────────────────
  const exposedInputLayers = useMemo(
    () => sketchDoc.layers.filter((l) => l.exposedAsInput),
    [sketchDoc.layers]
  );
  const exposedOutputLayers = useMemo(
    () => sketchDoc.layers.filter((l) => l.exposedAsOutput),
    [sketchDoc.layers]
  );

  // ─── Resolve source node IDs for all image inputs ─────────────────
  // Connected values live on the SOURCE node's result, not this node's own
  // result. Find the relevant incoming edges and subscribe to their results.
  const inputImageConnection = useMemo(
    () =>
      edges.find(
        (e) => e.target === props.id && e.targetHandle === "input_image"
      ) ?? null,
    [edges, props.id]
  );

  const inputImageSourceResult = useResultsStore((state) => {
    if (!inputImageConnection?.source) {
      return undefined;
    }
    return (
      state.getOutputResult(props.data.workflow_id, inputImageConnection.source) ??
      state.getResult(props.data.workflow_id, inputImageConnection.source) ??
      state.getPreview(props.data.workflow_id, inputImageConnection.source)
    );
  });

  const incomingLayerInEdges = useMemo(
    () =>
      edges.filter(
        (e) =>
          e.target === props.id &&
          typeof e.targetHandle === "string" &&
          e.targetHandle.startsWith("layer_in_")
      ),
    [edges, props.id]
  );

  const layerInputConnections = useMemo(() => {
    const connections: Record<
      string,
      { sourceId: string; sourceHandle: string | null | undefined }
    > = {};
    for (const layer of exposedInputLayers) {
      const edge = edges.find(
        (e) =>
          e.target === props.id &&
          e.targetHandle === getLayerInputHandleName(layer.name)
      );
      if (edge?.source) {
        connections[layer.id] = {
          sourceId: edge.source,
          sourceHandle: edge.sourceHandle
        };
      }
    }
    return connections;
  }, [edges, props.id, exposedInputLayers]);

  const layerInputResults = useResultsStore((state) => {
    const out: Record<string, unknown> = {};
    for (const [layerId, connection] of Object.entries(layerInputConnections)) {
      out[layerId] =
        state.getOutputResult(props.data.workflow_id, connection.sourceId) ??
        state.getResult(props.data.workflow_id, connection.sourceId) ??
        state.getPreview(props.data.workflow_id, connection.sourceId);
    }
    return out;
  });

  useSyncEdgeSelection(props.id, Boolean(props.selected));

  const flushPendingNodeSync = useCallback(() => {
    if (nodeSyncTimeoutRef.current !== null) {
      clearTimeout(nodeSyncTimeoutRef.current);
      nodeSyncTimeoutRef.current = null;
    }

    const pendingProps = { ...pendingNodePropsRef.current };
    pendingNodePropsRef.current = {};

    if (pendingDocumentSyncRef.current) {
      const doc = pendingDocumentSyncRef.current;
      pendingProps.sketch_data = serializeDocument(doc);
      pendingProps[SKETCH_LAYER_IO_SIG_KEY] = sketchLayerIoSignature(doc);
      pendingDocumentSyncRef.current = null;
    }

    if (Object.keys(pendingProps).length === 0) {
      return;
    }

    updateNodeProperties(props.id, pendingProps);
  }, [props.id, updateNodeProperties]);

  const schedulePendingNodeSync = useCallback(() => {
    if (nodeSyncTimeoutRef.current !== null) {
      clearTimeout(nodeSyncTimeoutRef.current);
    }

    nodeSyncTimeoutRef.current = window.setTimeout(() => {
      nodeSyncTimeoutRef.current = null;
      flushPendingNodeSync();
    }, NODE_SYNC_DEBOUNCE_MS);
  }, [flushPendingNodeSync]);

  useEffect(() => {
    return () => {
      if (nodeSyncTimeoutRef.current !== null) {
        clearTimeout(nodeSyncTimeoutRef.current);
      }
    };
  }, []);

  const layerIoSyncSignature = useMemo(
    () => sketchLayerIoSignature(sketchDoc),
    [sketchDoc]
  );

  useEffect(() => {
    if (incomingLayerInEdges.length === 0) {
      return;
    }

    const baseDoc = documentRef.current ?? sketchDoc;
    let nextDoc = baseDoc;
    let changed = false;

    for (const edge of incomingLayerInEdges) {
      const layerName = parseLayerInputHandleName(edge.targetHandle);
      if (!layerName) {
        continue;
      }

      const existingIdx = nextDoc.layers.findIndex((l) => l.name === layerName);
      if (existingIdx >= 0) {
        const existing = nextDoc.layers[existingIdx];
        if (existing.exposedAsInput) {
          continue;
        }

        const updatedLayers = [...nextDoc.layers];
        updatedLayers[existingIdx] = {
          ...existing,
          exposedAsInput: true
        };
        nextDoc = {
          ...nextDoc,
          layers: updatedLayers,
          metadata: {
            ...nextDoc.metadata,
            updatedAt: new Date().toISOString()
          }
        };
        changed = true;
        continue;
      }

      const layer = createDefaultLayer(
        layerName,
        "raster",
        nextDoc.canvas.width,
        nextDoc.canvas.height
      );
      layer.exposedAsInput = true;
      nextDoc = {
        ...nextDoc,
        layers: [...nextDoc.layers, layer],
        metadata: {
          ...nextDoc.metadata,
          updatedAt: new Date().toISOString()
        }
      };
      changed = true;
    }

    if (!changed) {
      return;
    }

    documentRef.current = nextDoc;
    updateNodeProperties(props.id, {
      sketch_data: serializeDocument(nextDoc),
      [SKETCH_LAYER_IO_SIG_KEY]: sketchLayerIoSignature(nextDoc)
    });

    if (isModalOpen) {
      useSketchStore.getState().setDocument(nextDoc);
    } else {
      setEditorDocument(nextDoc);
    }
  }, [
    incomingLayerInEdges,
    isModalOpen,
    props.id,
    sketchDoc,
    updateNodeProperties
  ]);

  // Register `layer_in_*` on dynamic_properties / dynamic_inputs and
  // `layer_out_*` on dynamic_outputs so metadata.is_dynamic
  // and findInputHandle / findOutputHandle resolve per-layer handles
  // like other dynamic nodes.
  useEffect(() => {
    const desiredInKeys = new Set(
      exposedInputLayers.map((l) => getLayerInputHandleName(l.name))
    );
    const desiredOutKeys = new Set(
      exposedOutputLayers.map((l) => getLayerOutputHandleName(l.name))
    );

    const curDyn = {
      ...(props.data.dynamic_properties || {})
    } as Record<string, unknown>;
    const curIn = { ...(props.data.dynamic_inputs || {}) };
    const curOut = { ...(props.data.dynamic_outputs || {}) };

    const nextDyn = { ...curDyn };
    const nextIn = { ...curIn };
    const nextOut = { ...curOut };

    for (const k of Object.keys(nextDyn)) {
      if (k.startsWith("layer_in_") && !desiredInKeys.has(k)) {
        delete nextDyn[k];
      }
    }
    for (const k of Object.keys(nextIn)) {
      if (k.startsWith("layer_in_") && !desiredInKeys.has(k)) {
        delete nextIn[k];
      }
    }
    for (const k of Object.keys(nextOut)) {
      if (k.startsWith("layer_out_") && !desiredOutKeys.has(k)) {
        delete nextOut[k];
      }
    }

    const emptyLayerInImage = {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    };
    for (const layer of exposedInputLayers) {
      const k = getLayerInputHandleName(layer.name);
      if (nextDyn[k] === undefined) {
        nextDyn[k] = emptyLayerInImage;
      }
      if (nextIn[k] === undefined) {
        nextIn[k] = {
          type: "image",
          type_args: [],
          optional: true,
          values: null,
          type_name: null
        };
      }
    }
    for (const layer of exposedOutputLayers) {
      const k = getLayerOutputHandleName(layer.name);
      if (nextOut[k] === undefined) {
        nextOut[k] = {
          type: "image",
          type_args: [],
          optional: false,
          values: null,
          type_name: null
        };
      }
    }

    if (
      JSON.stringify(curDyn) === JSON.stringify(nextDyn) &&
      JSON.stringify(curIn) === JSON.stringify(nextIn) &&
      JSON.stringify(curOut) === JSON.stringify(nextOut)
    ) {
      return;
    }

    updateNodeData(props.id, {
      dynamic_properties: nextDyn,
      dynamic_inputs: nextIn,
      dynamic_outputs: nextOut
    });
  }, [
    props.id,
    layerIoSyncSignature,
    exposedInputLayers,
    exposedOutputLayers,
    updateNodeData,
    props.data.dynamic_properties,
    props.data.dynamic_inputs,
    props.data.dynamic_outputs
  ]);

  useEffect(() => {
    layerIoSignatureRef.current = sketchDoc.layers
      .map(
        (l) =>
          `${l.id}:${l.name}:${Boolean(l.exposedAsInput)}:${Boolean(l.exposedAsOutput)}`
      )
      .join("|");
  }, [sketchDoc]);

  const outputImageUri = useMemo(
    () => getSketchOutputImageUri(props.data.properties),
    [props.data.properties]
  );

  const displayPreviewUri = outputImageUri ?? previewUrl;

  const staticProps = props.data.properties;
  // `documentRef` tracks the latest live editor state without forcing React
  // re-renders on every stroke. Prefer it over `editorDocument`, which is
  // just the snapshot used to open the modal or stage async hydration updates.
  const currentDocument = documentRef.current ?? editorDocument ?? sketchDoc;

  // ─── Resolve input_image URI ───────────────────────────────────────
  const inputImageUri = useMemo((): string | null => {
    // Priority 1: connected upstream node result (the correct source)
    const fromResult = extractImageUri(
      resolveConnectedOutputValue(
        inputImageSourceResult,
        inputImageConnection?.sourceHandle
      )
    );
    if (fromResult) {
      return fromResult;
    }
    if (
      inputImageConnection?.source &&
      isLiteralSourceNode(findNode(inputImageConnection.source)?.type)
    ) {
      const fallbackValue = resolveNodePropertyValue(
        findNode(inputImageConnection.source),
        inputImageConnection.sourceHandle
      );
      const fromFallback = extractImageUri(fallbackValue);
      if (fromFallback) {
        return fromFallback;
      }
    }
    // Priority 2: static property set without a live connection
    return extractImageUri(
      (staticProps as Record<string, unknown> | undefined)?.input_image
    );
  }, [
    findNode,
    inputImageConnection,
    inputImageSourceResult,
    staticProps
  ]);

  // ─── Load input_image into sketch document when it changes ────────
  useEffect(() => {
    if (!inputImageUri || inputImageUri === inputImageLoadedRef.current) {
      return;
    }

    inputImageLoadedRef.current = inputImageUri;

    // Load the image and get its natural dimensions for auto-resize
    const doc = documentRef.current || sketchDoc;
    loadImageWithDimensions(inputImageUri)
      .then(({ data: layerData, naturalWidth, naturalHeight }) => {
        const imageReference = {
          uri: inputImageUri,
          naturalWidth,
          naturalHeight,
          objectFit: "fill" as const
        };

        // Auto-resize canvas to match input image dimensions
        const canvasWidth = naturalWidth > 0 ? naturalWidth : doc.canvas.width;
        const canvasHeight =
          naturalHeight > 0 ? naturalHeight : doc.canvas.height;

        const contentBounds = {
          x: 0,
          y: 0,
          width: canvasWidth,
          height: canvasHeight
        };

        // Insert input layer at the bottom (index 0) if not already present
        const existingInputIdx = doc.layers.findIndex(
          (l) => l.name === SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
        );
        let updatedLayers;
        if (existingInputIdx >= 0) {
          const prev = doc.layers[existingInputIdx];
          updatedLayers = [...doc.layers];
          updatedLayers[existingInputIdx] = {
            ...prev,
            data: layerData,
            locked: true,
            imageReference,
            contentBounds,
            transform: { x: 0, y: 0 }
          };
        } else {
          const inputLayer = createDefaultLayer(
            SKETCH_NODE_INPUT_IMAGE_LAYER_NAME,
            "raster",
            canvasWidth,
            canvasHeight
          );
          inputLayer.data = layerData;
          inputLayer.locked = true;
          inputLayer.imageReference = imageReference;
          inputLayer.contentBounds = contentBounds;
          updatedLayers = [inputLayer, ...doc.layers];
        }

        const updatedDoc = ensureEditableActiveLayer({
          ...doc,
          canvas: {
            ...doc.canvas,
            width: canvasWidth,
            height: canvasHeight
          },
          layers: updatedLayers,
          metadata: { ...doc.metadata, updatedAt: new Date().toISOString() }
        });

        documentRef.current = updatedDoc;
        const serialized = serializeDocument(updatedDoc);
        updateNodeProperties(props.id, {
          sketch_data: serialized,
          [SKETCH_LAYER_IO_SIG_KEY]: sketchLayerIoSignature(updatedDoc)
        });

        // Push the loaded layer into the editor.
        // If the modal is open, update the live Zustand store so the canvas
        // hydrates immediately without wiping any user edits on other layers.
        // If the modal is closed, update editorDocument state so the correct
        // document is ready the next time the user opens the editor.
        if (isModalOpen) {
          const storeState = useSketchStore.getState();
          const currentDoc = storeState.document;
          const existingStoreIdx = currentDoc.layers.findIndex(
            (l) => l.name === SKETCH_NODE_INPUT_IMAGE_LAYER_NAME
          );
          const mergedLayers =
            existingStoreIdx >= 0
              ? currentDoc.layers.map((l, i) =>
                  i === existingStoreIdx
                    ? {
                        ...l,
                        data: layerData,
                        locked: true,
                        imageReference,
                        contentBounds,
                        transform: { x: 0, y: 0 }
                      }
                    : l
                )
              : [
                  (() => {
                    const il = createDefaultLayer(
                      SKETCH_NODE_INPUT_IMAGE_LAYER_NAME,
                      "raster",
                      canvasWidth,
                      canvasHeight
                    );
                    il.data = layerData;
                    il.locked = true;
                    il.imageReference = imageReference;
                    il.contentBounds = contentBounds;
                    return il;
                  })(),
                  ...currentDoc.layers
                ];
          storeState.setDocument(ensureEditableActiveLayer({
            ...currentDoc,
            canvas: {
              ...currentDoc.canvas,
              width: canvasWidth,
              height: canvasHeight
            },
            layers: mergedLayers,
            metadata: {
              ...currentDoc.metadata,
              updatedAt: new Date().toISOString()
            }
          }));
        } else {
          setEditorDocument(updatedDoc);
        }
      })
      .catch((err) => {
        console.warn(
          "[SketchNode] Failed to load input_image:",
          inputImageUri,
          err
        );
        // Allow retry if the URI changes again
        inputImageLoadedRef.current = null;
      });
  }, [inputImageUri, sketchDoc, props.id, updateNodeProperties, isModalOpen]);

  // ─── Load per-layer images from `layer_in_<layerName>` handles ─────
  useEffect(() => {
    if (exposedInputLayers.length === 0) {
      return;
    }

    for (const layer of exposedInputLayers) {
      const connection = layerInputConnections[layer.id];
      const resolvedResult = resolveConnectedOutputValue(
        layerInputResults[layer.id],
        connection?.sourceHandle
      );
      const fallbackValue =
        connection?.sourceId &&
        isLiteralSourceNode(findNode(connection.sourceId)?.type)
          ? resolveNodePropertyValue(
              findNode(connection.sourceId),
              connection.sourceHandle
            )
          : undefined;
      const uri = extractImageUri(resolvedResult) ?? extractImageUri(fallbackValue);
      if (!uri) {
        continue;
      }
      if (layerInputUriLoadedRef.current[layer.id] === uri) {
        continue;
      }
      layerInputUriLoadedRef.current[layer.id] = uri;

      loadImageWithDimensions(uri)
        .then(({ data: layerData, naturalWidth, naturalHeight }) => {
          const base = documentRef.current ?? sketchDoc;
          const layerIdx = base.layers.findIndex((l) => l.id === layer.id);
          if (layerIdx < 0) {
            return;
          }
          const target = base.layers[layerIdx];
          const prevBounds = target.contentBounds ?? {
            x: 0,
            y: 0,
            width: base.canvas.width,
            height: base.canvas.height
          };
          const imageReference = {
            uri,
            naturalWidth,
            naturalHeight,
            objectFit: "fill" as const
          };
          const contentBounds = {
            x: prevBounds.x,
            y: prevBounds.y,
            width: naturalWidth > 0 ? naturalWidth : prevBounds.width,
            height: naturalHeight > 0 ? naturalHeight : prevBounds.height
          };
          const updatedLayers = [...base.layers];
          updatedLayers[layerIdx] = {
            ...target,
            data: layerData,
            imageReference,
            contentBounds,
            locked: true
          };
          const updatedDoc = ensureEditableActiveLayer({
            ...base,
            layers: updatedLayers,
            metadata: { ...base.metadata, updatedAt: new Date().toISOString() }
          });
          documentRef.current = updatedDoc;
          updateNodeProperties(props.id, {
            sketch_data: serializeDocument(updatedDoc),
            [SKETCH_LAYER_IO_SIG_KEY]: sketchLayerIoSignature(updatedDoc)
          });

          // Mirror the fix from the input_image effect: push the updated layer
          // into the live editor store when open, or prepare editorDocument for
          // the next open when the modal is closed.
          if (isModalOpen) {
            const storeState = useSketchStore.getState();
            const currentDoc = storeState.document;
            const storeLayerIdx = currentDoc.layers.findIndex(
              (l) => l.id === layer.id
            );
            if (storeLayerIdx >= 0) {
              const storeLayers = [...currentDoc.layers];
              storeLayers[storeLayerIdx] = {
                ...storeLayers[storeLayerIdx],
                data: layerData,
                imageReference,
                contentBounds,
                locked: true
              };
              storeState.setDocument(ensureEditableActiveLayer({
                ...currentDoc,
                layers: storeLayers,
                metadata: {
                  ...currentDoc.metadata,
                  updatedAt: new Date().toISOString()
                }
              }));
            }
          } else {
            setEditorDocument(updatedDoc);
          }
        })
        .catch((err) => {
          console.warn("[SketchNode] Failed to load layer input:", uri, err);
          // Allow retry if the URI changes
          delete layerInputUriLoadedRef.current[layer.id];
        });
    }
  }, [
    exposedInputLayers,
    findNode,
    layerInputConnections,
    layerInputResults,
    sketchDoc,
    props.id,
    updateNodeProperties,
    isModalOpen
  ]);

  // ─── Generate preview and update output properties ────────────────
  useEffect(() => {
    const hasData = currentDocument.layers.some((l) => l.data !== null);
    if (hasData) {
      // Generate flattened image for preview and output
      flattenDocument(currentDocument)
        .then(async (canvas) => {
          const imageDataUrl = canvasToDataUrl(canvas);
          setPreviewUrl(imageDataUrl);

          // Build all output properties in a single batch
          const outputProps: Record<string, unknown> = {
            image: {
              type: "image",
              uri: imageDataUrl,
              asset_id: null,
              data: null
            }
          };

          // Export mask if designated
          const maskCanvas = await exportMask(currentDocument);
          if (maskCanvas) {
            const maskDataUrl = canvasToDataUrl(maskCanvas);
            outputProps.mask = {
              type: "image",
              uri: maskDataUrl,
              asset_id: null,
              data: null
            };
          }

          // Export individual layers marked as exposedAsOutput
          for (const layer of currentDocument.layers) {
            if (layer.exposedAsOutput && layer.data) {
              const layerCanvas = await exportLayer(currentDocument, layer.id);
              if (!layerCanvas) {
                continue;
              }
              outputProps[getLayerOutputHandleName(layer.name)] = {
                type: "image",
                uri: canvasToDataUrl(layerCanvas),
                asset_id: null,
                data: null
              };
            }
          }

          // Single batched update
          updateNodeProperties(props.id, outputProps);
        })
        .catch(() => {
          // Preview generation failed
        });
    } else {
      setPreviewUrl(null);
    }
  }, [currentDocument, props.id, updateNodeProperties]);

  const handleOpenEditor = useCallback(() => {
    // Use documentRef if available (may include async-loaded input image),
    // fall back to sketchDoc from serialized properties
    const docToOpen = documentRef.current || sketchDoc;
    documentRef.current = docToOpen;
    setEditorDocument(docToOpen);
    setIsModalOpen(true);
  }, [sketchDoc]);

  const handleCloseEditor = useCallback(() => {
    flushPendingNodeSync();
    setIsModalOpen(false);
  }, [flushPendingNodeSync]);

  const handleDocumentChange = useCallback(
    (doc: SketchDocument) => {
      const previousDoc = documentRef.current || sketchDoc;
      const previousLayersById = new Map(
        previousDoc.layers.map((layer) => [layer.id, layer])
      );
      const nextLayerIds = new Set(doc.layers.map((layer) => layer.id));

      const removedEdgeIds = previousDoc.layers
        .filter((layer) => !nextLayerIds.has(layer.id))
        .flatMap((layer) => {
          const edgeIds: string[] = [];

          if (layer.exposedAsInput) {
            const inputHandle = getLayerInputHandleName(layer.name);
            edgeIds.push(
              ...edges
                .filter(
                  (edge) =>
                    edge.target === props.id && edge.targetHandle === inputHandle
                )
                .map((edge) => edge.id)
            );
          }

          if (layer.exposedAsOutput) {
            const outputHandle = getLayerOutputHandleName(layer.name);
            edgeIds.push(
              ...edges
                .filter(
                  (edge) =>
                    edge.source === props.id && edge.sourceHandle === outputHandle
                )
                .map((edge) => edge.id)
            );
          }

          return edgeIds;
        });

      if (removedEdgeIds.length > 0) {
        deleteEdges(removedEdgeIds);
      }

      for (const nextLayer of doc.layers) {
        const previousLayer = previousLayersById.get(nextLayer.id);
        if (!previousLayer || previousLayer.name === nextLayer.name) {
          continue;
        }

        if (previousLayer.exposedAsInput || nextLayer.exposedAsInput) {
          updateEdgeHandle(
            props.id,
            getLayerInputHandleName(previousLayer.name),
            getLayerInputHandleName(nextLayer.name)
          );
        }

        if (previousLayer.exposedAsOutput || nextLayer.exposedAsOutput) {
          const oldHandle = getLayerOutputHandleName(previousLayer.name);
          const newHandle = getLayerOutputHandleName(nextLayer.name);
          for (const edge of edges) {
            if (edge.source === props.id && edge.sourceHandle === oldHandle) {
              updateEdge({
                ...edge,
                sourceHandle: newHandle
              });
            }
          }
        }
      }

      documentRef.current = doc;
      pendingDocumentSyncRef.current = doc;
      // Sync sketch_data to the node when exposure or layer identity changes so
      // handles appear on the canvas without closing the modal — but do not
      // schedule on every paint stroke (debounced full serialize is too heavy).
      const ioSig = doc.layers
        .map(
          (l) =>
            `${l.id}:${l.name}:${Boolean(l.exposedAsInput)}:${Boolean(l.exposedAsOutput)}`
        )
        .join("|");
      if (ioSig !== layerIoSignatureRef.current) {
        layerIoSignatureRef.current = ioSig;
        schedulePendingNodeSync();
      }
    },
    [
      deleteEdges,
      edges,
      props.id,
      schedulePendingNodeSync,
      sketchDoc,
      updateEdge,
      updateEdgeHandle
    ]
  );

  // ─── Export callbacks for real-time output updates during editing ──
  const handleExportImage = useCallback(
    (dataUrl: string) => {
      setPreviewUrl(dataUrl);
      pendingNodePropsRef.current.image = {
        type: "image",
        uri: dataUrl,
        asset_id: null,
        data: null
      };
      schedulePendingNodeSync();
    },
    [schedulePendingNodeSync]
  );

  const handleExportMask = useCallback(
    (dataUrl: string | null) => {
      if (dataUrl) {
        pendingNodePropsRef.current.mask = {
          type: "image",
          uri: dataUrl,
          asset_id: null,
          data: null
        };
        schedulePendingNodeSync();
      }
    },
    [schedulePendingNodeSync]
  );

  return (
    <Box
      css={sketchCss}
      className={`sketch-node nopan node-drag-handle${props.selected ? " sketch-node--selected" : ""}${
        hasParent ? " hasParent" : ""
      }`}
    >
      <div className="sketch-node-content">
        <div className="sketch-node-stack">
          <NodeHeader
            id={props.id}
            data={props.data}
            hasParent={hasParent}
            metadataTitle="Image Editor"
            selected={props.selected}
            backgroundColor="transparent"
            iconType="image"
            iconBaseColor={inputAccentColor}
            showIcon={false}
            workflowId={props.data.workflow_id}
          />

          <div className="sketch-main">
            <div className="sketch-preview-wrap" onClick={handleOpenEditor}>
              <div className="content">
                {displayPreviewUri ? (
                  <>
                    <img
                      className="preview-image"
                      src={displayPreviewUri}
                      alt="Image editor preview"
                    />
                    <div className="edit-overlay">
                      <EditIcon sx={{ fontSize: 32, color: "white" }} />
                      <span className="edit-overlay-label">Edit Image</span>
                    </div>
                  </>
                ) : (
                  <Typography className="hint">
                    Click to open image editor
                  </Typography>
                )}
              </div>
            </div>

            <div className="sketch-input-handles">
              <HandleTooltip
                typeMetadata={imageTypeMetadata}
                paramName="input_image"
                handlePosition="left"
              >
                <Handle
                  type="target"
                  id="input_image"
                  position={Position.Left}
                  isConnectable={true}
                  className={Slugify("image")}
                />
              </HandleTooltip>

              {exposedInputLayers.map((layer) => (
                <HandleTooltip
                  key={`input-${layer.id}`}
                  typeMetadata={imageTypeMetadata}
                  paramName={getLayerInputHandleName(layer.name)}
                  handlePosition="left"
                >
                  <Handle
                    type="target"
                    id={getLayerInputHandleName(layer.name)}
                    position={Position.Left}
                    isConnectable={true}
                    className={Slugify("image")}
                  />
                </HandleTooltip>
              ))}
            </div>

            <div className="sketch-output-handles">
              <NodeOutput
                id={props.id}
                output={{
                  name: "image",
                  type: outputImageTypeMetadata,
                  stream: false
                }}
              />
              <NodeOutput
                id={props.id}
                output={{
                  name: "mask",
                  type: outputImageTypeMetadata,
                  stream: false
                }}
              />
              {exposedOutputLayers.map((layer) => (
                <NodeOutput
                  key={`output-${layer.id}`}
                  id={props.id}
                  output={{
                    name: getLayerOutputHandleName(layer.name),
                    type: outputImageTypeMetadata,
                    stream: false
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        <NodeResizeHandle minWidth={250} minHeight={200} />
        <NodeResizer minWidth={250} minHeight={200} />
      </div>

      <SketchModal
        open={isModalOpen}
        title="Image Editor"
        initialDocument={editorDocument || sketchDoc}
        onClose={handleCloseEditor}
        onDocumentChange={handleDocumentChange}
        onExportImage={handleExportImage}
        onExportMask={handleExportMask}
      />
    </Box>
  );
};

export default memo(SketchNode, isEqual);
