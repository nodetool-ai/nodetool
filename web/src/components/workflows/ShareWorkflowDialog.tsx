/**
 * Share dialog for a workflow: the document share dialog with the workflow's
 * public link enabled. See ShareDocumentDialog.
 */
import { memo } from "react";
import ShareDocumentDialog from "../sharing/ShareDocumentDialog";

interface ShareWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  workflowId: string;
  workflowName: string;
}

const ShareWorkflowDialog = ({
  open,
  onClose,
  workflowId,
  workflowName
}: ShareWorkflowDialogProps) => (
  <ShareDocumentDialog
    open={open}
    onClose={onClose}
    target={{ type: "workflow", id: workflowId, name: workflowName }}
  />
);

export default memo(ShareWorkflowDialog);
