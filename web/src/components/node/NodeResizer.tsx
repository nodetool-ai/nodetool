/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeResizer as ReactFlowNodeResizer } from "@xyflow/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import { memo } from "react";

interface NodeResizerProps {
  minWidth: number;
  minHeight: number;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    zIndex: -1,
    right: 0,
    bottom: 0,
    left: 0,
    top: 0,
    width: "50px",
    height: "50px",
    pointerEvents: "none",
    ".react-flow__resize-control.handle": {
      opacity: 0
    },
    ".react-flow__resize-control.line": {
      opacity: 0,
      borderWidth: "1px",
      borderColor: theme.vars.palette.grey[600],
      transition: "all 0.15s ease-in-out"
    },
    ".react-flow__resize-control.line:hover": {
      opacity: 1
    }
  });

const NodeResizer: React.FC<NodeResizerProps> = memo(function NodeResizer({ minWidth, minHeight }) {
  const theme = useTheme();
  return (
    <Box className="node-resizer" css={styles(theme)}>
      <ReactFlowNodeResizer minWidth={minWidth} minHeight={minHeight} />
    </Box>
  );
});

export default NodeResizer;
