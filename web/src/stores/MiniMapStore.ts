import { create } from "zustand";

interface MiniMapState {
  visible: boolean;
  zoomLevel: number;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
  setZoomLevel: (level: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.1;
const DEFAULT_ZOOM = 1;

export const useMiniMapStore = create<MiniMapState>((set, get) => ({
  visible: false,
  zoomLevel: DEFAULT_ZOOM,
  setVisible: (visible: boolean) => set({ visible }),
  toggleVisible: () => set((state) => ({ visible: !state.visible })),
  setZoomLevel: (zoomLevel: number) => {
    const clamped = Math.min(Math.max(zoomLevel, MIN_ZOOM), MAX_ZOOM);
    set({ zoomLevel: clamped });
  },
  zoomIn: () => {
    const { zoomLevel } = get();
    const newLevel = Math.min(zoomLevel + ZOOM_STEP, MAX_ZOOM);
    set({ zoomLevel: newLevel });
  },
  zoomOut: () => {
    const { zoomLevel } = get();
    const newLevel = Math.max(zoomLevel - ZOOM_STEP, MIN_ZOOM);
    set({ zoomLevel: newLevel });
  },
  resetZoom: () => set({ zoomLevel: DEFAULT_ZOOM })
}));
