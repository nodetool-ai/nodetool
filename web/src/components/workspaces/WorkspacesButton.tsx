import React, { memo, useCallback } from "react";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import { useWorkspaceManagerStore } from "../../stores/WorkspaceManagerStore";
import WorkspacesManager from "./WorkspacesManager";
import { ToolbarIconButton } from "../ui_primitives";

const WorkspacesButton: React.FC = memo(function WorkspacesButton() {
  const isOpen = useWorkspaceManagerStore((state) => state.isOpen);
  const setIsOpen = useWorkspaceManagerStore((state) => state.setIsOpen);

  const handleOpen = useCallback(() => setIsOpen(true), [setIsOpen]);
  const handleClose = useCallback(() => setIsOpen(false), [setIsOpen]);

  return (
    <>
      <WorkspacesManager open={isOpen} onClose={handleClose} />
      <ToolbarIconButton
        icon={<FolderOpenIcon />}
        tooltip="Workspaces Manager"
        onClick={handleOpen}
        className="workspaces-button"
        nodrag={false}
      />
    </>
  );
});

WorkspacesButton.displayName = "WorkspacesButton";

export default WorkspacesButton;
