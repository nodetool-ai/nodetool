/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeResizeControl } from "@xyflow/react";
import type { OnResize } from "@xyflow/system";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import { memo } from "react";

interface NodeResizeHandleProps {
  minWidth: number;
  minHeight: number;
  onResize?: OnResize;
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
      transition: "all 0.2s ease",
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
        transition: "color 0.2s"
      }
    }
  });

const NodeResizeHandle: React.FC<NodeResizeHandleProps> = memo(function NodeResizeHandle({
  minWidth,
  minHeight,
  onResize
}) {
  const theme = useTheme();
  return (
    <Box className="node-resize-handle" css={styles(theme)}>
      <NodeResizeControl
        minWidth={minWidth}
        minHeight={minHeight}
        onResize={onResize}
      >
        <KeyboardArrowDownIcon />
      </NodeResizeControl>
    </Box>
  );
});

export default NodeResizeHandle;
