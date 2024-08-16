import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type PanelPosition = 'left' | 'right';

interface PanelState {
    size: number;
    isDragging: boolean;
    hasDragged: boolean;
    minWidth: number;
    maxWidth: number;
}

interface ResizePanelState {
    panels: Record<PanelPosition, PanelState>;
    setSize: (position: PanelPosition, newSize: number) => void;
    setIsDragging: (position: PanelPosition, isDragging: boolean) => void;
    setHasDragged: (position: PanelPosition, hasDragged: boolean) => void;
}

export const usePanelStore = create<ResizePanelState>()(
    // persist(
    (set, get) => ({
        panels: {
            left: { size: 300, isDragging: false, hasDragged: false, minWidth: 0, maxWidth: 800 },
            right: { size: 300, isDragging: false, hasDragged: false, minWidth: 10, maxWidth: 1200 },
        },
        orientation: 'horizontal' as const,

        setSize: (position, newSize) => set(state => ({
            panels: {
                ...state.panels,
                [position]: { ...state.panels[position], size: newSize },
            },
        })),

        setIsDragging: (position, isDragging) => set(state => ({
            panels: {
                ...state.panels,
                [position]: { ...state.panels[position], isDragging },
            },
        })),

        setHasDragged: (position, hasDragged) => set(state => ({
            panels: {
                ...state.panels,
                [position]: { ...state.panels[position], hasDragged },
            },
        })),
    }),
    // {
    //     name: 'resize-panel-storage',
    //     partialize: (state) => ({
    //         panels: {
    //             left: { size: state.panels.left.size },
    //             right: { size: state.panels.right.size },
    //         },
    //     }),
    // }
    // )
);