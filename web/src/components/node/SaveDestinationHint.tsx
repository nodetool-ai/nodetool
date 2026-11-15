import React from "react";
import { useTranslation } from "react-i18next";
import FolderIcon from "@mui/icons-material/FolderOutlined";

import { Caption, FlexRow, SPACING, getSpacingPx } from "../ui_primitives";
import { NodeData } from "../../stores/NodeData";
import { useProjectFolder } from "../../hooks/useProjectFolder";
import {
  LOOSE_PROJECT_ID,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

/** The last segment of a host path, or null for a folder in cloud storage. */
const folderName = (path: string | null): string | null =>
  path ? (path.split(/[\\/]/).filter(Boolean).pop() ?? null) : null;

interface SaveDestinationHintProps {
  data: NodeData;
}

/**
 * Where a save node with "Save to workspace" on will put its file.
 *
 * Runs work in the folder of their project, so the hint names the active
 * project's folder. A node showing the toggle without naming the folder leaves
 * the user guessing.
 */
const SaveDestinationHint: React.FC<SaveDestinationHintProps> = React.memo(
  ({ data }) => {
    const { t } = useTranslation();
    const savesToWorkspace = data?.properties?.save_to_workspace === true;
    const projectId = useWorkspaceTabsStore(
      (state) =>
        state.activeProjectId ?? state.personalProjectId ?? LOOSE_PROJECT_ID
    );
    const { folder, projectName } = useProjectFolder(projectId);

    if (!savesToWorkspace) return null;

    // Only while the project list is still loading: every project has a folder.
    const label = folder ? (folderName(folder.path) ?? projectName) : null;
    return (
      <FlexRow
        className="save-destination-hint"
        align="center"
        gap={SPACING.xs}
        sx={{
          padding: `0 ${getSpacingPx(SPACING.md)}`,
          minWidth: 0,
          color: "var(--palette-grey-400)"
        }}
      >
        <FolderIcon sx={{ fontSize: "var(--fontSizeSmaller)" }} />
        <Caption
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
          title={folder?.path ?? undefined}
        >
          {label ?? t("projectFolder.name")}
        </Caption>
      </FlexRow>
    );
  }
);

SaveDestinationHint.displayName = "SaveDestinationHint";

export default SaveDestinationHint;
