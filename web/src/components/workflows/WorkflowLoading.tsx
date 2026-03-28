import React from "react";
import { ErrorOutlineRounded } from "@mui/icons-material";
import { useWorkflow } from "../../serverState/useWorkflow";
import { FlexRow, LoadingSpinner, Text } from "../ui_primitives";

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
    <FlexRow gap={2} align="center" padding={2}>
      {isLoading && (
        <>
          <LoadingSpinner size="small" />
          <Text>Loading workflow...</Text>
        </>
      )}
      {error && (
        <>
          <ErrorOutlineRounded color="error" />
          <Text color="error">{(error as Error).message}</Text>
        </>
      )}
    </FlexRow>
  );
};
