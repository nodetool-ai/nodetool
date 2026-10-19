import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  return (
    <Dialog
      className="workflow-form-modal"
      open={open}
      onClose={onClose}
      title={t("pass3_37.workflowFormModal.title")}
      maxWidth="sm"
      fullWidth
    >
      <WorkflowForm workflow={workflow} availableTags={availableTags} />
    </Dialog>
  );
};

export default WorkflowFormModal;
