import { FC, useCallback } from "react";
import ConfirmDialog from "../dialogs/ConfirmDialog";
import { Workflow, WorkflowAttributes } from "../../stores/ApiTypes";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkflowStore } from "../../stores/WorkflowStore";
import { useNodes, useWorkflowManager } from "../../contexts/NodeContext";
import { useNavigate } from "react-router-dom";

interface WorkflowDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  workflowsToDelete: WorkflowAttributes[];
}

const WorkflowDeleteDialog: FC<WorkflowDeleteDialogProps> = ({
  open,
  onClose,
  workflowsToDelete
}) => {
  const { removeWorkflow, listWorkflows } = useWorkflowManager((state) => ({
    removeWorkflow: state.removeWorkflow,
    listWorkflows: state.listWorkflows
  }));
  const currentWorkflow = useNodes((state) => state.workflow);
  const deleteWorkflow = useWorkflowStore((state) => state.delete);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const handleDelete = useCallback(() => {
    Promise.all(
      workflowsToDelete.map((workflow) => deleteWorkflow(workflow.id))
    )
      .then(() => {
        onClose();
        queryClient.invalidateQueries({ queryKey: ["workflows"] });
        Promise.all(workflowsToDelete.map((w) => removeWorkflow(w.id)));
        // If we delete the current workflow, we need to navigate to the next available workflow
        if (
          currentWorkflow &&
          workflowsToDelete.some((w) => w.id === currentWorkflow.id)
        ) {
          const nextWorkflow = listWorkflows().find(
            (w) => !workflowsToDelete.some((y) => y.id === w.id)
          );
          if (nextWorkflow) {
            navigate(`/editor/${nextWorkflow.id}`);
          } else {
            navigate("/editor");
          }
        }
      })
      .catch((error) => {
        console.error("Error deleting workflows:", error);
      });
  }, [
    deleteWorkflow,
    workflowsToDelete,
    queryClient,
    currentWorkflow,
    listWorkflows,
    navigate
  ]);

  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      onConfirm={handleDelete}
      confirmText="Delete"
      cancelText="Cancel"
      title="Delete Workflows"
      notificationMessage="Workflows deleted"
      notificationType="success"
      content={
        <>
          <p>Are you sure you want to delete the following workflows?</p>
          <ul className="asset-names">
            {workflowsToDelete.map((workflow) => (
              <li key={workflow.id}>{workflow.name}</li>
            ))}
          </ul>
        </>
      }
    />
  );
};

export default WorkflowDeleteDialog;
