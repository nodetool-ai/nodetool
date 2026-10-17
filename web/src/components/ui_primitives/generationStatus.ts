/**
 * The one mapping from a generated item's state (a sketch layer, a timeline
 * clip, a storyboard shot) to the status primitives. `StatusIndicator` reads
 * `status`, `StatusPill` reads `pill` and `StatusDot` reads `dot`, so the same
 * state has the same colour whichever of the three a surface draws.
 */

import type { StatusDotTone } from "./StatusDot";
import type { StatusType } from "./StatusIndicator";
import type { StatusPillTone } from "./StatusPill";

/** Shared by `LayerStatus` (image-editor) and `ClipStatus` (timeline). */
export type GenerationStatus =
  | "draft"
  | "queued"
  | "generating"
  | "generated"
  | "stale"
  | "failed"
  | "locked"
  | "missing";

export interface GenerationStatusVisual {
  status: StatusType;
  pill: StatusPillTone;
  dot: StatusDotTone;
  label: string;
  pulse: boolean;
}

export const GENERATION_STATUS = {
  draft: { status: "default", pill: "neutral", dot: "neutral", label: "Draft", pulse: false },
  queued: { status: "pending", pill: "neutral", dot: "neutral", label: "Queued", pulse: false },
  generating: { status: "running", pill: "rendering", dot: "primary", label: "Generating", pulse: true },
  generated: { status: "success", pill: "done", dot: "success", label: "Generated", pulse: false },
  stale: { status: "warning", pill: "warning", dot: "warning", label: "Stale", pulse: false },
  failed: { status: "error", pill: "failed", dot: "error", label: "Failed", pulse: false },
  locked: { status: "info", pill: "neutral", dot: "info", label: "Locked", pulse: false },
  missing: { status: "error", pill: "failed", dot: "error", label: "Missing", pulse: false }
} as const satisfies Record<GenerationStatus, GenerationStatusVisual>;
