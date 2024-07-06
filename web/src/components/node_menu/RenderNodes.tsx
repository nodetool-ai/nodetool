/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { useRef } from "react";
// mui
import { ListItemButton, ListItemText, Typography } from "@mui/material";
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { iconForType } from "../../config/data_types";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import { titleize } from "../node/BaseNode";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  hoverDelay?: number;
}

const nodeStyles = (theme: any) =>
  css({
    display: "flex",
    flexDirection: "column",
    ".node": {
      display: "flex",
      alignItems: "center",
      margin: "0",
      padding: "0.025em",
      borderRadius: "3px",
      cursor: "pointer",
      ".node-button": {
        padding: ".2em .5em"
      }
    },
    ".node.hovered": {
      color: theme.palette.c_hl1
    }
  });

const RenderNodes: React.FC<RenderNodesProps> = ({ nodes, hoverDelay }) => {
  const { hoveredNode, setHoveredNode, setDragToCreate } = useNodeMenuStore();

  const handleCreateNode = useCreateNode();

  // OUTPUT TYPE
  const getOutputType = (node: NodeMetadata): string => {
    return node.outputs.length > 0 ? node.outputs[0].type.type : "";
  };

  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);

  // Setup hover handlers
  const { handleMouseEnter, handleMouseLeave } = useDelayedHover(() => {
    if (currentHoveredNodeRef.current) {
      setHoveredNode(currentHoveredNodeRef.current);
    }
  }, hoverDelay || 150);

  // drag nodes
  const handleDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    node: NodeMetadata
  ) => {
    setDragToCreate(true);
    event.dataTransfer.setData("create-node", JSON.stringify(node));
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="nodes" css={nodeStyles}>
      {nodes.reduce<JSX.Element[]>((acc, node, index) => {
        const isDifferentNamespace =
          index === 0 || node.namespace !== nodes[index - 1].namespace;
        if (isDifferentNamespace) {
          // namespace headline
          acc.push(
            <Typography
              key={`namespace-${node.namespace}`}
              variant="h5"
              component="div"
              sx={{ my: 2, color: "#888" }}
            >
              {node.namespace}
            </Typography>
          );
        }

        acc.push(
          <div
            key={`${node.namespace}-${node.title}`}
            className={`node ${hoveredNode?.node_type === node.node_type ? "hovered" : ""
              }`}
            onMouseEnter={() => {
              currentHoveredNodeRef.current = node;
              handleMouseEnter();
            }}
            onMouseLeave={() => {
              currentHoveredNodeRef.current = null;
              handleMouseLeave();
            }}
            draggable
            onDragStart={(event) => handleDragStart(event, node)}
          >
            {iconForType(getOutputType(node), {
              fill: "#fff",
              containerStyle: {
                borderRadius: "0 0 3px 0",
                marginLeft: "0.1em",
                marginTop: "0"
              },
              bgStyle: {
                backgroundColor: "#333",
                margin: "0",
                padding: "1px",
                borderRadius: "0 0 3px 0",
                boxShadow: "inset 1px 1px 2px #00000044",
                width: "20px",
                height: "20px"
              },
              width: "15px",
              height: "15px"
            })}
            <ListItemButton
              className="node-button"
              onClick={() => handleCreateNode(node)}
            >
              <ListItemText
                primary={
                  <Typography fontSize="small">
                    {titleize(node.node_type.split(".").pop() || "")}
                  </Typography>
                }
              />
            </ListItemButton>
          </div>
        );

        return acc;
      }, [])}
    </div>
  );
};

export default RenderNodes;
