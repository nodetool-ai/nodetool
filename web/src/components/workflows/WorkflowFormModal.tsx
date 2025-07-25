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
  return (
    <Dialog
      className="workflow-form-modal"
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogContent sx={{ bgcolor: "background.paper" }}>
        <WorkflowForm onClose={onClose} workflow={workflow} />
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowFormModal;
