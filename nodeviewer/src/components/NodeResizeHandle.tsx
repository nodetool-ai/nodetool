/**
 * NodeResizeHandle provides a resize handle for nodes
 */
import React from "react";
import { NodeResizeControl } from "@xyflow/react";

interface NodeResizeHandleProps {
  minWidth?: number;
  minHeight?: number;
}

const NodeResizeHandle: React.FC<NodeResizeHandleProps> = ({
  minWidth = 100,
  minHeight = 50,
}) => {
  return (
    <NodeResizeControl
      minWidth={minWidth}
      minHeight={minHeight}
      style={{
        background: "transparent",
        border: "none",
        width: "100%",
        height: "100%",
        position: "absolute",
        top: 0,
        left: 0,
        borderRadius: "0.3em",
      }}
    />
  );
};

export default NodeResizeHandle;
