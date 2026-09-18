import { useCallback } from "react";

import { Box, ToolbarIconButton, Tooltip } from "../ui_primitives";
import type { TooltipProps } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  PROJECT_LIST_REF,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { PROJECT_COLOR } from "./projectIdentity";

const ProjectsIcon = ({ active }: { active: boolean }) => (
  <Box
    component="svg"
    viewBox="0 0 24 24"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    sx={{
      width: "1em",
      height: "1em",
      color: active ? PROJECT_COLOR : undefined
    }}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </Box>
);

/**
 * The rail's Projects entry. Unlike the views below it this opens a tab
 * rather than a drawer — the projects list is a surface, not a sidebar.
 */
const ProjectsRailButton = ({
  onSelect,
  tooltipPlacement = "right-start"
}: {
  onSelect?: () => void;
  tooltipPlacement?: TooltipProps["placement"];
}) => {
  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const onProjectSurface = useWorkspaceTabsStore((state) => {
    const active = state.tabs.find((tab) => tab.id === state.activeTabId);
    return active?.type === "project" || active?.type === "project-list";
  });

  const handleClick = useCallback(() => {
    openTab({
      type: "project-list",
      ref: PROJECT_LIST_REF,
      mode: "view",
      title: "Projects"
    });
    onSelect?.();
  }, [openTab, onSelect]);

  return (
    <Tooltip
      title="Projects"
      placement={tooltipPlacement}
      delay={TOOLTIP_ENTER_DELAY}
    >
      <ToolbarIconButton
        tabIndex={-1}
        ariaLabel="Projects"
        className={onProjectSurface ? "active" : ""}
        onClick={handleClick}
        icon={<ProjectsIcon active={onProjectSurface} />}
      />
    </Tooltip>
  );
};

export default ProjectsRailButton;
