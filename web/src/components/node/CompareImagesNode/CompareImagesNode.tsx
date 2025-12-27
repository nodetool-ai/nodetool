/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useMemo } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { Container, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import isEqual from "lodash/isEqual";

import { NodeData } from "../../../stores/NodeData";
import useResultsStore from "../../../stores/ResultsStore";
import { NodeHeader } from "../NodeHeader";
import NodeResizeHandle from "../NodeResizeHandle";
import { ImageComparer } from "../../widgets";
import { useSyncEdgeSelection } from "../../../hooks/nodes/useSyncEdgeSelection";

const styles = (theme: Theme) =>
  css({
    "&": {
      display: "flex",
      flexDirection: "column",
      overflow: "visible",
      padding: 0,
      width: "100%",
      height: "100%",
      minWidth: "300px",
      maxWidth: "unset",
      minHeight: "250px",
      borderRadius: "var(--rounded-node)",
      border: `1px solid ${theme.vars.palette.grey[700]}`
    },
    "&.compare-images-node": {
      padding: 0,
      margin: 0,
      label: {
        display: "none"
      }
    },
    ".compare-node-content": {
      height: "100%",
      width: "100%",
      backgroundColor: "transparent",
      display: "flex",
      position: "relative",
      overflow: "hidden",
      flexDirection: "column"
    },
    ".compare-container": {
      flex: 1,
      minHeight: 0,
      height: 0,
      overflow: "hidden",
      position: "relative"
    },
    ".node-header": {
      width: "100%",
      minHeight: "unset",
      top: 0,
      left: 0,
      margin: 0,
      padding: 0,
      border: 0
    },
    "& .react-flow__resize-control.handle.bottom.right": {
      opacity: 0,
      position: "absolute",
      right: "-8px",
      bottom: "-9px",
      transition: "opacity 0.2s"
    },
    "&:hover .react-flow__resize-control.handle.bottom.right": {
      opacity: 1
    },
    ".hint": {
      position: "absolute",
      opacity: 0,
      textAlign: "center",
      top: "50%",
      left: "50%",
      width: "80%",
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: "300",
      transform: "translate(-50%, -50%)",
      zIndex: 0,
      color: theme.vars.palette.grey[200],
      transition: "opacity 0.2s 1s ease-out"
    },
    "&:hover .hint": {
      opacity: 0.7
    }
  });

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
      image_a: { uri?: string; data?: string };
      image_b: { uri?: string; data?: string };
      label_a?: string;
      label_b?: string;
    };
  }, [result]);

  // Get image URLs
  const imageAUrl = useMemo(() => {
    if (!comparisonData?.image_a) {
      return "";
    }
    if (comparisonData.image_a.uri) {
      return comparisonData.image_a.uri;
    }
    if (comparisonData.image_a.data) {
      if (comparisonData.image_a.data.startsWith("data:")) {
        return comparisonData.image_a.data;
      }
      return `data:image/png;base64,${comparisonData.image_a.data}`;
    }
    return "";
  }, [comparisonData]);

  const imageBUrl = useMemo(() => {
    if (!comparisonData?.image_b) {
      return "";
    }
    if (comparisonData.image_b.uri) {
      return comparisonData.image_b.uri;
    }
    if (comparisonData.image_b.data) {
      if (comparisonData.image_b.data.startsWith("data:")) {
        return comparisonData.image_b.data;
      }
      return `data:image/png;base64,${comparisonData.image_b.data}`;
    }
    return "";
  }, [comparisonData]);

  useSyncEdgeSelection(props.id, Boolean(props.selected));

  return (
    <Container
      css={styles(theme)}
      sx={{
        display: "flex",
        border: "inherit",
        backgroundColor: theme.vars.palette.c_node_bg,
        backdropFilter: props.selected ? theme.vars.palette.glass.blur : "none",
        WebkitBackdropFilter: props.selected
          ? theme.vars.palette.glass.blur
          : "none"
      }}
      className={`compare-images-node nopan node-drag-handle ${
        hasParent ? "hasParent" : ""
      }`}
    >
      <div className="compare-node-content">
        <Handle
          style={{ top: "30%" }}
          id="image_a"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />
        <Handle
          style={{ top: "50%" }}
          id="image_b"
          type="target"
          position={Position.Left}
          isConnectable={true}
        />

        <NodeResizeHandle minWidth={300} minHeight={250} />
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
        />

        {!comparisonData && (
          <Typography className="hint">
            Connect two images to compare them
          </Typography>
        )}

        <div className="compare-container">
          {imageAUrl && imageBUrl && (
            <ImageComparer
              imageA={imageAUrl}
              imageB={imageBUrl}
              labelA={comparisonData?.label_a || "A"}
              labelB={comparisonData?.label_b || "B"}
              showLabels={true}
              showMetadata={true}
              initialMode="horizontal"
            />
          )}
        </div>
      </div>
    </Container>
  );
};

export default memo(CompareImagesNode, isEqual);
