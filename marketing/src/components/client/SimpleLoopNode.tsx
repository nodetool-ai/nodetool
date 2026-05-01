/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { NodeProps, Node, Position, Handle } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { colorForType } from "../data_types";

const styles = (theme: any) =>
  css({
    boxShadow: "none",
    minWidth: "400px",
    minHeight: "250px",
    height: "100%",
    display: "flex",
    borderRadius: "5px",
    border: `1px solid rgba(48, 92, 157, 0.1)`,
    backgroundColor: "rgba(48, 92, 157, 0.1)",
    position: "relative",
    ".node-header": {
      height: "2em",
      backgroundColor: "rgba(0,0,0,0.1)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "bold",
      width: "100%",
    },
  });

const SimpleLoopNode: React.FC<NodeProps<Node<NodeData>>> = (props) => {
  return (
    <div css={styles} className="simple-loop-node">
      <Handle
        type="target"
        position={Position.Left}
        id="input"
        className="input-handle"
        style={
          {
            background: "#e0e0e0",
          } as React.CSSProperties
        }
      />
      <Handle
        type="source"
        position={Position.Right}
        id="output"
        className="output-handle"
        style={
          {
            background: "#e0e0e0",
          } as React.CSSProperties
        }
      />
      <div className="node-header">Loop</div>
    </div>
  );
};

export default SimpleLoopNode;
