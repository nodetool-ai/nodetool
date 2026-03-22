import { DialogContent } from "@mui/material";
import WorkflowForm from "./WorkflowForm";
import { Workflow } from "../../stores/ApiTypes";
import { Dialog } from "../ui_primitives";

interface WorkflowFormModalProps {
  open: boolean;
  onClose: () => void;
  workflow: Workflow;
  availableTags?: string[];
}

const WorkflowFormModal = ({
  open,
  onClose,
  workflow,
  availableTags
}: WorkflowFormModalProps) => {
  return (
    <Dialog
      className="workflow-form-modal"
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogContent sx={{ bgcolor: "background.paper", p: 0 }}>
        <WorkflowForm onClose={onClose} workflow={workflow} availableTags={availableTags} />
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowFormModal;
