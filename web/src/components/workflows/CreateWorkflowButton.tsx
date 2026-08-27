import { useCallback, memo } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";

const CreateWorkflowButton = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);

  const handleCreate = useCallback(async () => {
    const workflow = await createNewWorkflow();
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    navigate(`/editor/${workflow.id}`);
  }, [navigate, createNewWorkflow, queryClient]);

  return (
    <Tooltip title="New workflow" placement="right-start">
      <ToolbarIconButton
        ariaLabel="New workflow"
        onClick={() => void handleCreate()}
        tabIndex={-1}
        icon={<AddIcon />}
      />
    </Tooltip>
  );
};

export default memo(CreateWorkflowButton);
