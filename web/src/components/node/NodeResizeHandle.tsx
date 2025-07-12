/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeResizeControl, NodeResizer } from "@xyflow/react";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

interface NodeResizeHandleProps {
  minWidth: number;
  minHeight: number;
  onResize?: (event: any) => void;
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
        color: "white",
        transform: "translate(-50%, -50%) rotate(-45deg)",
        transition: "color 0.2s"
      }
    }
  });

const NodeResizeHandle: React.FC<NodeResizeHandleProps> = ({
  minWidth,
  minHeight,
  onResize
}) => {
  const theme = useTheme();
  return (
    <div className="node-resize-handle" css={styles}>
      <NodeResizeControl
        minWidth={minWidth}
        minHeight={minHeight}
        onResize={onResize}
      >
        <KeyboardArrowDownIcon />
      </NodeResizeControl>
    </div>
  );
};

export default NodeResizeHandle;
