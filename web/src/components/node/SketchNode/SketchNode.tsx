/**
 * SketchNode
 *
 * Custom ReactFlow node for the sketch editor.
 * Displays a sketch canvas preview with input/output handles
 * and opens the full editor in a modal on click.
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
  deserializeDocument,
  serializeDocument,
  flattenDocument,
  canvasToDataUrl
} from "../../sketch";
import { useNodes } from "../../../contexts/NodeContext";

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
      position: "relative"
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
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0,0,0,0.4)",
      opacity: 0,
      transition: "opacity 0.2s"
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
    }
  });

// Type metadata for handles
const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: true
};

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
  const documentRef = useRef<SketchDocument | null>(null);
  const updateNodeProperties = useNodes((s) => s.updateNodeProperties);

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

  // Generate preview
  useEffect(() => {
    const hasData = sketchDoc.layers.some((l) => l.data !== null);
    if (hasData) {
      flattenDocument(sketchDoc)
        .then((canvas) => {
          setPreviewUrl(canvasToDataUrl(canvas));
        })
        .catch(() => {
          // Preview generation failed
        });
    } else {
      setPreviewUrl(null);
    }
  }, [sketchDoc]);

  const handleOpenEditor = useCallback(() => {
    documentRef.current = sketchDoc;
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
                <EditIcon sx={{ fontSize: 40, color: "white" }} />
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
        initialDocument={sketchDoc}
        onClose={handleCloseEditor}
        onSave={handleSave}
        onDocumentChange={handleDocumentChange}
      />
    </Box>
  );
};

export default memo(SketchNode, isEqual);
