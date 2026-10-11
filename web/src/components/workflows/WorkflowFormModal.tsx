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
      title="Workflow settings"
      maxWidth="sm"
      fullWidth
    >
      <WorkflowForm workflow={workflow} availableTags={availableTags} />
    </Dialog>
  );
};

export default WorkflowFormModal;
