import { useCallback, memo } from "react";
import AddIcon from "@mui/icons-material/Add";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Tooltip, ToolbarIconButton } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

interface CreateWorkflowButtonProps {
  readonly projectId?: string;
}

const CreateWorkflowButton = ({ projectId }: CreateWorkflowButtonProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createNewWorkflow = useWorkflowManager((state) => state.createNew);
  const openTab = useWorkspaceTabsStore((state) => state.openTab);

  const handleCreate = useCallback(async () => {
    const scopedProjectId = projectId ?? creationProjectId();
    const workflow = await createNewWorkflow(scopedProjectId);
    queryClient.invalidateQueries({ queryKey: ["workflows"] });
    openTab({
      type: "workflow",
      ref: workflow.id,
      mode: "edit",
      title: workflow.name,
      projectId: scopedProjectId
    });
    navigate("/workspace");
  }, [navigate, createNewWorkflow, openTab, projectId, queryClient]);

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
