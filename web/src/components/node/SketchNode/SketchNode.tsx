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
      overflow: "visible"
    },
    ".sketch-input-handles": {
      position: "absolute",
      left: 0,
      top: "6px",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      gap: "36px"
    },
    ".sketch-output-handles": {
      position: "absolute",
      right: 0,
      top: "6px",
      zIndex: 2,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: "14px"
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
    }
  });

// Type metadata for handles
const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: true
};

const NODE_SYNC_DEBOUNCE_MS = 200;

const outputImageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: false
};

// ─── Constants ───────────────────────────────────────────────────────────────

export const SKETCH_NODE_TYPE = "nodetool.input.SketchInput";

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
  const pendingDocumentSyncRef = useRef<SketchDocument | null>(null);
  const pendingNodePropsRef = useRef<Record<string, unknown>>({});
  const nodeSyncTimeoutRef = useRef<number | null>(null);
  const updateNodeProperties = useNodes((s) => s.updateNodeProperties);

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
      pendingProps.sketch_data = serializeDocument(pendingDocumentSyncRef.current);
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

  // ─── Resolve input_image from upstream connections ────────────────
  const inputImageUri = useMemo((): string | null => {
    // Check upstream result first (from workflow execution)
    if (upstreamResult && typeof upstreamResult === "object") {
      const resultObj = upstreamResult as Record<string, unknown>;
      // Result might have input_image property from edge resolution
      const inputImg = resultObj.input_image;
      if (inputImg && typeof inputImg === "object") {
        const imgRef = inputImg as { uri?: string; data?: unknown };
        if (imgRef.uri) {
          return imgRef.uri;
        }
      }
    }

    // Fallback: check dynamic_properties (set by edge connections)
    const dynInputImage = props.data.dynamic_properties?.input_image;
    if (dynInputImage && typeof dynInputImage === "object") {
      const imgRef = dynInputImage as { uri?: string; data?: unknown };
      if (imgRef.uri) {
        return imgRef.uri;
      }
    }

    // Fallback: check static properties
    const staticInputImage = props.data.properties?.input_image;
    if (staticInputImage && typeof staticInputImage === "object") {
      const imgRef = staticInputImage as { uri?: string; data?: unknown };
      if (imgRef.uri) {
        return imgRef.uri;
      }
    }

    return null;
  }, [upstreamResult, props.data.dynamic_properties, props.data.properties]);

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
        updateNodeProperties(props.id, { sketch_data: serialized });
      })
      .catch(() => {
        // Image loading failed - silently ignore
      });
  }, [inputImageUri, sketchDoc, props.id, updateNodeProperties]);

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
      // Keep in-memory ref up to date for on-close flush.
      // No serialization here — persisting on every stroke causes main-thread
      // stutter. flushPendingNodeSync() on modal close handles the actual save.
      documentRef.current = doc;
      pendingDocumentSyncRef.current = doc;
    },
    []
  );

  // ─── Export callbacks for real-time output updates during editing ──
  const handleExportImage = useCallback(
    (dataUrl: string) => {
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
                {previewUrl ? (
                  <>
                    <img className="preview-image" src={previewUrl} alt="Image editor preview" />
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
