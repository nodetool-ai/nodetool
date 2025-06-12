export const STORAGE_KEYS = {
  CURRENT_WORKFLOW: "currentWorkflowId",
  OPEN_WORKFLOWS: "openWorkflows"
} as const;

export const getCurrentWorkflow = () =>
  localStorage.getItem(STORAGE_KEYS.CURRENT_WORKFLOW);

export const getOpenWorkflows = (): string[] =>
  JSON.parse(localStorage.getItem(STORAGE_KEYS.OPEN_WORKFLOWS) || "[]");

import { debounce } from "lodash";

export const setCurrentWorkflow = debounce((workflowId: string) => {
  localStorage.setItem(STORAGE_KEYS.CURRENT_WORKFLOW, workflowId);
}, 100);

export const setOpenWorkflows = debounce((workflowIds: string[]) => {
  localStorage.setItem(STORAGE_KEYS.OPEN_WORKFLOWS, JSON.stringify(workflowIds));
}, 100);

export const removeOpenWorkflow = (workflowId: string) => {
  const updated = getOpenWorkflows().filter((id) => id !== workflowId);
  setOpenWorkflows(updated);
};
