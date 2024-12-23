/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeResizer as ReactFlowNodeResizer } from "@xyflow/react";
import ThemeNodes from "../themes/ThemeNodes";

interface NodeResizerProps {
  minWidth: number;
  minHeight: number;
}

const styles = (theme: any) =>
  css({
    position: "absolute",
    zIndex: -1,
    right: 0,
    bottom: 0,
    left: 0,
    top: 0,
    pointerEvents: "none",
    ".react-flow__resize-control.handle": {
      opacity: 0
    },
    ".react-flow__resize-control.line": {
      opacity: 0,
      borderWidth: "1px",
      borderColor: theme.palette.c_gray2,
      transition: "all 0.15s ease-in-out"
    },
    ".react-flow__resize-control.line:hover": {
      opacity: 1
    }
  });

const NodeResizer: React.FC<NodeResizerProps> = ({ minWidth, minHeight }) => {
  return (
    <div className="node-resizer" css={styles(ThemeNodes)}>
      <ReactFlowNodeResizer minWidth={minWidth} minHeight={minHeight} />
    </div>
  );
};

export default NodeResizer;
