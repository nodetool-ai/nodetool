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
import React, { memo, useMemo, useCallback, useState, useRef, useEffect } from "react";
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
      transition: "border-color 0.15s ease, box-shadow 0.15s ease, outline 0.15s ease",
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
      WebkitBackdropFilter: opts.selected ? theme.vars.palette.glass.blur : "none",
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
    "& .sketch-input-handles .react-flow__handle.react-flow__handle-left:hover": {
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

/** Resolve an image ref URI for `input_image` or `layer_in_*` (upstream result, dynamic, then static). */
function resolveSketchImageInputUri(
  paramKey: string,
  upstreamResult: unknown,
  dynamicProps: Record<string, unknown> | undefined,
  staticProps: Record<string, unknown> | undefined
): string | null {
  if (upstreamResult && typeof upstreamResult === "object") {
    const resultObj = upstreamResult as Record<string, unknown>;
    const wired = resultObj[paramKey];
    if (wired && typeof wired === "object") {
      const uri = (wired as { uri?: unknown }).uri;
      if (typeof uri === "string" && uri.length > 0) {
        return uri;
      }
    }
  }
  const fromDynamic = dynamicProps?.[paramKey];
  if (fromDynamic && typeof fromDynamic === "object") {
    const uri = (fromDynamic as { uri?: unknown }).uri;
    if (typeof uri === "string" && uri.length > 0) {
      return uri;
    }
  }
  const fromStatic = staticProps?.[paramKey];
  if (fromStatic && typeof fromStatic === "object") {
    const uri = (fromStatic as { uri?: unknown }).uri;
    if (typeof uri === "string" && uri.length > 0) {
      return uri;
    }
  }
  return null;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SketchNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const SketchNode: React.FC<SketchNodeProps> = (props) => {
  const theme = useTheme();
  const hasParent = props.parentId !== undefined;
  const isFocused = useNodeFocusStore((state) => state.focusedNodeId === props.id);
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
  const [editorDocument, setEditorDocument] = useState<SketchDocument | null>(null);
  const documentRef = useRef<SketchDocument | null>(null);
  const inputImageLoadedRef = useRef<string | null>(null);
  /** Last applied `layer_in_*` source URI per layer id (avoid reload loops). */
  const layerInputUriLoadedRef = useRef<Record<string, string>>({});
  /** When this changes, sketch node handles / edge ids must sync to the workflow. */
  const layerIoSignatureRef = useRef<string>("");
  const pendingDocumentSyncRef = useRef<SketchDocument | null>(null);
  const pendingNodePropsRef = useRef<Record<string, unknown>>({});
  const nodeSyncTimeoutRef = useRef<number | null>(null);
  const updateNodeProperties = useNodes((s) => s.updateNodeProperties);
  const updateNodeData = useNodes((s) => s.updateNodeData);

  // Watch for upstream input_image results
  const upstreamResult = useResultsStore((state) =>
    state.getResult(props.data.workflow_id, props.id)
  );

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

  const layerIoSyncSignature = useMemo(
    () => sketchLayerIoSignature(sketchDoc),
    [sketchDoc]
  );

  // Register `layer_in_*` on dynamic_properties / dynamic_inputs so metadata.is_dynamic
  // and findInputHandle resolve per-layer handles like other dynamic nodes.
  useEffect(() => {
    const desiredKeys = new Set(
      exposedInputLayers.map((l) => `layer_in_${l.name}`)
    );

    const curDyn = {
      ...(props.data.dynamic_properties || {})
    } as Record<string, unknown>;
    const curIn = { ...(props.data.dynamic_inputs || {}) };

    const nextDyn = { ...curDyn };
    const nextIn = { ...curIn };

    for (const k of Object.keys(nextDyn)) {
      if (k.startsWith("layer_in_") && !desiredKeys.has(k)) {
        delete nextDyn[k];
      }
    }
    for (const k of Object.keys(nextIn)) {
      if (k.startsWith("layer_in_") && !desiredKeys.has(k)) {
        delete nextIn[k];
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
      const k = `layer_in_${layer.name}`;
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

    if (
      JSON.stringify(curDyn) === JSON.stringify(nextDyn) &&
      JSON.stringify(curIn) === JSON.stringify(nextIn)
    ) {
      return;
    }

    updateNodeData(props.id, {
      dynamic_properties: nextDyn,
      dynamic_inputs: nextIn
    });
  }, [
    props.id,
    layerIoSyncSignature,
    exposedInputLayers,
    updateNodeData,
    props.data.dynamic_properties,
    props.data.dynamic_inputs
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

  const dynamicProps = props.data.dynamic_properties as
    | Record<string, unknown>
    | undefined;
  const staticProps = props.data.properties;

  // ─── Resolve input_image from upstream connections ────────────────
  const inputImageUri = useMemo(
    (): string | null =>
      resolveSketchImageInputUri(
        "input_image",
        upstreamResult,
        dynamicProps,
        staticProps
      ),
    [upstreamResult, dynamicProps, staticProps]
  );

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
        const canvasHeight = naturalHeight > 0 ? naturalHeight : doc.canvas.height;

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

        const updatedDoc: SketchDocument = {
          ...doc,
          canvas: {
            ...doc.canvas,
            width: canvasWidth,
            height: canvasHeight
          },
          layers: updatedLayers,
          metadata: { ...doc.metadata, updatedAt: new Date().toISOString() }
        };

        documentRef.current = updatedDoc;
        const serialized = serializeDocument(updatedDoc);
        updateNodeProperties(props.id, {
          sketch_data: serialized,
          [SKETCH_LAYER_IO_SIG_KEY]: sketchLayerIoSignature(updatedDoc)
        });
      })
      .catch(() => {
        // Image loading failed - silently ignore
      });
  }, [inputImageUri, sketchDoc, props.id, updateNodeProperties]);

  // ─── Load per-layer images from `layer_in_<layerName>` handles ─────
  useEffect(() => {
    if (exposedInputLayers.length === 0) {
      return;
    }

    for (const layer of exposedInputLayers) {
      const paramKey = `layer_in_${layer.name}`;
      const uri = resolveSketchImageInputUri(
        paramKey,
        upstreamResult,
        dynamicProps,
        staticProps
      );
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
            contentBounds
          };
          const updatedDoc: SketchDocument = {
            ...base,
            layers: updatedLayers,
            metadata: { ...base.metadata, updatedAt: new Date().toISOString() }
          };
          documentRef.current = updatedDoc;
          updateNodeProperties(props.id, {
            sketch_data: serializeDocument(updatedDoc),
            [SKETCH_LAYER_IO_SIG_KEY]: sketchLayerIoSignature(updatedDoc)
          });
        })
        .catch(() => {
          // Image loading failed - allow retry if URI changes
          delete layerInputUriLoadedRef.current[layer.id];
        });
    }
  }, [
    exposedInputLayers,
    sketchDoc,
    upstreamResult,
    dynamicProps,
    staticProps,
    props.id,
    updateNodeProperties
  ]);

  // ─── Generate preview and update output properties ────────────────
  useEffect(() => {
    const hasData = sketchDoc.layers.some((l) => l.data !== null);
    if (hasData) {
      // Generate flattened image for preview and output
      flattenDocument(sketchDoc)
        .then(async (canvas) => {
          const imageDataUrl = canvasToDataUrl(canvas);
          setPreviewUrl(imageDataUrl);

          // Build all output properties in a single batch
          const outputProps: Record<string, unknown> = {
            image: { type: "image", uri: imageDataUrl, asset_id: null, data: null }
          };

          // Export mask if designated
          const maskCanvas = await exportMask(sketchDoc);
          if (maskCanvas) {
            const maskDataUrl = canvasToDataUrl(maskCanvas);
            outputProps.mask = { type: "image", uri: maskDataUrl, asset_id: null, data: null };
          }

          // Export individual layers marked as exposedAsOutput
          for (const layer of sketchDoc.layers) {
            if (layer.exposedAsOutput && layer.data) {
              const layerCanvas = await exportLayer(sketchDoc, layer.id);
              if (!layerCanvas) {
                continue;
              }
              outputProps[`layer_out_${layer.name}`] = {
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
  }, [sketchDoc, props.id, updateNodeProperties]);

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
    [schedulePendingNodeSync]
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
                  <Typography className="hint">Click to open image editor</Typography>
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
                  paramName={`layer_in_${layer.name}`}
                  handlePosition="left"
                >
                  <Handle
                    type="target"
                    id={`layer_in_${layer.name}`}
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
                    name: `layer_out_${layer.name}`,
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
