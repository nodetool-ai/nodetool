/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useMemo, useRef } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Box, CheckerDropzone, Z_INDEX, BORDER_RADIUS } from "../../ui_primitives";
import CompareIcon from "@mui/icons-material/Compare";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "../../../utils/isEqual";

import { NodeData } from "../../../stores/NodeData";
import { useNodeArtifacts } from "../../../hooks/nodes/useNodeExecState";
import useMetadataStore from "../../../stores/MetadataStore";
import { NodeHeader, NODE_HEADER_MIN_HEIGHT } from "../NodeHeader";
import { NodeOutputs } from "../NodeOutputs";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeResizer from "../NodeResizer";
import { ImageComparer } from "../../widgets";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import HandleTooltip from "../../HandleTooltip";
import HandleLabel from "../HandleLabel";
import { HANDLE_ROW_HEIGHT, HANDLE_ROW_PITCH } from "../HandleColumn";
import { Slugify } from "../../../utils/TypeHandler";
import { createImageUrl, ImageData } from "../../../utils/imageUtils";
import { isObjectLike } from "../../../utils/typePredicates";

const PORT_ROWS_TOP = NODE_HEADER_MIN_HEIGHT + 4;
/** Three output rows (comparison, score, equal) outnumber the two inputs. */
const PORT_ROWS_HEIGHT = HANDLE_ROW_HEIGHT + 2 * HANDLE_ROW_PITCH;

const styles = (theme: Theme) =>
  css({
    "&.compare-images-node": {
      display: "block",
      overflow: "visible",
      padding: 0,
      width: "100%",
      height: "100%",
      minWidth: "300px",
      maxWidth: "unset",
      minHeight: "250px",
      borderRadius: theme.rounded.node,
      border: `1px solid ${theme.vars.palette.divider}`,
      backgroundColor: theme.vars.palette.c_node_bg,
      position: "relative",
      // The body padding of every other node; handles step back by it.
      "--node-body-padding": "8px",
      // Handle labels size against the node's width (`cqw`).
      containerType: "inline-size"
    },
    "&.compare-images-node.selected": {
      borderColor: theme.vars.palette.grey[100]
    },
    ".compare-node-content": {
      position: "absolute",
      inset: "var(--node-body-padding)",
      backgroundColor: "transparent",
      overflow: "visible"
    },
    // The comparer starts under the labeled port rows, so no label sits on
    // the images.
    ".content": {
      position: "absolute",
      top: PORT_ROWS_TOP + PORT_ROWS_HEIGHT + 4,
      left: 0,
      right: 0,
      bottom: 0,
      overflow: "hidden",
      borderRadius: BORDER_RADIUS.sm
    },
    ".node-header": {
      width: "100%",
      flexShrink: 0,
      margin: 0,
      border: 0
    },
    // Resize handle - corner icon
    ".node-resize-handle": {
      position: "absolute",
      right: 0,
      bottom: 0,
      zIndex: Z_INDEX.overlay
    },
    // Handle positioning - use fixed pixel values for consistent spacing
    // Input rows start under the header on the 28px handle pitch, level
    // with the outputs.
    ".handle-popup": {
      position: "absolute",
      left: 0
    },
    ".handle-popup.image_a": {
      top: PORT_ROWS_TOP,
      height: HANDLE_ROW_HEIGHT
    },
    ".handle-popup.image_b": {
      top: PORT_ROWS_TOP + HANDLE_ROW_PITCH,
      height: HANDLE_ROW_HEIGHT
    },
    ".output-handle-column.output-handle-column": {
      top: PORT_ROWS_TOP
    }
  });

const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: false
};

/** The `image_comparison` record the CompareImages node emits. */
interface ImageComparison {
  type?: string;
  image_a?: { uri?: string; data?: ImageData; type?: string };
  image_b?: { uri?: string; data?: ImageData; type?: string };
  label_a?: string;
  label_b?: string;
}

