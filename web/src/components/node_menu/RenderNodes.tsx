/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import { memo, useCallback, useMemo, useRef } from "react";
// mui
import { ListItemButton, ListItemText, Typography } from "@mui/material";
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { iconForType } from "../../config/data_types";
import { useCreateNode } from "../../hooks/useCreateNode";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import { InfoOutlined } from "@mui/icons-material";
import ThemeNodetool from "../themes/ThemeNodetool";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  hoverDelay?: number;
}

interface NodeItemProps {
  node: NodeMetadata;
  isHovered: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onInfoClick: () => void;
  onDragStart: (event: React.DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
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
        padding: ".1em .5em",
        "& .MuiTypography-root": {
          fontSize: theme.fontSizeSmall
        }
      }
    },
    ".node.hovered": {
      color: theme.palette.c_hl1
    },
    ".namespace-text": {
      color: theme.palette.c_gray6,
      fontWeight: "normal",
      borderBottom: `1px solid ${theme.palette.c_gray3}`,
      borderTop: `1px solid ${theme.palette.c_gray3}`,
      padding: ".25em 0",
      margin: "1em 0 .5em"
    },
    ".node-info:hover": {
      color: theme.palette.c_hl1
    }
  });

const NodeItem: React.FC<NodeItemProps> = memo(
  ({
    node,
    isHovered,
    onMouseEnter,
    onMouseLeave,
    onDragStart,
    onInfoClick,
    onClick
  }: NodeItemProps) => {
    const outputType = node.outputs.length > 0 ? node.outputs[0].type.type : "";

    const infoStyle = useMemo(
      () => ({
        color: isHovered
          ? ThemeNodetool.palette.c_hl1
          : ThemeNodetool.palette.c_gray3
      }),
      [isHovered]
    );

    const handleInfoMouseEnter = useCallback(() => {
      onMouseEnter();
    }, [onMouseEnter]);

    const handleInfoMouseLeave = useCallback(() => {
      onMouseLeave();
    }, [onMouseLeave]);

    return (
      <div
        className={`node ${isHovered ? "hovered" : ""}`}
        draggable
        onDragStart={onDragStart}
      >
        {iconForType(outputType, {
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
        <ListItemButton className="node-button" onClick={onClick}>
          <ListItemText
            primary={<Typography fontSize="small">{node.title}</Typography>}
          />
        </ListItemButton>
        <span
          style={infoStyle}
          onMouseEnter={handleInfoMouseEnter}
          onMouseLeave={handleInfoMouseLeave}
          onClick={onInfoClick}
          className="node-info"
        >
          <InfoOutlined />
        </span>
      </div>
    );
  }
);

NodeItem.displayName = "NodeItem";

const groupNodes = (nodes: NodeMetadata[]) => {
  const groups: { [key: string]: NodeMetadata[] } = {};
  nodes.forEach((node) => {
    if (!groups[node.namespace]) {
      groups[node.namespace] = [];
    }
    groups[node.namespace].push(node);
  });
  return groups;
};

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  hoverDelay = 400
}) => {
  const { hoveredNode, setHoveredNode, setDragToCreate } = useNodeMenuStore(
    (state) => ({
      hoveredNode: state.hoveredNode,
      setHoveredNode: state.setHoveredNode,
      setDragToCreate: state.setDragToCreate
    })
  );

  const handleCreateNode = useCreateNode();
  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);
  const onInfoClick = useCallback(() => {
    setHoveredNode(currentHoveredNodeRef.current);
  }, [setHoveredNode]);

  const { handleMouseEnter, handleMouseLeave } = useDelayedHover(
    useCallback(() => {
      if (currentHoveredNodeRef.current) {
        setHoveredNode(currentHoveredNodeRef.current);
      }
    }, [setHoveredNode]),
    hoverDelay
  );

  const handleDragStart = useCallback(
    (node: NodeMetadata) => (event: React.DragEvent<HTMLDivElement>) => {
      setDragToCreate(true);
      event.dataTransfer.setData("create-node", JSON.stringify(node));
      event.dataTransfer.effectAllowed = "move";
    },
    [setDragToCreate]
  );

  const groupedNodes = useMemo(() => groupNodes(nodes), [nodes]);

  const renderNode = useCallback(
    (node: NodeMetadata) => {
      const isHovered = hoveredNode?.node_type === node.node_type;

      return (
        <NodeItem
          key={`${node.namespace}-${node.title}`}
          node={node}
          isHovered={isHovered}
          onInfoClick={onInfoClick}
          onMouseEnter={() => {
            currentHoveredNodeRef.current = node;
            handleMouseEnter();
          }}
          onMouseLeave={() => {
            currentHoveredNodeRef.current = null;
            handleMouseLeave();
          }}
          onDragStart={handleDragStart(node)}
          onClick={() => handleCreateNode(node)}
        />
      );
    },
    [
      hoveredNode,
      handleMouseEnter,
      handleMouseLeave,
      onInfoClick,
      handleDragStart,
      handleCreateNode
    ]
  );

  const elements = useMemo(() => {
    return Object.entries(groupedNodes).flatMap(
      ([namespace, nodesInNamespace]) => [
        <Typography
          key={`namespace-${namespace}`}
          variant="h5"
          component="div"
          className="namespace-text"
        >
          {namespace}
        </Typography>,
        ...nodesInNamespace.map(renderNode)
      ]
    );
  }, [groupedNodes, renderNode]);

  return (
    <div className="nodes" css={nodeStyles}>
      {elements}
    </div>
  );
};

export default RenderNodes;
