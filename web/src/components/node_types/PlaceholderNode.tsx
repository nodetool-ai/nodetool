import { memo } from "react";
import { NodeProps, Handle, Position } from "reactflow";
import { isEqual } from "lodash";
import { Container } from "@mui/material";
import { NodeData } from "../../stores/NodeData";

const PlaceholderNode = (props: NodeProps<NodeData>) => {
  const className = `placeholder-node ${
    props.data.collapsed ? "collapsed" : ""
  } ${props.selected ? "selected" : ""}`
    .replace(/\s+/g, " ")
    .trim();

  return (
    <Container
      className={className}
      style={{
        border: "2px dashed red",
        padding: "10px",
        textAlign: "center"
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="node-header">-</div>
      <Handle type="source" position={Position.Right} />
    </Container>
  );
};

export default memo(PlaceholderNode, (prevProps, nextProps) =>
  isEqual(prevProps, nextProps)
);
