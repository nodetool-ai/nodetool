import React from "react";
import { CircularProgress, Typography, Box } from "@mui/material";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

interface WorkflowLoadingProps {
  workflowId: string;
}

export const WorkflowLoading: React.FC<WorkflowLoadingProps> = ({
  workflowId
}) => {
  const loadingState = useWorkflowManager((state) =>
    state.getLoadingState(workflowId)
  );

  if (!loadingState) {
    return null;
  }

  const { isLoading, error } = loadingState;

  if (!isLoading && !error) {
    return null;
  }

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 2 }}>
      {isLoading && (
        <>
          <CircularProgress size={24} />
          <Typography>Loading workflow...</Typography>
        </>
      )}
      {error && (
        <>
          <ErrorOutlineRounded color="error" />
          <Typography color="error">{error.message}</Typography>
        </>
      )}
    </Box>
  );
};
