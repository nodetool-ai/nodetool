import { create } from "zustand";

interface TorchExecutionState {
  workflowId: string | null;
  open: (workflowId: string) => void;
  close: () => void;
}

export const useTorchExecutionStore = create<TorchExecutionState>((set) => ({
  workflowId: null,
  open: (workflowId) => set({ workflowId }),
  close: () => set({ workflowId: null })
}));
