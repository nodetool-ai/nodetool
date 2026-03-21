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
import NodeResizeHandle from "../NodeResizeHandle";
import NodeResizer from "../NodeResizer";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import HandleTooltip from "../../HandleTooltip";
import { Slugify } from "../../../utils/TypeHandler";
import { SketchModal } from "../../sketch";
import {
  SketchDocument,
  createDefaultDocument,
  createDefaultLayer,
  deserializeDocument,
  serializeDocument,
  flattenDocument,
  exportMask,
  canvasToDataUrl,
  loadImageWithDimensions
} from "../../sketch";
import { useNodes } from "../../../contexts/NodeContext";
import useResultsStore from "../../../stores/ResultsStore";

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = (theme: Theme) =>
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
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.c_node_bg,
      position: "relative",
      transition: "border-color 0.15s ease",
      "&:hover": {
        borderColor: theme.vars.palette.grey[500]
      }
    },
    ".sketch-node-content": {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "transparent",
      overflow: "visible"
    },
    ".content": {
      position: "absolute",
      top: "30px",
      left: 0,
      right: 0,
      bottom: 0,
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      borderRadius: "0 0 var(--rounded-node) var(--rounded-node)",
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
      transition: "opacity 0.2s",
      borderRadius: "0 0 var(--rounded-node) var(--rounded-node)"
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
    ".handle-popup": {
      position: "absolute",
      left: 0
    },
    ".handle-popup.input_image": {
      top: "60px"
    },
    ".output-handles": {
      position: "absolute",
      right: 0
    },
    ".handle-popup.output-image": {
      top: "60px"
    },
    ".handle-popup.output-mask": {
      top: "100px"
    },
    // Handle labels for dynamic exposed layers
    ".handle-label": {
      position: "absolute",
      fontSize: "0.6rem",
      fontWeight: 500,
      color: theme.vars.palette.grey[400],
      whiteSpace: "nowrap",
      pointerEvents: "none",
      lineHeight: 1
    },
    ".handle-label.left": {
      left: "12px",
      top: "50%",
      transform: "translateY(-50%)"
    },
    ".handle-label.right": {
      right: "12px",
      top: "50%",
      transform: "translateY(-50%)"
    }
  });

// Type metadata for handles
const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: true
};

