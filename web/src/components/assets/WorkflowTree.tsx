/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { memo, useCallback, useMemo, useState } from "react";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
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
  BORDER_RADIUS,
  SPACING,
  getSpacingPx
} from "../ui_primitives";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowList, Workflow } from "../../stores/ApiTypes";
import { useActivateOnKey } from "../../hooks/useActivateOnKey";

// Show the inline search field once the list grows past this many workflows.
const SEARCH_THRESHOLD = 8;

// Shared with the FOLDERS tree so both navigators read as one component: same
// row height, hover, selected treatment, and a leading-icon column the names
// align to. The section header matches the FOLDERS root (icon + uppercase
// label, left-aligned); only the collapse chevron is added on the right since
// the workflow list is long.
const ROW_HEIGHT = "1.5rem";
const ICON_SLOT = "18px";

const styles = (theme: Theme) =>
  css({
    "&.workflow-tree": {
      padding: ".25em .5em 1em .5em"
    },
    ".root-row": {
      display: "flex",
      alignItems: "center",
      gap: ".4em",
      height: ROW_HEIGHT,
      paddingLeft: getSpacingPx(SPACING.micro),
      cursor: "pointer",
      userSelect: "none",
      borderRadius: BORDER_RADIUS.md,
      transition: MOTION.background
    },
    ".root-row:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".root-row .root-icon": {
      width: ICON_SLOT,
      height: ICON_SLOT,
      color: theme.vars.palette.grey[400],
      flexShrink: 0
    },
    ".root-row .root-label": {
      flex: 1,
      fontSize: theme.fontSizeSmall,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 500,
      color: theme.vars.palette.grey[400]
    },
    ".root-row .expand-icon": {
      width: "16px",
      height: "16px",
      color: theme.vars.palette.grey[500],
      transition: `transform ${MOTION.normal}`,
      transform: "rotate(-90deg)"
    },
    "&.expanded .root-row .expand-icon": {
      transform: "rotate(0deg)"
    },
    ".search-row": {
      padding: ".25em 0 .25em 0"
    },
    ".workflow-leaf": {
      display: "flex",
      alignItems: "center",
      gap: ".4em",
      height: ROW_HEIGHT,
      paddingLeft: ".75rem",
      paddingRight: ".25em",
      cursor: "pointer",
      borderRadius: BORDER_RADIUS.md,
      transition: `${MOTION.background}, color ${MOTION.fast}`
    },
    ".workflow-leaf:hover": {
      backgroundColor: theme.vars.palette.action.hover
    },
    ".workflow-leaf .leaf-icon-slot": {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: ICON_SLOT,
      flexShrink: 0
    },
    ".workflow-leaf .leaf-icon": {
      width: "14px",
      height: "14px",
      color: theme.vars.palette.grey[500]
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
    ".workflow-leaf.selected .leaf-icon": {
      color: theme.vars.palette.primary.main
    },
    ".workflow-leaf.selected .leaf-name": {
      color: theme.vars.palette.primary.main,
      fontWeight: 600
    },
    ".empty-row": {
      paddingLeft: "1.75rem",
      color: theme.vars.palette.grey[500],
      fontSize: theme.fontSizeSmaller
    }
  });

// Compact the shared SearchInput so it sits as a tree control, not a hero field.
const searchInputSx = {
  "& .MuiInputBase-root": { minHeight: "28px", height: "28px" },
  "& .MuiInputBase-input": { fontSize: "var(--fontSizeSmaller)", py: 0 }
};

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

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);
  const handleRootKeyDown = useActivateOnKey(toggleExpanded);

  return (
    <Box className={`workflow-tree ${expanded ? "expanded" : ""}`} css={treeStyles}>
      <div
        className="root-row"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label="Workflows"
        onClick={toggleExpanded}
        onKeyDown={handleRootKeyDown}
      >
        <AccountTreeIcon className="root-icon" />
        <span className="root-label">Workflows</span>
        <ExpandMoreIcon className="expand-icon" />
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
              sx={searchInputSx}
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
              role="button"
              tabIndex={0}
              aria-label={workflow.name}
              onClick={() => handleSelect(workflow)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleSelect(workflow);
                }
              }}
            >
              <span className="leaf-icon-slot">
                <AccountTreeOutlinedIcon className="leaf-icon" />
              </span>
              <Text className="leaf-name">{workflow.name}</Text>
            </div>
          ))
        )}
      </Collapse>
    </Box>
  );
};

export default memo(WorkflowTree);
