import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import FolderIcon from "@mui/icons-material/Folder";

import { Caption, FlexRow, SPACING, getSpacingPx } from "../ui_primitives";
import { trpcClient } from "../../trpc/client";
import type { WorkspaceResponse } from "../../stores/ApiTypes";
import { NodeData } from "../../stores/NodeData";
import { useCurrentWorkspace } from "../../hooks/useCurrentWorkspace";

interface SaveDestinationHintProps {
  data: NodeData;
}

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

/**
 * Where a save node with "Save to workspace" on will put its file.
 *
 * The toggle points at the workflow's workspace, which is chosen elsewhere
 * (the workspace chip in the toolbar) — so a node showing the toggle without
 * naming the folder leaves the user guessing, and a workflow with no workspace
 * assigned makes the toggle do nothing at all. Both are worth one line.
 */
const SaveDestinationHint: React.FC<SaveDestinationHintProps> = React.memo(
  ({ data }) => {
    const savesToWorkspace = data?.properties?.save_to_workspace === true;
    const { workspaceId } = useCurrentWorkspace();

    const { data: workspaces } = useQuery({
      queryKey: ["workspaces"],
      queryFn: fetchWorkspaces,
      enabled: savesToWorkspace
    });

    const workspace = useMemo(
      () => workspaces?.find((candidate) => candidate.id === workspaceId),
      [workspaces, workspaceId]
    );

    if (!savesToWorkspace) return null;

    const missing = !workspaceId;
    return (
      <FlexRow
        className="save-destination-hint"
        align="center"
        gap={SPACING.xs}
        sx={{
          padding: `0 ${getSpacingPx(SPACING.md)}`,
          minWidth: 0,
          color: missing
            ? "var(--palette-warning-main)"
            : "var(--palette-grey-400)"
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
          {missing
            ? "No workspace yet — pick one in the toolbar"
            : workspace?.name || workspace?.path || "Workspace"}
        </Caption>
      </FlexRow>
    );
  }
);

SaveDestinationHint.displayName = "SaveDestinationHint";

export default SaveDestinationHint;
