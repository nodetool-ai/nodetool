import { useCallback } from "react";

import { useNodeStoreRef } from "../../contexts/NodeContext";
import { useAutosave } from "../../hooks/useAutosave";

/**
 * Headless mount for a workflow's autosave. Activates the interval autosave
 * and save-on-close behaviors (driven by Settings → Autosave) for the workflow
 * owned by the surrounding NodeContext. Renders nothing.
 *
 * Run-start autosave is handled separately in useFloatingToolbarActions, where
 * the run is triggered.
 */
const WorkflowAutosave = ({ workflowId }: { workflowId: string }) => {
  const nodeStore = useNodeStoreRef();

  const getWorkflow = useCallback(
    () => nodeStore.getState().getWorkflow(),
    [nodeStore]
  );
  const isDirty = useCallback(
    () => nodeStore.getState().workflowIsDirty,
    [nodeStore]
  );

  useAutosave({ workflowId, getWorkflow, isDirty });

  return null;
};

export default WorkflowAutosave;
