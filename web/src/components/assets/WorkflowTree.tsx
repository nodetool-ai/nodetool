/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo, useState } from "react";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CircleIcon from "@mui/icons-material/Circle";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import {
  Text,
  LoadingSpinner,
  SearchInput,
  Box,
  Collapse,
  MOTION,
  BORDER_RADIUS
} from "../ui_primitives";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowList, Workflow } from "../../stores/ApiTypes";

// Show the inline search field once the list grows past this many workflows.
const SEARCH_THRESHOLD = 8;

const styles = (theme: Theme) =>
  css({
    "&.workflow-tree": {
      padding: ".25em 0 1em .5em"
    },
    ".root-row": {
      display: "flex",
      alignItems: "center",
      gap: ".25rem",
      height: "1.5rem",
      cursor: "pointer",
      userSelect: "none"
    },
    ".root-row .root-icon": {
      width: "18px",
      height: "18px",
      color: theme.vars.palette.grey[400]
    },
    ".root-row .root-label": {
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 500,
      color: theme.vars.palette.grey[400]
    },
    ".root-row .expand-icon": {
      width: "20px",
      height: "20px",
      color: theme.vars.palette.grey[400],
      transition: `transform ${MOTION.normal}`,
      transform: "rotate(-90deg)"
    },
    "&.expanded .root-row .expand-icon": {
      transform: "rotate(0deg)"
    },
    ".workflow-leaf": {
      display: "flex",
      alignItems: "center",
      gap: ".4em",
      height: "1.5rem",
      paddingLeft: "1.5rem",
      paddingRight: ".5em",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.md,
      transition: `${MOTION.background}, color ${MOTION.fast}`
    },
    ".workflow-leaf:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".workflow-leaf .leaf-icon": {
      width: "8px",
      height: "8px",
      color: theme.vars.palette.grey[500],
      flexShrink: 0
    },
    ".workflow-leaf .leaf-name": {
      margin: 0,
      fontSize: theme.fontSizeSmall,
      fontWeight: 500,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap"
    },
    ".workflow-leaf.selected": {
      backgroundColor: "rgba(var(--palette-primary-main-channel) / 0.12)"
    },
    ".workflow-leaf.selected .leaf-icon, .workflow-leaf.selected .leaf-name": {
      color: theme.vars.palette.primary.main,
      fontWeight: 600
    },
    ".search-row": {
      padding: ".25em 1.5rem .25em 0"
    },
    ".empty-row": {
      paddingLeft: "1.5rem",
      color: theme.vars.palette.grey[500],
      fontSize: theme.fontSizeSmall
    }
  });

/**
 * Sibling of the FOLDERS tree shown in the fullscreen asset navigator. Lists
 * every workflow as a leaf; selecting one scopes the asset grid to that
 * workflow's assets (mutually exclusive with folder browsing).
 */
const WorkflowTree: React.FC = () => {
  const theme = useTheme();
  const treeStyles = useMemo(() => styles(theme), [theme]);
  const [expanded, setExpanded] = useState(true);
  const [search, setSearch] = useState("");

  const workflowFilter = useAssetGridStore((state) => state.workflowFilter);
  const setWorkflowFilter = useAssetGridStore(
    (state) => state.setWorkflowFilter
  );
  const setSelectedFolderIds = useAssetGridStore(
    (state) => state.setSelectedFolderIds
  );

  const load = useWorkflowManager((state) => state.load);
  const { data, isLoading } = useQuery<WorkflowList, Error>({
    queryKey: ["workflows"],
    queryFn: async () => load("", 200)
  });

  const workflows = useMemo(() => {
    const all = data?.workflows ?? [];
    const term = search.toLowerCase();
    const filtered = term
      ? all.filter((w) => w.name.toLowerCase().includes(term))
      : all;
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [data?.workflows, search]);

  const showSearch = (data?.workflows?.length ?? 0) > SEARCH_THRESHOLD;

  const handleSelect = useCallback(
    (workflow: Workflow) => {
      // Selecting a workflow scopes to its assets and clears the folder highlight.
      setWorkflowFilter(workflow.id);
      setSelectedFolderIds([]);
    },
    [setWorkflowFilter, setSelectedFolderIds]
  );

  return (
    <Box className={`workflow-tree ${expanded ? "expanded" : ""}`} css={treeStyles}>
      <div className="root-row" onClick={() => setExpanded((prev) => !prev)}>
        <ExpandMoreIcon className="expand-icon" />
        <AccountTreeIcon className="root-icon" />
        <span className="root-label">Workflows</span>
      </div>

      <Collapse in={expanded} timeout="auto" unmountOnExit>
        {showSearch && (
          <div className="search-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search workflows..."
              fullWidth
              size="small"
            />
          </div>
        )}
        {isLoading ? (
          <LoadingSpinner size="small" />
        ) : workflows.length === 0 ? (
          <div className="empty-row">No workflows</div>
        ) : (
          workflows.map((workflow) => (
            <div
              key={workflow.id}
              className={`workflow-leaf ${
                workflowFilter === workflow.id ? "selected" : ""
              }`}
              onClick={() => handleSelect(workflow)}
            >
              <CircleIcon className="leaf-icon" />
              <Text className="leaf-name">{workflow.name}</Text>
            </div>
          ))
        )}
      </Collapse>
    </Box>
  );
};

export default memo(WorkflowTree);
