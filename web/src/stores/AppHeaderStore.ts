import { create } from "zustand";

interface AppHeaderState {
  helpOpen: boolean;
  helpIndex: number;
  feedbackOpen: boolean;

  setHelpOpen: (open: boolean) => void;
  setHelpIndex: (index: number) => void;
  setFeedbackOpen: (open: boolean) => void;

  handleOpenHelp: () => void;
  handleCloseHelp: () => void;
  handleOpenFeedback: () => void;
  handleCloseFeedback: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set) => ({
  helpIndex: 0,
  helpOpen: false,
  feedbackOpen: false,

  setHelpOpen: (open) => set({ helpOpen: open }),
  setHelpIndex: (index) => set({ helpIndex: index }),
  setFeedbackOpen: (open) => set({ feedbackOpen: open }),

  handleOpenHelp: () => set({ helpOpen: true }),
  handleCloseHelp: () => set({ helpOpen: false }),
  handleOpenFeedback: () => set({ feedbackOpen: true }),
  handleCloseFeedback: () => set({ feedbackOpen: false })
}));
