import { FC, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { WorkflowAttributes } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Dialog } from "../ui_primitives";

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
  const { removeWorkflow, openWorkflows } = useWorkflowManager(
    useShallow((state) => ({
      removeWorkflow: state.removeWorkflow,
      openWorkflows: state.openWorkflows
    }))
  );
  const currentWorkflowId = useWorkflowManager(
    (state) => state.currentWorkflowId
  );
  const deleteWorkflow = useWorkflowManager((state) => state.delete);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  useEffect(() => {
    if (open) {
      setDeletedIds([]);
    }
  }, [open, workflowsToDelete]);
  const deletedIdSet = new Set(deletedIds);
  const pendingWorkflows = workflowsToDelete.filter(
    (workflow) => !deletedIdSet.has(workflow.id)
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const addNotification = useNotificationStore((state) => state.addNotification);
  const handleClose = useCallback(() => {
    if (!isDeleting) {
      onClose();
    }
  }, [isDeleting, onClose]);
  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const results = await Promise.allSettled(
        pendingWorkflows.map(async (workflow) => {
          await deleteWorkflow({ ...workflow, graph: { nodes: [], edges: [] } });
          removeWorkflow(workflow.id);
          return workflow.id;
        })
      );
      const succeeded = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      );
      const deletedAfterAttempt = new Set([...deletedIds, ...succeeded]);
      setDeletedIds((ids) => [...ids, ...succeeded]);
      await queryClient.invalidateQueries({ queryKey: ["workflows"] });
      if (currentWorkflowId && deletedAfterAttempt.has(currentWorkflowId)) {
        const nextWorkflow = openWorkflows.find(
          (workflow) => !deletedAfterAttempt.has(workflow.id)
        );
        navigate(nextWorkflow ? `/editor/${nextWorkflow.id}` : "/editor");
      }
      const failure = results.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") {
        throw failure.reason;
      }
      addNotification({ content: "Workflows deleted", type: "success" });
      onClose();
    } catch (error) {
      addNotification({
        content: `Failed to delete workflows: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
        alert: true
      });
    } finally {
      setIsDeleting(false);
    }
  }, [
    deleteWorkflow,
    pendingWorkflows,
    deletedIds,
    queryClient,
    currentWorkflowId,
    openWorkflows,
    navigate,
    onClose,
    removeWorkflow,
    addNotification
  ]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onCancel={handleClose}
      isLoading={isDeleting}
      cancelDisabled={isDeleting}
      showCloseButton={!isDeleting}
      destructive
      onConfirm={handleDelete}
      confirmText="Delete"
      cancelText="Cancel"
      title="Delete Workflows"
      content={
        <>
          <p>Are you sure you want to delete the following workflows?</p>
          <ul className="asset-names">
            {pendingWorkflows.map((workflow) => (
              <li key={workflow.id}>{workflow.name}</li>
            ))}
          </ul>
        </>
      }
    />
  );
};

export default WorkflowDeleteDialog;
