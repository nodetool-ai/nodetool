/**
 * Zustand store for color picker state management.
 * Handles color history, saved swatches, and user palettes.
 */

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
  // Color history (auto-saved, last 20 colors)
  recentColors: string[];
  
  // Custom swatches (user-saved)
  swatches: ColorSwatch[];
  
  // User-created palettes
  palettes: ColorPalette[];
  
  // Saved gradients
  gradients: GradientValue[];
  
  // Current color mode preference
  preferredColorMode: "hex" | "rgb" | "hsl" | "hsb" | "cmyk" | "lab";
  
  // Actions
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
    (set, get) => ({
      recentColors: [],
      swatches: [],
      palettes: [],
      gradients: [],
      preferredColorMode: "hex",

      addRecentColor: (color: string) => {
        set((state) => {
          // Normalize color to lowercase
          const normalizedColor = color.toLowerCase();
          
          // Remove duplicate if exists
          const filtered = state.recentColors.filter(
            (c) => c.toLowerCase() !== normalizedColor
          );
          
          // Add to beginning and limit to max
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
        set((state) => ({
          swatches: state.swatches.map((s) =>
            s.id === id ? { ...s, ...updates } : s
          )
        }));
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
        set((state) => ({
          palettes: state.palettes.map((p) =>
            p.id === id ? { ...p, ...updates } : p
          )
        }));
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

/**
 * Convert gradient to CSS string
 */
export function gradientToCss(gradient: GradientValue): string {
  const stopsStr = gradient.stops
    .sort((a, b) => a.position - b.position)
    .map((stop) => `${stop.color} ${stop.position}%`)
    .join(", ");

  if (gradient.type === "linear") {
    const angle = gradient.angle ?? 180;
    return `linear-gradient(${angle}deg, ${stopsStr})`;
  }
  
  return `radial-gradient(circle, ${stopsStr})`;
}

/**
 * Parse CSS gradient string to GradientValue
 */
export function parseGradientCss(css: string): GradientValue | null {
  const linearMatch = css.match(
    /linear-gradient\s*\(\s*(\d+)deg\s*,\s*(.+)\)/i
  );
  const radialMatch = css.match(
    /radial-gradient\s*\(\s*(?:circle\s*,\s*)?(.+)\)/i
  );

  if (linearMatch) {
    const angle = parseInt(linearMatch[1], 10);
    const stops = parseGradientStops(linearMatch[2]);
    return { type: "linear", angle, stops };
  }

  if (radialMatch) {
    const stops = parseGradientStops(radialMatch[1]);
    return { type: "radial", stops };
  }

  return null;
}

function parseGradientStops(stopsStr: string): GradientStop[] {
  const stops: GradientStop[] = [];
  const regex = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\))\s*(\d+)?%?/g;
  let match;
  const index = 0;
  const matches: Array<{ color: string; position?: string }> = [];

  while ((match = regex.exec(stopsStr)) !== null) {
    matches.push({
      color: match[1],
      position: match[2]
    });
  }

  // Calculate positions for stops without explicit positions
  matches.forEach((m, i) => {
    let position: number;
    if (m.position !== undefined) {
      position = parseInt(m.position, 10);
    } else if (i === 0) {
      position = 0;
    } else if (i === matches.length - 1) {
      position = 100;
    } else {
      // Interpolate position
      position = (i / (matches.length - 1)) * 100;
    }
    stops.push({ color: m.color, position });
  });

  return stops;
}

// Pre-built palettes for user convenience
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
