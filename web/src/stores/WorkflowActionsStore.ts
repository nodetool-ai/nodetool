import { create } from "zustand";
import { Workflow } from "./ApiTypes";

interface WorkflowActionsState {
  onEdit: ((workflow: Workflow) => void) | null;
  onDuplicate: ((event: React.MouseEvent, workflow: Workflow) => void) | null;
  onDelete: ((workflow: Workflow) => void) | null;
  onOpenAsApp: ((workflow: Workflow) => void) | null;
  setActions: (actions: {
    onEdit?: (workflow: Workflow) => void;
    onDuplicate?: (event: React.MouseEvent, workflow: Workflow) => void;
    onDelete?: (workflow: Workflow) => void;
    onOpenAsApp?: (workflow: Workflow) => void;
  }) => void;
  clearActions: () => void;
}

export const useWorkflowActionsStore = create<WorkflowActionsState>((set) => ({
  onEdit: null,
  onDuplicate: null,
  onDelete: null,
  onOpenAsApp: null,
  setActions: (actions) =>
    set({
      onEdit: actions.onEdit ?? null,
      onDuplicate: actions.onDuplicate ?? null,
      onDelete: actions.onDelete ?? null,
      onOpenAsApp: actions.onOpenAsApp ?? null,
    }),
  clearActions: () =>
    set({
      onEdit: null,
      onDuplicate: null,
      onDelete: null,
      onOpenAsApp: null,
    }),
}));

export const useWorkflowActions = () => useWorkflowActionsStore((state) => state);
