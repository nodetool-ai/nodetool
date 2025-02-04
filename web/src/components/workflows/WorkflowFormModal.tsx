import { Dialog, DialogContent } from "@mui/material";
import WorkflowForm from "./WorkflowForm";
import { useCallback } from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { Workflow } from "../../stores/ApiTypes";
import { useNotificationStore } from "../../stores/NotificationStore";

interface WorkflowFormModalProps {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
}

const WorkflowFormModal = ({
  open,
  onClose,
  workflow
}: WorkflowFormModalProps) => {
  const { update } = useWorkflowManager((state) => ({
    update: state.update
  }));
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const handleSave = useCallback(async () => {
    await update(workflow);
    addNotification({
      type: "info",
      alert: true,
      content: "Workflow saved!",
      dismissable: true
    });
    onClose();
  }, [update, onClose, workflow]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogContent sx={{ bgcolor: "background.paper" }}>
        <WorkflowForm onSave={handleSave} workflow={workflow} />
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowFormModal;
