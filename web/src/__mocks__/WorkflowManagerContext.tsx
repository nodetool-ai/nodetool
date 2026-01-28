import { createContext } from "react";

export const WorkflowManagerContext = createContext({
  getCurrentWorkflow: () => null,
  getNodeStore: () => null,
});

export const useWorkflowManager = () => {
  return {
    getCurrentWorkflow: () => null,
    getNodeStore: () => null,
  };
};
