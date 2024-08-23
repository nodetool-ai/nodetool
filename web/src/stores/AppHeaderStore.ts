import { create } from 'zustand';

interface AppHeaderState {
    helpOpen: boolean;
    welcomeOpen: boolean;
    helpIndex: number;

    setHelpOpen: (open: boolean) => void;
    setWelcomeOpen: (open: boolean) => void;
    setHelpIndex: (index: number) => void;

    handleOpenHelp: () => void;
    handleCloseHelp: () => void;
    handleOpenWelcome: () => void;
    handleCloseWelcome: () => void;
}

export const useAppHeaderStore = create<AppHeaderState>((set, get) => ({
    helpIndex: 0,
    helpOpen: false,
    welcomeOpen: false,
    lastWorkflow: null,
    workflowIsDirty: false,
    statusMessage: '',

    setHelpOpen: (open) => set({ helpOpen: open }),
    setWelcomeOpen: (open) => set({ welcomeOpen: open }),
    setHelpIndex: (index) => set({ helpIndex: index }),

    handleOpenHelp: () => set({ helpOpen: true }),
    handleCloseHelp: () => set({ helpOpen: false }),
    handleOpenWelcome: () => set({ welcomeOpen: true }),
    handleCloseWelcome: () => set({ welcomeOpen: false }),
}));