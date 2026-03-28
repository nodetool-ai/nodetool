import React, { useCallback, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box } from "@mui/material";
import { useWorkspace, useWorkspaces } from "../../serverState/useWorkspace";
import VibeCodingPanel from "./VibeCodingPanel";

const VibeCodingRoute: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();

  const { data: workspace } = useWorkspace(workspaceId);
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useWorkspaces();

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      navigate(`/vibecoding/${id}`, { replace: true });
    },
    [navigate]
  );

  return (
    <Box sx={{ display: "flex", height: "100%", pt: "42px", ml: "35px" }}>
      <VibeCodingPanel
        workspaceId={workspaceId}
        workspacePath={workspace?.is_accessible ? workspace.path : undefined}
        workspaces={workspaces}
        isLoadingWorkspaces={isLoadingWorkspaces}
        onWorkspaceChange={handleWorkspaceChange}
      />
    </Box>
  );
};

export default memo(VibeCodingRoute);
