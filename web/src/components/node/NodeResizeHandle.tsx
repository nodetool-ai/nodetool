/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeResizeControl } from "@xyflow/react";
import type { OnResize } from "@xyflow/system";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, MOTION } from "../ui_primitives";
import { memo, useMemo } from "react";
import MediaAspectResizeControl, {
  type ResizeCorner
} from "./MediaAspectResizeControl";

/** Upper bound shared with the edge resizer so the corner handle agrees with it. */
const MAX_NODE_WIDTH = 800;

const ASPECT_CORNERS: ResizeCorner[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left"
];

interface NodeResizeHandleProps {
  minWidth: number;
  minHeight: number;
  onResize?: OnResize;
  /** Lock the width/height ratio while dragging the handle. */
  keepAspectRatio?: boolean;
  /**
   * Keep the node's *media* (image / video) aspect ratio instead of the whole
   * node box, treating header/sliders/outputs as a fixed offset. Requires
   * `nodeId`. Falls back to a free resize when the node holds no media.
   */
  contentAware?: boolean;
  nodeId?: string;
  /** Override the resize upper bound (defaults to the shared node width cap). */
  maxWidth?: number;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    zIndex: 100,
    right: "0",
    bottom: "0",
    width: "25px",
    height: "25px",
    overflow: "hidden",
    ".react-flow__resize-control.nodrag.bottom.right.handle": {
      margin: 0,
      padding: 0,
      width: "100%",
      height: "100%",
      background: "transparent",
      border: "none",
      pointerEvents: "all",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      opacity: 0.6,
      transition: MOTION.all,
      "&:hover": {
        opacity: 1
      },
      "& svg": {
        width: "20px",
        height: "20px",
        left: "50%",
        top: "50%",
        color: theme.vars.palette.grey[100],
        transform: "translate(-50%, -50%) rotate(-45deg)",
        transition: `color ${MOTION.normal}`
      }
    }
  });

const NodeResizeHandle: React.FC<NodeResizeHandleProps> = memo(function NodeResizeHandle({
  minWidth,
  minHeight,
  onResize,
  keepAspectRatio,
  contentAware,
  nodeId,
  maxWidth = MAX_NODE_WIDTH
}) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  if (contentAware && nodeId) {
    return (
      <>
        {ASPECT_CORNERS.map((corner) => (
          <MediaAspectResizeControl
            key={corner}
            corner={corner}
            nodeId={nodeId}
            minWidth={minWidth}
            minHeight={minHeight}
            maxWidth={maxWidth}
          />
        ))}
      </>
    );
  }

  return (
    <Box className="node-resize-handle" css={cssStyles}>
      <NodeResizeControl
        minWidth={minWidth}
        minHeight={minHeight}
        onResize={onResize}
        keepAspectRatio={keepAspectRatio}
      >
        <KeyboardArrowDownIcon />
      </NodeResizeControl>
    </Box>
  );
});

export default NodeResizeHandle;
