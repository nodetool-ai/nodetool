/** @jsxImportSource @emotion/react */
/**
 * SubgraphBreadcrumb - Navigation breadcrumb for hierarchical subgraph navigation
 *
 * Displays the current navigation path from root to the current subgraph level.
 * Clicking on a breadcrumb item navigates to that level.
 */

import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { Box, Button } from "@mui/material";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useSubgraphStore, ROOT_GRAPH_ID } from "../../stores/SubgraphStore";
import { useNodes } from "../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    top: 8,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 10,
    padding: "4px 8px",
    backgroundColor: theme.vars.palette.background.paper,
    border: `1px solid ${theme.vars.palette.divider}`,
    borderRadius: "8px",
    boxShadow: "0 2px 12px rgba(0, 0, 0, 0.2)",
    display: "flex",
    alignItems: "center",
    gap: "4px",
    ".nav-button": {
      textTransform: "none",
      fontSize: "13px",
      fontWeight: 500,
      padding: "4px 12px",
      minWidth: "auto",
      borderRadius: "6px",
      color: theme.vars.palette.text.primary,
      backgroundColor: "transparent",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.hover
      }
    },
    ".nav-button-current": {
      textTransform: "none",
      fontSize: "13px",
      fontWeight: 600,
      padding: "4px 12px",
      minWidth: "auto",
      borderRadius: "6px",
      color: theme.vars.palette.primary.main,
      backgroundColor: theme.vars.palette.action.selected,
      cursor: "default",
      "&:hover": {
        backgroundColor: theme.vars.palette.action.selected
      }
    },
    ".separator": {
      color: theme.vars.palette.text.disabled,
      display: "flex",
      alignItems: "center"
    }
  });

const SubgraphBreadcrumb: React.FC = () => {
  const theme = useTheme();
  // Select currentGraphId directly to ensure proper reactivity
  const currentGraphId = useSubgraphStore((state) => state.currentGraphId);
  const navigationPath = useSubgraphStore((state) => state.navigationPath);
  const exitToRoot = useSubgraphStore((state) => state.exitToRoot);
  const getDefinition = useSubgraphStore((state) => state.getDefinition);
  const getGraph = useSubgraphStore((state) => state.getGraph);
  const { workflow } = useNodes((state) => ({
    workflow: state.workflow
  }));

  // Compute isAtRoot locally for proper reactivity
  const isAtRoot = currentGraphId === ROOT_GRAPH_ID;

  // Don't show breadcrumb if at root level
  if (isAtRoot) {
    return null;
  }

  const handleNavigateToRoot = () => {
    exitToRoot();
  };

  const handleNavigateToLevel = (index: number) => {
    // Exit subgraphs until we reach the desired level
    const currentDepth = navigationPath.length;
    const targetDepth = index + 1;
    const exitCount = currentDepth - targetDepth;

    const exitSubgraph = useSubgraphStore.getState().exitSubgraph;
    for (let i = 0; i < exitCount; i++) {
      exitSubgraph();
    }
  };

  // Helper to find a node in a specific cached graph
  const findNodeInGraph = (graphId: string, nodeId: string) => {
    const cachedGraph = getGraph(graphId);
    if (cachedGraph) {
      return cachedGraph.nodes.find((n) => n.id === nodeId);
    }
    return undefined;
  };

  const breadcrumbItems: Array<{ label: string; onClick?: () => void }> = [
    {
      label: workflow.name || "Workflow",
      onClick: handleNavigateToRoot
    }
  ];

  // Build breadcrumb path from navigation stack
  for (let i = 0; i < navigationPath.length; i++) {
    const instanceId = navigationPath[i];

    // Find the instance node in the parent graph's cache
    // For the first item, parent is ROOT_GRAPH_ID
    // For subsequent items, parent is the previous item in the path
    const parentGraphId = i === 0 ? ROOT_GRAPH_ID : navigationPath[i - 1];
    const node = findNodeInGraph(parentGraphId, instanceId);

    // Try to get the subgraph definition to show its name
    let label = "Subgraph";
    if (node && node.data?.subgraphId) {
      const subgraphId = node.data.subgraphId;
      const definition = getDefinition(subgraphId);
      if (definition) {
        label = definition.name;
      }
    }

    // Last item is current, not clickable
    if (i === navigationPath.length - 1) {
      breadcrumbItems.push({ label });
    } else {
      breadcrumbItems.push({
        label,
        onClick: () => handleNavigateToLevel(i)
      });
    }
  }

  return (
    <Box css={styles(theme)}>
      {breadcrumbItems.map((item, index) => {
        const isLast = index === breadcrumbItems.length - 1;

        return (
          <Box key={index} sx={{ display: "flex", alignItems: "center" }}>
            {index > 0 && (
              <span className="separator">
                <ChevronRightIcon fontSize="small" />
              </span>
            )}
            <Button
              className={isLast ? "nav-button-current" : "nav-button"}
              onClick={item.onClick}
              disabled={isLast}
              disableRipple={isLast}
            >
              {item.label}
            </Button>
          </Box>
        );
      })}
    </Box>
  );
};

export default SubgraphBreadcrumb;
