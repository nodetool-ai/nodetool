/**
 * Builders for authoring document demo casts — cuts the per-cast boilerplate
 * down to the parts that differ, mirroring `../castHelpers.ts` (graph),
 * `../chat/chatCastHelpers.ts` (chat) and `../timeline/timelineCastHelpers.ts`.
 */
import type { Shot, ShotStatus } from "@nodetool-ai/protocol";

import {
  cloneDefaultToolSettings,
  IDENTITY_AFFINE,
  SKETCH_FORMAT_VERSION,
  type Layer,
  type SketchDocument
} from "../../components/sketch/types";
import type { ScriptLine, ScriptSection } from "../../stores/script/ScriptStore";
import type { DocCastEvent } from "./docCastTypes";

/** A timed shallow patch of the document root. */
export const patch = <Doc>(t: number, patch: Partial<Doc>): DocCastEvent<Doc> => ({
  t,
  patch
});

/** Fixed timestamps so a replayed document is byte-identical across renders. */
const EPOCH = new Date(0).toISOString();

// ── Sketch ──────────────────────────────────────────────────────────────────

/** A raster layer with a fixed id; `data` is a PNG data URL or null. */
export const sketchLayer = (
  id: string,
  name: string,
  overrides: Partial<Layer> = {}
): Layer => ({
  id,
  name,
  type: "raster",
  visible: true,
  opacity: 1,
  locked: false,
  alphaLock: false,
  blendMode: "normal",
  data: null,
  transform: { ...IDENTITY_AFFINE },
  contentBounds: { x: 0, y: 0, width: 0, height: 0 },
  effects: [],
  ...overrides
});

export const sketchDocument = (
  width: number,
  height: number,
  layers: Layer[],
  activeLayerId = layers[layers.length - 1]?.id ?? ""
): SketchDocument => ({
  version: SKETCH_FORMAT_VERSION,
  canvas: { width, height, backgroundColor: "#101014" },
  layers,
  activeLayerId,
  maskLayerId: null,
  toolSettings: cloneDefaultToolSettings(),
  metadata: { createdAt: EPOCH, updatedAt: EPOCH }
});

// ── Script ──────────────────────────────────────────────────────────────────

export const scriptLine = (
  id: string,
  speakerId: string,
  text: string,
  overrides: Partial<ScriptLine> = {}
): ScriptLine => ({
  id,
  speakerId,
  text,
  takes: [],
  currentTakeId: null,
  ...overrides
});

export const scriptSection = (
  id: string,
  title: string,
  lines: ScriptLine[]
): ScriptSection => ({ id, title, lines });

// ── Storyboard ──────────────────────────────────────────────────────────────

export const shot = (
  id: string,
  index: number,
  slug: string,
  action: string,
  overrides: Partial<Shot> = {}
): Shot => ({
  type: "shot",
  id,
  index,
  slug,
  action,
  status: "planned" as ShotStatus,
  ...overrides
});
