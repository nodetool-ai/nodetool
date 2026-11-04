import { useCallback, memo, useState, lazy, Suspense } from "react";
import AddIcon from "@mui/icons-material/AddOutlined";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Tooltip, ToolbarIconButton, FlexRow } from "../ui_primitives";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import {
  creationProjectId,
  useWorkspaceTabsStore
} from "../../stores/WorkspaceTabsStore";

const CreateTorchWorkflowDialog = lazy(
  () => import("./CreateTorchWorkflowDialog")
);

interface CreateWorkflowButtonProps {
  readonly projectId?: string;
}

const CreateWorkflowButton = ({ projectId }: CreateWorkflowButtonProps) => {
  const [showTorch, setShowTorch] = useState(false);
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
    <FlexRow>
      <Tooltip title="New workflow" placement="right-start">
        <ToolbarIconButton
          ariaLabel="New workflow"
          onClick={() => void handleCreate()}
          tabIndex={-1}
          icon={<AddIcon />}
        />
      </Tooltip>
      <ToolbarIconButton
        ariaLabel="New Torch workflow"
        tooltip="New Torch workflow"
        onClick={() => setShowTorch(true)}
        icon={<span>T</span>}
      />
      {showTorch && (
        <Suspense fallback={null}>
          <CreateTorchWorkflowDialog
            projectId={projectId}
            onClose={() => setShowTorch(false)}
          />
        </Suspense>
      )}
    </FlexRow>
  );
};

export default memo(CreateWorkflowButton);
