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
  MoveSettings,
  TransformSettings,
  ToolSettings,
  ColorMode,
  SymmetryMode
} from "../../types";
import { SYMMETRY_DEFAULT_RAYS, cloneDefaultToolSettings } from "../../types";

// ─── Private helpers ─────────────────────────────────────────────────────────

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

  /**
   * Live tool settings — the runtime source of truth.
   * Stored separately from `document` so that brush/color changes do not
   * mutate the document object and do not trigger document re-renders.
   */
  toolSettings: ToolSettings;

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
  setMoveSettings: (settings: Partial<MoveSettings>) => void;
  setTransformSettings: (settings: Partial<TransformSettings>) => void;

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
  activeTool: "select",
  setActiveTool: (tool: SketchTool) => set({ activeTool: tool }),

  // Runtime source of truth for tool settings — NOT inside `document` so that
  // brush/color changes do not mutate the document object and do not trigger
  // the expensive document re-render cascade (compositing, autosave, etc.).
  toolSettings: cloneDefaultToolSettings(),

  setBrushSettings: (settings: Partial<BrushSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        brush: { ...state.toolSettings.brush, ...stripPressureFromPartial(settings) }
      }
    })),

  setPencilSettings: (settings: Partial<PencilSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        pencil: { ...state.toolSettings.pencil, ...stripPressureFromPartial(settings) }
      }
    })),

  setPenPressure: (settings: Partial<PenPressureSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        penPressure: { ...state.toolSettings.penPressure, ...settings }
      }
    })),

  setEraserSettings: (settings: Partial<EraserSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        eraser: { ...state.toolSettings.eraser, ...settings }
      }
    })),

  setShapeSettings: (settings: Partial<ShapeSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        shape: { ...state.toolSettings.shape, ...settings }
      }
    })),

  setFillSettings: (settings: Partial<FillSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        fill: { ...state.toolSettings.fill, ...settings }
      }
    })),

  setBlurSettings: (settings: Partial<BlurSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        blur: { ...state.toolSettings.blur, ...settings }
      }
    })),

  setGradientSettings: (settings: Partial<GradientSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        gradient: { ...state.toolSettings.gradient, ...settings }
      }
    })),

  setCloneStampSettings: (settings: Partial<CloneStampSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        cloneStamp: { ...state.toolSettings.cloneStamp, ...settings }
      }
    })),

  setSelectSettings: (settings: Partial<SelectSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        select: { ...state.toolSettings.select, ...settings }
      }
    })),

  setSegmentSettings: (settings: Partial<SegmentSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        segment: { ...state.toolSettings.segment, ...settings }
      }
    })),

  setMoveSettings: (settings: Partial<MoveSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        move: { ...state.toolSettings.move, ...settings }
      }
    })),

  setTransformSettings: (settings: Partial<TransformSettings>) =>
    set((state) => ({
      toolSettings: {
        ...state.toolSettings,
        transform: { ...state.toolSettings.transform, ...settings }
      }
    })),

  foregroundColor: "#ffffff",
  backgroundColor: "#000000",
  setForegroundColor: (color: string) => set({ foregroundColor: color }),
  setBackgroundColor: (color: string) => set({ backgroundColor: color }),
  swapColors: () =>
    set((state) => {
      const oldFg = state.foregroundColor;
      const oldBg = state.backgroundColor;
      const ts = state.toolSettings;
      return {
        foregroundColor: oldBg,
        backgroundColor: oldFg,
        toolSettings: {
          ...ts,
          brush: { ...ts.brush, color: mapForegroundLinkedToolColor(ts.brush.color, oldFg, oldBg) },
          pencil: { ...ts.pencil, color: mapForegroundLinkedToolColor(ts.pencil.color, oldFg, oldBg) },
          fill: { ...ts.fill, color: mapForegroundLinkedToolColor(ts.fill.color, oldFg, oldBg) },
          shape: {
            ...ts.shape,
            strokeColor: mapForegroundLinkedToolColor(ts.shape.strokeColor, oldFg, oldBg),
            fillColor: mapDualWellToolColor(ts.shape.fillColor, oldFg, oldBg)
          },
          gradient: {
            ...ts.gradient,
            startColor: mapForegroundLinkedToolColor(ts.gradient.startColor, oldFg, oldBg),
            endColor: mapDualWellToolColor(ts.gradient.endColor, oldFg, oldBg)
          }
        }
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
