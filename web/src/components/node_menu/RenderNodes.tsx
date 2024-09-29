import { memo, useCallback, useMemo, useRef } from "react";
// mui
import { ListItemButton, ListItemText, Typography } from "@mui/material";
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { IconForType } from "../../config/data_types";
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
    const searchTerm = useNodeMenuStore((state) => state.searchTerm);

    const highlightNodeTitle = useCallback(
      (title: string): string => {
        if (!searchTerm) return title;
        const regex = new RegExp(`(${searchTerm})`, "gi");
        return title.replace(
          regex,
          `<span class="highlight" style="border-bottom: 1px solid ${ThemeNodetool.palette.c_hl1}">$1</span>`
        );
      },
      [searchTerm]
    );

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
        <IconForType
          iconName={outputType}
          containerStyle={{
            borderRadius: "0 0 3px 0",
            marginLeft: "0.1em",
            marginTop: "0"
          }}
          bgStyle={{
            backgroundColor: "#333",
            margin: "0",
            padding: "1px",
            borderRadius: "0 0 3px 0",
            boxShadow: "inset 1px 1px 2px #00000044",
            width: "20px",
            height: "20px"
          }}
          svgProps={{
            width: "15px",
            height: "15px"
          }}
        />
        <ListItemButton className="node-button" onClick={onClick}>
          <ListItemText
            primary={
              <Typography fontSize="small">
                {searchTerm ? (
                  <span
                    dangerouslySetInnerHTML={{
                      __html: highlightNodeTitle(node.title)
                    }}
                  />
                ) : (
                  node.title
                )}
              </Typography>
            }
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
          key={node.node_type}
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

  return <div className="nodes">{elements}</div>;
};

export default RenderNodes;
