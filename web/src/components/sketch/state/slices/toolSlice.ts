/**
 * Tool Slice — active tool, per-tool settings, foreground/background colors,
 * color mode, symmetry mode/rays.
 */

import type { StateCreator } from "zustand";
import type { SketchStore } from "../useSketchStore";
import type {
  SketchTool,
  BrushSettings,
  PencilSettings,
  PenPressureSettings,
  EraserSettings,
  ShapeSettings,
  FillSettings,
  BlurSettings,
  GradientSettings,
  CloneStampSettings,
  SelectSettings,
  SegmentSettings,
  ColorMode,
  SymmetryMode,
  SketchDocument
} from "../../types";
import { SYMMETRY_DEFAULT_RAYS } from "../../types";

// ─── Private helpers ────────────────────────────────────────────────────────

const PRESSURE_OPTIONAL_KEYS = [
  "pressureSensitivity",
  "pressureAffects",
  "pressureMinScale",
  "pressureCurve"
] as const;

function stripPressureFromPartial<T extends Record<string, unknown>>(
  partial: Partial<T>
): Partial<T> {
  const next = { ...partial } as Record<string, unknown>;
  for (const k of PRESSURE_OPTIONAL_KEYS) {
    delete next[k];
  }
  return next as Partial<T>;
}

function withUpdatedToolTimestamp(document: SketchDocument): SketchDocument {
  return {
    ...document,
    metadata: {
      ...document.metadata,
      updatedAt: new Date().toISOString()
    }
  };
}

/** Tool colors tied to the foreground swatch follow the new FG after swap. */
function mapForegroundLinkedToolColor(
  color: string,
  oldFg: string,
  oldBg: string
): string {
  return color === oldFg ? oldBg : color;
}

/** Colors that may match either swatch (fill side, gradient end) swap both ways. */
function mapDualWellToolColor(
  color: string,
  oldFg: string,
  oldBg: string
): string {
  if (color === oldFg) {
    return oldBg;
  }
  if (color === oldBg) {
    return oldFg;
  }
  return color;
}

// ─── Slice interface ────────────────────────────────────────────────────────

export interface ToolSlice {
  activeTool: SketchTool;
  setActiveTool: (tool: SketchTool) => void;

  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  setPencilSettings: (settings: Partial<PencilSettings>) => void;
  setPenPressure: (settings: Partial<PenPressureSettings>) => void;
  setEraserSettings: (settings: Partial<EraserSettings>) => void;
  setShapeSettings: (settings: Partial<ShapeSettings>) => void;
  setFillSettings: (settings: Partial<FillSettings>) => void;
  setBlurSettings: (settings: Partial<BlurSettings>) => void;
  setGradientSettings: (settings: Partial<GradientSettings>) => void;
  setCloneStampSettings: (settings: Partial<CloneStampSettings>) => void;
  setSelectSettings: (settings: Partial<SelectSettings>) => void;
  setSegmentSettings: (settings: Partial<SegmentSettings>) => void;

  foregroundColor: string;
  backgroundColor: string;
  setForegroundColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
  swapColors: () => void;
  resetColors: () => void;

  colorMode: ColorMode;
  setColorMode: (mode: ColorMode) => void;

  mirrorX: boolean;
  mirrorY: boolean;
  setMirrorX: (v: boolean) => void;
  setMirrorY: (v: boolean) => void;
  symmetryMode: SymmetryMode;
  symmetryRays: number;
  setSymmetryMode: (mode: SymmetryMode) => void;
  setSymmetryRays: (rays: number) => void;
}

// ─── Slice creator ──────────────────────────────────────────────────────────

