import React, { memo, useCallback } from "react";
import { Tooltip, IconButton } from "@mui/material";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import WorkspacesManager from "./WorkspacesManager";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";

const WorkspacesButton: React.FC = memo(function WorkspacesButton() {
  const isOpen = useWorkspaceManagerStore((state) => state.isOpen);
  const setIsOpen = useWorkspaceManagerStore((state) => state.setIsOpen);

  const handleOpen = useCallback(() => setIsOpen(true), [setIsOpen]);
  const handleClose = useCallback(() => setIsOpen(false), [setIsOpen]);

  return (
    <>
      <WorkspacesManager open={isOpen} onClose={handleClose} />
      <Tooltip
        title="Workspaces Manager"
        enterDelay={TOOLTIP_ENTER_DELAY}
        placement="bottom"
      >
        <IconButton
          className="nav-button workspaces-button"
          onClick={handleOpen}
          tabIndex={-1}
        >
          <FolderOpenIcon />
          <span className="nav-button-text">Workspaces</span>
        </IconButton>
      </Tooltip>
    </>
  );
});

WorkspacesButton.displayName = "WorkspacesButton";

export default WorkspacesButton;
