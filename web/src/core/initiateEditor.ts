import { NodeData } from "../stores/NodeData";
import { useNodeStore } from "../stores/NodeStore";
import { useWorkflowStore } from "../stores/WorkflowStore";

const initiateEditor = async (workflowId: string | undefined) => {
  const getWorkflow = useWorkflowStore.getState().get;
  const getFromCache = useWorkflowStore.getState().getFromCache;
  const currentWorkflow = useNodeStore.getState().workflow;
  const syncWorkflow = useNodeStore.getState().syncWithWorkflowStore;
  const setWorkflow = useNodeStore.getState().setWorkflow;

  if (!workflowId) {
    return { workflow: null };
  }

  if (currentWorkflow) {
    // Check if the current workflow is the same as the one we are trying to load
    if (currentWorkflow.id === workflowId) {
      return { workflow: currentWorkflow };
    } else {
      // Save current workflow before switching
      syncWorkflow();
    }
  }

  // Check if workflow is in cache of hte workflow store
  let workflow = getFromCache(workflowId);

  // load the workflow from the server
  if (!workflow) {
    workflow = await getWorkflow(workflowId);
  }

  if (workflow) {
    setWorkflow(workflow);
  }

  return { workflow };
};

export default initiateEditor;
