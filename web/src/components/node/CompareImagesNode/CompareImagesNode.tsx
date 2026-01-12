/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useMemo, useRef } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Box, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";

import { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { NodeHeader } from "../NodeHeader";
import NodeResizeHandle from "../NodeResizeHandle";
import NodeResizer from "../NodeResizer";
import { ImageComparer } from "../../widgets";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";
import HandleTooltip from "../../HandleTooltip";
import { Slugify } from "../../../utils/TypeHandler";
import { createImageUrl, ImageData } from "../../../utils/imageUtils";

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
      borderRadius: "var(--rounded-node)",
      border: `1px solid ${theme.vars.palette.grey[700]}`,
      backgroundColor: theme.vars.palette.c_node_bg,
      position: "relative"
    },
    ".compare-node-content": {
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
      top: "30px", // Below header
      left: 0,
      right: 0,
      bottom: 0,
      overflow: "hidden"
    },
    ".node-header": {
      width: "100%",
      minHeight: "unset",
      flexShrink: 0,
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      border: 0
    },
    // Resize handle - corner icon
    ".node-resize-handle": {
      position: "absolute",
      right: 0,
      bottom: 0,
      zIndex: 100
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
    // Handle positioning - use fixed pixel values for consistent spacing
    ".handle-popup": {
      position: "absolute",
      left: 0
    },
    ".handle-popup.image_a": {
      top: "60px"
    },
    ".handle-popup.image_b": {
      top: "100px"
    }
  });

// Type metadata for image handles
const imageTypeMetadata = {
  type: "image",
  type_args: [],
  optional: false
};

interface CompareImagesNodeProps extends NodeProps {
  data: NodeData;
  id: string;
}

const CompareImagesNode: React.FC<CompareImagesNodeProps> = (props) => {
  const theme = useTheme();
  const hasParent = props.parentId !== undefined;

  // Get the preview result for this node
  const result = useResultsStore((state) =>
    state.getPreview(props.data.workflow_id, props.id)
  );

  // Extract comparison data from result
  const comparisonData = useMemo(() => {
    if (!result || typeof result !== "object") {
      return null;
    }
    if ((result as any).type !== "image_comparison") {
      return null;
    }
    return result as {
      type: string;
      image_a: { uri?: string; data?: ImageData; type?: string };
      image_b: { uri?: string; data?: ImageData; type?: string };
      label_a?: string;
      label_b?: string;
    };
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
      css={styles(theme)}
      className={`compare-images-node nopan node-drag-handle ${
        hasParent ? "hasParent" : ""
      }`}
    >
      <div className="compare-node-content">
        {/* Handle for image_a */}
        <div className="handle-popup image_a">
          <HandleTooltip
            typeMetadata={imageTypeMetadata}
            paramName="image_a"
            handlePosition="left"
          >
            <Handle
              type="target"
              id="image_a"
              position={Position.Left}
              isConnectable={true}
              className={Slugify("image")}
            />
          </HandleTooltip>
        </div>

        {/* Handle for image_b */}
        <div className="handle-popup image_b">
          <HandleTooltip
            typeMetadata={imageTypeMetadata}
            paramName="image_b"
            handlePosition="left"
          >
            <Handle
              type="target"
              id="image_b"
              position={Position.Left}
              isConnectable={true}
              className={Slugify("image")}
            />
          </HandleTooltip>
        </div>

        <NodeHeader
          id={props.id}
          data={props.data}
          hasParent={hasParent}
          metadataTitle="Compare Images"
          selected={props.selected}
          backgroundColor="transparent"
          iconType="image"
          iconBaseColor={theme.vars.palette.primary.main}
          showIcon={false}
          workflowId={props.data.workflow_id}
        />

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
            <Typography className="hint">
              Connect two images and run workflow to compare
            </Typography>
          )}
        </div>

        <NodeResizeHandle minWidth={300} minHeight={250} />
        <NodeResizer minWidth={300} minHeight={250} />
      </div>
    </Box>
  );
};

export default memo(CompareImagesNode, isEqual);
