/** @jsxImportSource @emotion/react */
import { memo, useCallback, useMemo, useRef, useLayoutEffect } from "react";
// mui
// store
import { NodeMetadata } from "../../stores/ApiTypes";
import useNodeMenuStore from "../../stores/NodeMenuStore";
// utils
import { useCreateNode } from "../../hooks/useCreateNode";
import { useDelayedHover } from "../../hooks/useDelayedHover";
import NodeItem from "./NodeItem";
import {
  Typography,
  Tooltip,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from "@mui/material";
import { isEqual } from "lodash";
import ApiKeyValidation from "../node/ApiKeyValidation";
import ThemeNodes from "../themes/ThemeNodes";
import { SearchResultGroup } from "../../stores/NodeMenuStore";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NodeInfo from "./NodeInfo";

interface RenderNodesProps {
  nodes: NodeMetadata[];
  hoverDelay?: number;
  showTooltips?: boolean;
}

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

const getServiceFromNamespace = (namespace: string): string => {
  const parts = namespace.split(".");
  return parts[0];
};

const renderGroupTitle = (title: string) => {
  const tooltips: Record<string, string> = {
    Name: "Exact matches in node names",
    Namespace: "Matches in node namespaces and tags",
    Description: "Matches found in node descriptions. Better results on top."
  };

  return (
    <Tooltip title={tooltips[title] || ""} placement="bottom" enterDelay={200}>
      <Typography
        variant="h6"
        component="div"
        sx={{
          color: ThemeNodes.palette.c_hl1,
          fontSize: "0.9em",
          padding: "0.5em 0 0"
        }}
      >
        {title}
      </Typography>
    </Tooltip>
  );
};

const RenderNodes: React.FC<RenderNodesProps> = ({
  nodes,
  hoverDelay = 20,
  showTooltips = true
}) => {
  const {
    focusedNodeIndex,
    hoveredNode,
    setHoveredNode,
    setDragToCreate,
    groupedSearchResults,
    searchTerm
  } = useNodeMenuStore((state) => ({
    focusedNodeIndex: state.focusedNodeIndex,
    hoveredNode: state.hoveredNode,
    setHoveredNode: state.setHoveredNode,
    setDragToCreate: state.setDragToCreate,
    groupedSearchResults: state.groupedSearchResults,
    searchTerm: state.searchTerm
  }));

  const handleCreateNode = useCreateNode();
  const currentHoveredNodeRef = useRef<NodeMetadata | null>(null);
  const onInfoClick = useCallback(() => {
    if (hoveredNode) {
      setHoveredNode(null);
    } else {
      setHoveredNode(currentHoveredNodeRef.current);
    }
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

  const focusedNodeRef = useRef<HTMLDivElement>(null);

  const renderNode = useCallback(
    (node: NodeMetadata, index: number) => {
      const isHovered = hoveredNode?.node_type === node.node_type;
      const isFocused = index === focusedNodeIndex;

      const nodeElement = (
        <div key={node.node_type}>
          <NodeItem
            key={node.node_type}
            ref={isFocused ? focusedNodeRef : undefined}
            node={node}
            isHovered={isHovered}
            isFocused={isFocused}
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
        </div>
      );

      return showTooltips ? (
        <Tooltip
          key={`tooltip-${node.node_type}`}
          title={<NodeInfo nodeMetadata={node} />}
          placement="right"
          enterDelay={0}
          leaveDelay={0}
          TransitionProps={{ timeout: 0 }}
        >
          {nodeElement}
        </Tooltip>
      ) : (
        nodeElement
      );
    },
    [
      hoveredNode,
      focusedNodeIndex,
      handleMouseEnter,
      handleMouseLeave,
      onInfoClick,
      handleDragStart,
      handleCreateNode,
      showTooltips
    ]
  );

  useLayoutEffect(() => {
    if (focusedNodeRef.current) {
      focusedNodeRef.current.scrollIntoView({
        block: "nearest"
      });
    }
  }, [focusedNodeIndex]);

  const renderGroup = useCallback(
    (group: SearchResultGroup, globalIndex: number) => {
      const groupedNodes = groupNodes(group.nodes);

      return (
        <Accordion
          key={group.title}
          defaultExpanded={true}
          disableGutters
          sx={{
            "&.MuiPaper-root.MuiAccordion-root": {
              backgroundColor: "transparent !important",
              boxShadow: "none !important",
              "--Paper-overlay": "0 !important",
              "&:before": {
                display: "none"
              },
              "& .MuiAccordionDetails-root": {
                backgroundColor: "transparent !important",
                padding: "0 0 1em 0"
              },
              "&.MuiPaper-elevation, &.MuiPaper-elevation1": {
                backgroundColor: "transparent !important"
              },
              "&.Mui-expanded": {
                backgroundColor: "transparent !important"
              },
              "&.MuiAccordion-rounded": {
                backgroundColor: "transparent !important"
              }
            }
          }}
        >
          <AccordionSummary
            expandIcon={
              <ExpandMoreIcon sx={{ color: ThemeNodes.palette.c_gray3 }} />
            }
            sx={{
              padding: 0,
              minHeight: "unset",
              "& .MuiAccordionSummary-content": {
                margin: 0
              }
            }}
          >
            {renderGroupTitle(group.title)}
          </AccordionSummary>
          <AccordionDetails sx={{ padding: "0 0 1em 0" }}>
            {Object.entries(groupedNodes).map(
              ([namespace, nodesInNamespace]) => (
                <div key={namespace}>
                  <Typography
                    variant="h5"
                    component="div"
                    className="namespace-text"
                  >
                    {namespace}
                  </Typography>
                  {nodesInNamespace.map((node) => {
                    const element = renderNode(node, globalIndex);
                    globalIndex += 1;
                    return element;
                  })}
                </div>
              )
            )}
          </AccordionDetails>
        </Accordion>
      );
    },
    [renderNode]
  );

  const elements = useMemo(() => {
    // If we're searching, use the grouped results
    if (searchTerm) {
      let globalIndex = 0;
      return groupedSearchResults.map((group) => {
        const element = renderGroup(group, globalIndex);
        globalIndex += group.nodes.length;
        return element;
      });
    }

    // Otherwise use the original namespace-based grouping
    let globalIndex = 0;
    const seenServices = new Set<string>();

    return Object.entries(groupNodes(nodes)).flatMap(
      ([namespace, nodesInNamespace], namespaceIndex) => {
        const service = getServiceFromNamespace(namespace);
        const isFirstNamespaceForService = !seenServices.has(service);
        seenServices.add(service);

        const elements = [];

        if (isFirstNamespaceForService) {
          elements.push(
            <ApiKeyValidation
              key={`api-key-${service}-${namespaceIndex}`}
              nodeNamespace={namespace}
            />
          );
        }

        elements.push(
          <Typography
            key={`namespace-${namespace}-${namespaceIndex}`}
            variant="h5"
            component="div"
            className="namespace-text"
          >
            {namespace}
          </Typography>,
          ...nodesInNamespace.map((node) => {
            const element = renderNode(node, globalIndex);
            globalIndex += 1;
            return element;
          })
        );

        return elements;
      }
    );
  }, [nodes, searchTerm, groupedSearchResults, renderNode, renderGroup]);

  return (
    <div className="nodes">
      {nodes.length > 0 ? (
        elements
      ) : (
        <div className="no-selection">
          <div className="explanation">
            <Typography variant="h5" style={{ marginTop: 0 }}>
              Browse Nodes
            </Typography>
            <ul>
              <li>Click on the namespaces to the left</li>
            </ul>

            <Typography variant="h5">Search Nodes</Typography>
            <ul>
              <li>Type in the search bar to search for nodes.</li>
            </ul>

            <Typography variant="h5">Create Nodes</Typography>
            <ul>
              <li>Click on a node</li>
              <li>Drag a node onto the canvas</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(RenderNodes, isEqual);