// Handle layout constants
const DYNAMIC_HANDLE_START_TOP = 100;
const DYNAMIC_HANDLE_SPACING = 40;
const DYNAMIC_OUTPUT_START_TOP = 140;

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [editorDocument, setEditorDocument] = useState<SketchDocument | null>(null);
  const documentRef = useRef<SketchDocument | null>(null);
  const inputImageLoadedRef = useRef<string | null>(null);
  const updateNodeProperties = useNodes((s) => s.updateNodeProperties);

  // Watch for upstream input_image results
  const upstreamResult = useResultsStore((state) =>
    state.getResult(props.data.workflow_id, props.id)
  );

  useSyncEdgeSelection(props.id, Boolean(props.selected));

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
        // Create an updated document with the input image as the base layer
        const inputLayer = createDefaultLayer("Input Image", "raster");
        inputLayer.data = layerData;
        inputLayer.locked = true;

        // Auto-resize canvas to match input image dimensions
        const canvasWidth = naturalWidth > 0 ? naturalWidth : doc.canvas.width;
        const canvasHeight = naturalHeight > 0 ? naturalHeight : doc.canvas.height;

        // Insert input layer at the bottom (index 0) if not already present
        const existingInputIdx = doc.layers.findIndex((l) => l.name === "Input Image");
        let updatedLayers;
        if (existingInputIdx >= 0) {
          // Replace existing input layer
          updatedLayers = [...doc.layers];
          updatedLayers[existingInputIdx] = { ...updatedLayers[existingInputIdx], data: layerData };
        } else {
          // Add input layer at the bottom
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
              outputProps[`layer_out_${layer.name}`] = {
                type: "image",
                uri: layer.data,
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
    setIsModalOpen(false);
  }, []);

  const handleDocumentChange = useCallback(
    (doc: SketchDocument) => {
      documentRef.current = doc;
      const serialized = serializeDocument(doc);
      updateNodeProperties(props.id, { sketch_data: serialized });
    },
    [props.id, updateNodeProperties]
  );

  const handleSave = useCallback(
    (_doc: SketchDocument) => {
      const currentDoc = documentRef.current;
      if (currentDoc) {
        const serialized = serializeDocument(currentDoc);
        updateNodeProperties(props.id, { sketch_data: serialized });
      }
    },
    [props.id, updateNodeProperties]
  );

  // ─── Export callbacks for real-time output updates during editing ──
  const handleExportImage = useCallback(
    (dataUrl: string) => {
      updateNodeProperties(props.id, {
        image: { type: "image", uri: dataUrl, asset_id: null, data: null }
      });
    },
    [props.id, updateNodeProperties]
  );

  const handleExportMask = useCallback(
    (dataUrl: string | null) => {
      if (dataUrl) {
        updateNodeProperties(props.id, {
          mask: { type: "image", uri: dataUrl, asset_id: null, data: null }
        });
      }
    },
    [props.id, updateNodeProperties]
  );

  return (
    <Box
      css={styles(theme)}
      className={`sketch-node nopan node-drag-handle ${
        hasParent ? "hasParent" : ""
      }`}
    >
      <div className="sketch-node-content">
        {/* Input handle: input_image */}
        <div className="handle-popup input_image">
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
        </div>

        {/* Dynamic input handles for exposed layers */}
        {exposedInputLayers.map((layer, idx) => (
          <div
            key={`input-${layer.id}`}
            className="handle-popup"
            style={{ position: "absolute", left: 0, top: `${DYNAMIC_HANDLE_START_TOP + idx * DYNAMIC_HANDLE_SPACING}px` }}
          >
            <HandleTooltip
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
            <span className="handle-label left">{layer.name}</span>
          </div>
        ))}

        {/* Output handles */}
        <div className="output-handles">
          <div className="handle-popup output-image" style={{ position: "absolute", right: 0, top: "60px" }}>
            <HandleTooltip
              typeMetadata={outputImageTypeMetadata}
              paramName="image"
              handlePosition="right"
            >
              <Handle
                type="source"
                id="image"
                position={Position.Right}
                isConnectable={true}
                className={Slugify("image")}
              />
            </HandleTooltip>
          </div>
          <div className="handle-popup output-mask" style={{ position: "absolute", right: 0, top: "100px" }}>
            <HandleTooltip
              typeMetadata={outputImageTypeMetadata}
              paramName="mask"
              handlePosition="right"
            >
              <Handle
                type="source"
                id="mask"
                position={Position.Right}
                isConnectable={true}
                className={Slugify("image")}
              />
            </HandleTooltip>
          </div>

          {/* Dynamic output handles for exposed layers */}
          {exposedOutputLayers.map((layer, idx) => (
            <div
              key={`output-${layer.id}`}
              className="handle-popup"
              style={{ position: "absolute", right: 0, top: `${DYNAMIC_OUTPUT_START_TOP + idx * DYNAMIC_HANDLE_SPACING}px` }}
            >
              <HandleTooltip
                typeMetadata={outputImageTypeMetadata}
                paramName={`layer_out_${layer.name}`}
                handlePosition="right"
              >
                <Handle
                  type="source"
                  id={`layer_out_${layer.name}`}
                  position={Position.Right}
                  isConnectable={true}
                  className={Slugify("image")}
                />
              </HandleTooltip>
              <span className="handle-label right">{layer.name}</span>
            </div>
          ))}
        </div>

        <NodeHeader
          id={props.id}
          data={props.data}
          hasParent={hasParent}
          metadataTitle="Sketch Input"
          selected={props.selected}
          backgroundColor="transparent"
          iconType="image"
          iconBaseColor={theme.vars.palette.primary.main}
          showIcon={false}
          workflowId={props.data.workflow_id}
        />

        <div className="content" onClick={handleOpenEditor}>
          {previewUrl ? (
            <>
              <img className="preview-image" src={previewUrl} alt="Sketch preview" />
              <div className="edit-overlay">
                <EditIcon sx={{ fontSize: 32, color: "white" }} />
                <span className="edit-overlay-label">Edit Sketch</span>
              </div>
            </>
          ) : (
            <Typography className="hint">
              Click to open sketch editor
            </Typography>
          )}
        </div>

        <NodeResizeHandle minWidth={250} minHeight={200} />
        <NodeResizer minWidth={250} minHeight={200} />
      </div>

      <SketchModal
        open={isModalOpen}
        title="Sketch Editor"
        initialDocument={editorDocument || sketchDoc}
        onClose={handleCloseEditor}
        onSave={handleSave}
        onDocumentChange={handleDocumentChange}
        onExportImage={handleExportImage}
        onExportMask={handleExportMask}
      />
    </Box>
  );
};

export default memo(SketchNode, isEqual);
