import React from "react";
import FolderIcon from "@mui/icons-material/Folder";

import { Caption, FlexRow, SPACING, getSpacingPx } from "../ui_primitives";
import { NodeData } from "../../stores/NodeData";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";

interface SaveDestinationHintProps {
  data: NodeData;
}

/**
 * Where a save node with "Save to workspace" on will put its file.
 *
 * The toggle points at the run's workspace, which is chosen elsewhere (the
 * workspace chip in the composer) — a node showing the toggle without naming
 * the folder leaves the user guessing. There is always one: a workflow that
 * names none saves into the user's default workspace.
 */
const SaveDestinationHint: React.FC<SaveDestinationHintProps> = React.memo(
  ({ data }) => {
    const savesToWorkspace = data?.properties?.save_to_workspace === true;
    const { workspace } = useCurrentWorkspace();

    if (!savesToWorkspace) return null;

    // Only while the list is still loading — the server creates a default
    // workspace, so "none" is a transient state, not a configuration error.
    const missing = !workspace;
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
          title={workspace?.path ?? undefined}
        >
          {missing ? "Workspace" : workspace.name || workspace.path}
        </Caption>
      </FlexRow>
    );
  }
);

SaveDestinationHint.displayName = "SaveDestinationHint";

export default SaveDestinationHint;
