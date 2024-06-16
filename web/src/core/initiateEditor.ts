import { useNodeStore } from "../stores/NodeStore";
import { useWorkflowStore } from "../stores/WorkflowStore";

const initiateEditor = async (workflowId: string | undefined) => {
  const getWorkflow = useWorkflowStore.getState().get;
  const getFromCache = useWorkflowStore.getState().getFromCache;
  const setWorkflow = useNodeStore.getState().setWorkflow;

  if (!workflowId) {
    return { workflow: null };
  }
  const cachedWorkflow = getFromCache(workflowId);

  if (cachedWorkflow) {
    setWorkflow(cachedWorkflow);
    return { workflow: cachedWorkflow };
  }

  const workflow = await getWorkflow(workflowId);

  if (workflow) {
    setWorkflow(workflow);
    return { workflow };
  }

  return { workflow: null };
};

export default initiateEditor;
