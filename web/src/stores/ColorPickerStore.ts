import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ColorSwatch {
  id: string;
  name?: string;
  color: string;
  createdAt: number;
}

export interface ColorPalette {
  id: string;
  name: string;
  colors: string[];
  createdAt: number;
}

export interface GradientStop {
  color: string;
  position: number; // 0-100
}

export interface GradientValue {
  type: "linear" | "radial";
  angle?: number; // for linear gradients (0-360)
  stops: GradientStop[];
}

interface ColorPickerState {
  recentColors: string[];
  swatches: ColorSwatch[];
  palettes: ColorPalette[];
  gradients: GradientValue[];
  preferredColorMode: "hex" | "rgb" | "hsl" | "hsb" | "cmyk" | "lab";

  addRecentColor: (color: string) => void;
  clearRecentColors: () => void;
  
  addSwatch: (color: string, name?: string) => void;
  removeSwatch: (id: string) => void;
  updateSwatch: (id: string, updates: Partial<ColorSwatch>) => void;
  clearSwatches: () => void;
  
  addPalette: (name: string, colors: string[]) => void;
  removePalette: (id: string) => void;
  updatePalette: (id: string, updates: Partial<ColorPalette>) => void;
  
  addGradient: (gradient: GradientValue) => void;
  removeGradient: (index: number) => void;
  
  setPreferredColorMode: (mode: ColorPickerState["preferredColorMode"]) => void;
}

const MAX_RECENT_COLORS = 20;
const generateId = () => Math.random().toString(36).substring(2, 9);

export const useColorPickerStore = create<ColorPickerState>()(
  persist(
    (set) => ({
      recentColors: [],
      swatches: [],
      palettes: [],
      gradients: [],
      preferredColorMode: "hex",

      addRecentColor: (color: string) => {
        set((state) => {
          const normalizedColor = color.toLowerCase();
          const filtered = state.recentColors.filter(
            (c) => c.toLowerCase() !== normalizedColor
          );
          const updated = [normalizedColor, ...filtered].slice(0, MAX_RECENT_COLORS);
          return { recentColors: updated };
        });
      },

      clearRecentColors: () => {
        set({ recentColors: [] });
      },

      addSwatch: (color: string, name?: string) => {
        const newSwatch: ColorSwatch = {
          id: generateId(),
          color: color.toLowerCase(),
          name,
          createdAt: Date.now()
        };
        
        set((state) => ({
          swatches: [...state.swatches, newSwatch]
        }));
      },

      removeSwatch: (id: string) => {
        set((state) => ({
          swatches: state.swatches.filter((s) => s.id !== id)
        }));
      },

      updateSwatch: (id: string, updates: Partial<ColorSwatch>) => {
        set((state) => {
          const index = state.swatches.findIndex((s) => s.id === id);
          if (index === -1) return state;

          const newSwatches = [...state.swatches];
          newSwatches[index] = { ...newSwatches[index], ...updates };

          return { swatches: newSwatches };
        });
      },

      clearSwatches: () => {
        set({ swatches: [] });
      },

      addPalette: (name: string, colors: string[]) => {
        const newPalette: ColorPalette = {
          id: generateId(),
          name,
          colors: colors.map((c) => c.toLowerCase()),
          createdAt: Date.now()
        };
        
        set((state) => ({
          palettes: [...state.palettes, newPalette]
        }));
      },

      removePalette: (id: string) => {
        set((state) => ({
          palettes: state.palettes.filter((p) => p.id !== id)
        }));
      },

      updatePalette: (id: string, updates: Partial<ColorPalette>) => {
        set((state) => {
          const index = state.palettes.findIndex((p) => p.id === id);
          if (index === -1) return state;

          const newPalettes = [...state.palettes];
          newPalettes[index] = { ...newPalettes[index], ...updates };

          return { palettes: newPalettes };
        });
      },

      addGradient: (gradient: GradientValue) => {
        set((state) => ({
          gradients: [...state.gradients, gradient]
        }));
      },

      removeGradient: (index: number) => {
        set((state) => ({
          gradients: state.gradients.filter((_, i) => i !== index)
        }));
      },

      setPreferredColorMode: (mode) => {
        set({ preferredColorMode: mode });
      }
    }),
    {
      name: "color-picker-storage",
      partialize: (state) => ({
        recentColors: state.recentColors,
        swatches: state.swatches,
        palettes: state.palettes,
        gradients: state.gradients,
        preferredColorMode: state.preferredColorMode
      })
    }
  )
);

export function gradientToCss(gradient: GradientValue): string {
  // Copy before sorting — `.sort()` mutates in place and `gradient` may be a
  // persisted store object that must not be modified.
  const stopsStr = [...gradient.stops]
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  if (gradient.type === "linear") {
    const angle = gradient.angle ?? 180;
    return `linear-gradient(${angle}deg, ${stopsStr})`;
  }
  
  return `radial-gradient(circle, ${stopsStr})`;
}

export const PRESET_PALETTES: ColorPalette[] = [
  {
    id: "material-primary",
    name: "Material Primary",
    colors: [
      "#f44336", "#e91e63", "#9c27b0", "#673ab7", "#3f51b5",
      "#2196f3", "#03a9f4", "#00bcd4", "#009688", "#4caf50",
      "#8bc34a", "#cddc39", "#ffeb3b", "#ffc107", "#ff9800", "#ff5722"
    ],
    createdAt: 0
  },
  {
    id: "tailwind",
    name: "Tailwind Colors",
    colors: [
      "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
      "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
      "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899"
    ],
    createdAt: 0
  },
  {
    id: "pastel",
    name: "Pastel Colors",
    colors: [
      "#ffd1dc", "#ffb3ba", "#ffdfba", "#ffffba", "#baffc9",
      "#bae1ff", "#e0bbff", "#ffc8dd", "#bde0fe", "#a2d2ff"
    ],
    createdAt: 0
  },
  {
    id: "earth-tones",
    name: "Earth Tones",
    colors: [
      "#8b4513", "#a0522d", "#cd853f", "#d2691e", "#deb887",
      "#f4a460", "#bc8f8f", "#d2b48c", "#c4a35a", "#966919"
    ],
    createdAt: 0
  },
  {
    id: "grayscale",
    name: "Grayscale",
    colors: [
      "#000000", "#1a1a1a", "#333333", "#4d4d4d", "#666666",
      "#808080", "#999999", "#b3b3b3", "#cccccc", "#e6e6e6", "#ffffff"
    ],
    createdAt: 0
  }
];
