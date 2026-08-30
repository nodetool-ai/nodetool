import { useCallback } from "react";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";

import { ToolbarIconButton, Tooltip } from "../ui_primitives";
import type { TooltipProps } from "../ui_primitives";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import {
  PROJECT_LIST_REF,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";
import { PROJECT_COLOR } from "./projectIdentity";

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
        icon={
          <DiamondOutlinedIcon
            sx={onProjectSurface ? { color: PROJECT_COLOR } : undefined}
          />
        }
      />
    </Tooltip>
  );
};

export default ProjectsRailButton;