interface CompareImagesNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const CompareImagesNode: React.FC<CompareImagesNodeProps> = (props) => {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);
  const hasParent = props.parentId !== undefined;
  const nodeMetadata = useMetadataStore((state) =>
    state.getMetadata(props.type)
  );

  // The `comparison` snapshot is one of the node's regular outputs and
  // flows through the same channel as score/equal. Reads the final
  // node_update record first (keyed by output name), then falls back to
  // any streamed output_update for the same handle.
  // NOTE: order is result ?? output (REVERSED from useNodeResultValue).
  const { result: _result, output: _output } = useNodeArtifacts(props.data.workflow_id, props.id);
  const result = _result ?? _output;

  const comparisonData = useMemo(() => {
    const pickComparison = (value: unknown): ImageComparison | null => {
      if (!value || !isObjectLike(value)) return null;
      if (Array.isArray(value)) {
        for (const item of value) {
          const found = pickComparison(item);
          if (found) return found;
        }
        return null;
      }
      const record = value as Record<string, unknown>;
      if (record.type === "image_comparison") {
        // SAFETY: the `type === "image_comparison"` tag above is what the
        // CompareImages node stamps on this record; its two image refs and
        // labels are all optional here, so nothing else is being assumed.
        return record as ImageComparison;
      }
      if (record.comparison) {
        return pickComparison(record.comparison);
      }
      return null;
    };

    return pickComparison(result);
  }, [result]);

  // Track blob URLs for cleanup
  const blobUrlARef = useRef<string | null>(null);
  const blobUrlBRef = useRef<string | null>(null);

  const { imageAUrl, imageBUrl } = useMemo(() => {
    const resultA = createImageUrl(
      comparisonData?.image_a,
      blobUrlARef.current
    );
    const resultB = createImageUrl(
      comparisonData?.image_b,
      blobUrlBRef.current
    );

    blobUrlARef.current = resultA.blobUrl;
    blobUrlBRef.current = resultB.blobUrl;

    return { imageAUrl: resultA.url, imageBUrl: resultB.url };
  }, [comparisonData]);

  const hasImages = imageAUrl !== "" && imageBUrl !== "";

  useSyncEdgeSelection(props.id, Boolean(props.selected));

  return (
    <Box
      css={cssStyles}
      className={`compare-images-node nopan node-drag-handle ${
        hasParent ? "hasParent" : ""
      }${props.selected ? " selected" : ""}`}
    >
      <div className="compare-node-content">
        <div className="handle-popup image_a">
          <HandleTooltip
            typeMetadata={imageTypeMetadata}
            paramName="image_a"
            handlePosition="left"
            enableHover={false}
            nodeId={props.id}
            handleDirection="target"
          >
            <Handle
              type="target"
              id="image_a"
              position={Position.Left}
              isConnectable={true}
              className={Slugify("image")}
            />
          </HandleTooltip>
          <HandleLabel text="image_a" type="image" side="input" />
        </div>

        <div className="handle-popup image_b">
          <HandleTooltip
            typeMetadata={imageTypeMetadata}
            paramName="image_b"
            handlePosition="left"
            enableHover={false}
            nodeId={props.id}
            handleDirection="target"
          >
            <Handle
              type="target"
              id="image_b"
              position={Position.Left}
              isConnectable={true}
              className={Slugify("image")}
            />
          </HandleTooltip>
          <HandleLabel text="image_b" type="image" side="input" />
        </div>

        <NodeHeader
          id={props.id}
          data={props.data}
          hasParent={hasParent}
          metadataTitle="Compare Images"
          selected={props.selected}
          iconType="image"
          iconBaseColor={theme.vars.palette.primary.main}
          workflowId={props.data.workflow_id}
        />

        {nodeMetadata && (
          <NodeOutputs id={props.id} outputs={nodeMetadata.outputs} />
        )}

        <div className="content">
          {hasImages ? (
            <ImageComparer
              imageA={imageAUrl}
              imageB={imageBUrl}
              labelA={comparisonData?.label_a || "A"}
              labelB={comparisonData?.label_b || "B"}
              showLabels={true}
              showMetadata={true}
              initialMode="horizontal"
            />
          ) : (
            <CheckerDropzone
              message="Connect two images, then run"
              icon={<CompareIcon />}
            />
          )}
        </div>

        <NodeResizeHandle minWidth={300} minHeight={250} />
        <NodeResizer minWidth={300} minHeight={250} />
      </div>
    </Box>
  );
};

export default memo(CompareImagesNode, isEqual);
