/**
 * Mounts the share dialog wherever a surface can request it via
 * WorkflowShareDialogStore (command menu, workflow list).
 */
import { memo } from "react";
import ShareWorkflowDialog from "./ShareWorkflowDialog";
import { useWorkflowShareDialogStore } from "../../stores/WorkflowShareDialogStore";

const WorkflowShareDialogHost = () => {
  const target = useWorkflowShareDialogStore((state) => state.target);
  const close = useWorkflowShareDialogStore((state) => state.close);

  if (!target) return null;
  return (
    <ShareWorkflowDialog
      open
      onClose={close}
      workflowId={target.workflowId}
      workflowName={target.workflowName}
    />
  );
};

export default memo(WorkflowShareDialogHost);
