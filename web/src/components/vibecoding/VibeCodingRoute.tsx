import React, { useState, useCallback, memo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Box, Typography, CircularProgress } from "@mui/material";
import { useWorkspace, useWorkspaces } from "../../serverState/useWorkspace";
import VibeCodingToolbar from "./VibeCodingToolbar";
import VibeCodingPanel from "./VibeCodingPanel";

type VibeCodingMode = "chat" | "wysiwyg" | "theme";

const VibeCodingRoute: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId?: string }>();
  const navigate = useNavigate();
  const [mode, setMode] = useState<VibeCodingMode>("chat");

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError
  } = useWorkspace(workspaceId);
  const { data: workspaces, isLoading: isLoadingWorkspaces } = useWorkspaces();

  const handleWorkspaceChange = useCallback(
    (id: string) => {
      navigate(`/vibecoding/${id}`, { replace: true });
    },
    [navigate]
  );

  const handleModeChange = useCallback((m: VibeCodingMode) => {
    setMode(m);
  }, []);

  const toolbar = (
    <VibeCodingToolbar
      workspaces={workspaces}
      selectedWorkspaceId={workspaceId}
      onWorkspaceChange={handleWorkspaceChange}
      isLoadingWorkspaces={isLoadingWorkspaces}
      mode={mode}
      onModeChange={handleModeChange}
    />
  );

  // Error: workspace not found
  if (workspaceId && workspaceError) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {toolbar}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography variant="h6" color="error">
            Workspace not found
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The workspace may have been deleted or is not accessible.
          </Typography>
        </Box>
      </Box>
    );
  }

  // Loading
  if (workspaceId && isLoadingWorkspace) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {toolbar}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          <CircularProgress />
        </Box>
      </Box>
    );
  }

  // Inaccessible workspace
  if (workspace && !workspace.is_accessible) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {toolbar}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography variant="h6" color="warning.main">
            Workspace not accessible
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Directory not found: {workspace.path}
          </Typography>
        </Box>
      </Box>
    );
  }

  // No workspace selected
  if (!workspaceId || !workspace) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {toolbar}
        <Box
          sx={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 2
          }}
        >
          <Typography sx={{ fontSize: 48, opacity: 0.3 }}>⚡</Typography>
          <Typography variant="h6" color="text.secondary">
            Select a workspace to start building
          </Typography>
          <Typography variant="body2" color="text.disabled">
            Choose a workspace from the dropdown above
          </Typography>
        </Box>
      </Box>
    );
  }

  // Active builder
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toolbar}
      <VibeCodingPanel
        workspaceId={workspaceId}
        workspacePath={workspace.path}
      />
    </Box>
  );
};

export default memo(VibeCodingRoute);