export const createToolSlice: StateCreator<SketchStore, [], [], ToolSlice> = (
  set
) => ({
  activeTool: "brush",
  setActiveTool: (tool: SketchTool) => set({ activeTool: tool }),

  setBrushSettings: (settings: Partial<BrushSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          brush: {
            ...state.document.toolSettings.brush,
            ...stripPressureFromPartial(settings)
          }
        }
      })
    })),

  setPencilSettings: (settings: Partial<PencilSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          pencil: {
            ...state.document.toolSettings.pencil,
            ...stripPressureFromPartial(settings)
          }
        }
      })
    })),

  setPenPressure: (settings: Partial<PenPressureSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          penPressure: {
            ...state.document.toolSettings.penPressure,
            ...settings
          }
        }
      })
    })),

  setEraserSettings: (settings: Partial<EraserSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          eraser: { ...state.document.toolSettings.eraser, ...settings }
        }
      })
    })),

  setShapeSettings: (settings: Partial<ShapeSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          shape: { ...state.document.toolSettings.shape, ...settings }
        }
      })
    })),

  setFillSettings: (settings: Partial<FillSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          fill: { ...state.document.toolSettings.fill, ...settings }
        }
      })
    })),

  setBlurSettings: (settings: Partial<BlurSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          blur: { ...state.document.toolSettings.blur, ...settings }
        }
      })
    })),

  setGradientSettings: (settings: Partial<GradientSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          gradient: { ...state.document.toolSettings.gradient, ...settings }
        }
      })
    })),

  setCloneStampSettings: (settings: Partial<CloneStampSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          cloneStamp: {
            ...state.document.toolSettings.cloneStamp,
            ...settings
          }
        }
      })
    })),

  setSelectSettings: (settings: Partial<SelectSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          select: { ...state.document.toolSettings.select, ...settings }
        }
      })
    })),

  setSegmentSettings: (settings: Partial<SegmentSettings>) =>
    set((state) => ({
      document: withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...state.document.toolSettings,
          segment: { ...state.document.toolSettings.segment, ...settings }
        }
      })
    })),

  foregroundColor: "#ffffff",
  backgroundColor: "#000000",
  setForegroundColor: (color: string) => set({ foregroundColor: color }),
  setBackgroundColor: (color: string) => set({ backgroundColor: color }),
  swapColors: () =>
    set((state) => {
      const oldFg = state.foregroundColor;
      const oldBg = state.backgroundColor;
      const ts = state.document.toolSettings;
      const document = withUpdatedToolTimestamp({
        ...state.document,
        toolSettings: {
          ...ts,
          brush: {
            ...ts.brush,
            color: mapForegroundLinkedToolColor(ts.brush.color, oldFg, oldBg)
          },
          pencil: {
            ...ts.pencil,
            color: mapForegroundLinkedToolColor(ts.pencil.color, oldFg, oldBg)
          },
          fill: {
            ...ts.fill,
            color: mapForegroundLinkedToolColor(ts.fill.color, oldFg, oldBg)
          },
          shape: {
            ...ts.shape,
            strokeColor: mapForegroundLinkedToolColor(
              ts.shape.strokeColor,
              oldFg,
              oldBg
            ),
            fillColor: mapDualWellToolColor(ts.shape.fillColor, oldFg, oldBg)
          },
          gradient: {
            ...ts.gradient,
            startColor: mapForegroundLinkedToolColor(
              ts.gradient.startColor,
              oldFg,
              oldBg
            ),
            endColor: mapDualWellToolColor(ts.gradient.endColor, oldFg, oldBg)
          }
        }
      });
      return {
        foregroundColor: oldBg,
        backgroundColor: oldFg,
        document
      };
    }),
  resetColors: () =>
    set({ foregroundColor: "#000000", backgroundColor: "#ffffff" }),

  colorMode: "hex" as ColorMode,
  setColorMode: (mode: ColorMode) => set({ colorMode: mode }),

  mirrorX: false,
  mirrorY: false,
  setMirrorX: (v: boolean) => set({ mirrorX: v }),
  setMirrorY: (v: boolean) => set({ mirrorY: v }),
  symmetryMode: "off" as SymmetryMode,
  symmetryRays: SYMMETRY_DEFAULT_RAYS,
  setSymmetryMode: (mode: SymmetryMode) => {
    set({
      symmetryMode: mode,
      mirrorX: mode === "horizontal" || mode === "dual",
      mirrorY: mode === "vertical" || mode === "dual"
    });
  },
  setSymmetryRays: (rays: number) =>
    set({ symmetryRays: Math.max(2, Math.min(12, rays)) })
});
