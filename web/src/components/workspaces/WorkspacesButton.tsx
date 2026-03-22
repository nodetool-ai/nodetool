/**
 * WorkspacesButton
 *
 * A toolbar button that opens the Workspaces Manager dialog.
 * Uses the WorkspaceManagerStore to manage the open/closed state of the dialog.
 *
 * @example
 * ```tsx
 * <WorkspacesButton />
 * ```
 *
 * Features:
 * - Renders a ToolbarIconButton with a folder icon
 * - Opens WorkspacesManager dialog when clicked
 * - Manages dialog state through WorkspaceManagerStore
 * - Tooltip displays "Workspaces Manager" on hover
 */

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
