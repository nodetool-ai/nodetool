import { useNodeStore } from "../stores/NodeStore";
import { useWorkflowStore } from "../stores/WorkflowStore";

const initiateEditor = async (workflowId: string | undefined) => {
  const getWorkflow = useWorkflowStore.getState().get;
  const getFromCache = useWorkflowStore.getState().getFromCache;
  const currentWorkflow = useNodeStore.getState().workflow;
  const syncWorkflow = useNodeStore.getState().syncWithWorkflowStore;
  const setWorkflow = useNodeStore.getState().setWorkflow;

  console.log("load workflowId", workflowId);

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
  const cachedWorkflow = getFromCache(workflowId);

  if (cachedWorkflow) {
    setWorkflow(cachedWorkflow);
    return { workflow: cachedWorkflow };
  }

  // load the workflow from the server
  const workflow = await getWorkflow(workflowId);

  if (workflow) {
    setWorkflow(workflow);
    return { workflow };
  }

  return { workflow: null };
};

export default initiateEditor;
