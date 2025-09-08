import React from "react";
import { CircularProgress, Typography, Box } from "@mui/material";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useWorkflow } from "../../serverState/useWorkflow";

interface WorkflowLoadingProps {
  workflowId: string;
}

export const WorkflowLoading: React.FC<WorkflowLoadingProps> = ({
  workflowId
}) => {
  const { isLoading, error } = useWorkflow(workflowId);

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
          <Typography color="error">{(error as Error).message}</Typography>
        </>
      )}
    </Box>
  );
};
