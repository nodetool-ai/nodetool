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
import { Breadcrumbs, Link, Typography } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useSubgraphStore } from "../../stores/SubgraphStore";
import { useNodes } from "../../contexts/NodeContext";

const styles = (theme: Theme) =>
  css({
    padding: "8px 16px",
    backgroundColor: theme.vars.palette.background.paper,
    borderBottom: `1px solid ${theme.vars.palette.divider}`,
    display: "flex",
    alignItems: "center",
    minHeight: "48px",
    ".breadcrumb-link": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      cursor: "pointer",
      color: theme.vars.palette.text.primary,
      textDecoration: "none",
      "&:hover": {
        textDecoration: "underline",
        color: theme.vars.palette.primary.main
      }
    },
    ".breadcrumb-current": {
      display: "flex",
      alignItems: "center",
      gap: "4px",
      color: theme.vars.palette.text.secondary,
      fontWeight: 600
    },
    ".home-icon": {
      fontSize: "18px"
    }
  });

const SubgraphBreadcrumb: React.FC = () => {
  const theme = useTheme();
  const navigationPath = useSubgraphStore((state) => state.navigationPath);
  const exitToRoot = useSubgraphStore((state) => state.exitToRoot);
  const isAtRoot = useSubgraphStore((state) => state.isAtRoot());
  const getDefinition = useSubgraphStore((state) => state.getDefinition);
  const { findNode, workflow } = useNodes((state) => ({
    findNode: state.findNode,
    workflow: state.workflow
  }));

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

  const breadcrumbItems: Array<{ label: string; onClick?: () => void }> = [
    {
      label: workflow.name || "Workflow",
      onClick: handleNavigateToRoot
    }
  ];

  // Build breadcrumb path from navigation stack
  for (let i = 0; i < navigationPath.length; i++) {
    const instanceId = navigationPath[i];
    const node = findNode(instanceId);
    
    // Try to get the subgraph definition to show its name
    let label = "Subgraph";
    if (node && (node.data as any).subgraphId) {
      const subgraphId = (node.data as any).subgraphId;
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
    <div css={styles(theme)}>
      <Breadcrumbs
        separator={<ChevronRightIcon fontSize="small" />}
        aria-label="subgraph navigation breadcrumb"
      >
        {breadcrumbItems.map((item, index) => {
          const isLast = index === breadcrumbItems.length - 1;
          const isFirst = index === 0;

          if (isLast) {
            return (
              <Typography key={index} className="breadcrumb-current">
                {isFirst && <HomeIcon className="home-icon" />}
                {item.label}
              </Typography>
            );
          }

          return (
            <Link
              key={index}
              className="breadcrumb-link"
              component="button"
              variant="body2"
              onClick={item.onClick}
            >
              {isFirst && <HomeIcon className="home-icon" />}
              {item.label}
            </Link>
          );
        })}
      </Breadcrumbs>
    </div>
  );
};

export default SubgraphBreadcrumb;
