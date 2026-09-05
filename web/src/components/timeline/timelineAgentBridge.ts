/**
 * timelineAgentBridge
 *
 * Bridge between the agent tooling layer (the `ui_timeline_*` frontend tools)
 * and the live timeline editor, mirroring `model3DToolBridge` for the 3D editor.
 *
 * Each open {@link TimelineEditor} registers a {@link TimelineAgentHandler}
 * under its sequence id on mount (and clears it on unmount). Tools name the
 * sequence they target, so every open sequence is addressable regardless of
 * which one has focus.
 *
 * The handler carries no op semantics of its own: `applyOp` runs the op through
 * `applyTimelineOp` from `@nodetool-ai/timeline/ops` — the same function the
 * headless eval bridge and mobile run — and writes the document it returns back
 * to the store. Only what a pure function cannot do stays here: starting a
 * generation job and sampling rendered frames.
 */

import type { TimelineOp, TimelineOpResult } from "@nodetool-ai/timeline/ops";

export type TimelineGenerateKind =
  | "text-to-video"
  | "text-to-image"
  | "text-to-audio";

/** The clip shape every op result reports (`serializeClip`). */
export type TimelineClipSummary = Record<string, unknown> & { id: string };

export interface TimelineGenerateOptions {
  kind: TimelineGenerateKind;
  prompt: string;
  /** Target track id; defaults to a sensible track for the media kind. */
  trackId?: string;
  /** Absolute start (ms); defaults to the end of the target track's content. */
  startMs?: number;
  durationMs?: number;
  provider?: string;
  model?: string;
  /** TTS voice for text-to-audio. */
  voice?: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  resolution?: string;
  /** Kick off generation immediately (default true). */
  autoGenerate?: boolean;
}

export interface TimelineGenerateResult {
  clip: TimelineClipSummary;
  /** True when a generation job was dispatched for the new clip. */
  generationStarted: boolean;
  /** Why generation did not start, when applicable. */
  note?: string;
}

export interface TimelineClipFramesOptions {
  /** Absolute timeline timestamps to sample. Defaults to evenly spaced samples. */
  timesMs?: number[];
  /** Number of evenly spaced samples when `timesMs` is omitted. */
  count?: number;
  /** Output JPEG width in pixels. */
  width?: number;
}

export interface TimelineClipFrameNode {
  clipId: string;
  clipName: string;
  /** Requested absolute timeline timestamp in milliseconds. */
  timelineTimeMs: number;
  /** Source-media timestamp in milliseconds after trim/speed mapping. */
  sourceTimeMs: number;
  width: number;
  height: number;
  dataUrl: string;
}

export interface TimelineClipFramesResult {
  clip: TimelineClipSummary;
  frames: TimelineClipFrameNode[];
}

/**
 * What the live {@link TimelineEditor} exposes to the agent tooling layer.
 *
 * `applyOp` covers every op in `TIMELINE_OP_NAMES`; the two other members are
 * the host I/O no pure op can do. A refusal is thrown, so the tool layer
 * reports it the way it reports any other failure.
 */
export interface TimelineAgentHandler {
  /**
   * The sequence the editor has actually loaded, or null while it is still
   * loading. The handler registers on mount, before the document arrives, so
   * `ui_open_document` waits on this rather than on registration.
   */
  getSequenceId: () => string | null;
  applyOp: (op: TimelineOp) => Promise<TimelineOpResult>;
  /** Create the clip through `applyOp`, then start the generation job. */
  generateClip: (
    opts: TimelineGenerateOptions
  ) => Promise<TimelineGenerateResult>;
  /** Re-run generation for a clip whose binding just changed. */
  regenerateClip: (clipId: string) => Promise<void>;
  /** Sample rendered frames from one clip. No document mutation. */
  getClipFrames: (
    target: string,
    opts: TimelineClipFramesOptions
  ) => Promise<TimelineClipFramesResult>;
}

const handlers = new Map<string, TimelineAgentHandler>();

/**
 * Register (or clear, with null) the handler for one open sequence. Every
 * mounted {@link TimelineEditor} registers under its own sequence id, so the
 * ui_timeline_* tools address any open sequence explicitly — focus does not
 * enter into it.
 */
export function setTimelineAgentHandler(
  sequenceId: string,
  next: TimelineAgentHandler | null
): void {
  if (next) handlers.set(sequenceId, next);
  else handlers.delete(sequenceId);
}

export function hasTimelineAgentHandler(sequenceId: string): boolean {
  return handlers.has(sequenceId);
}

export function getTimelineAgentHandler(
  sequenceId: string
): TimelineAgentHandler {
  const handler = handlers.get(sequenceId);
  if (!handler) {
    const open = listOpenTimelineSequenceIds();
    throw new Error(
      `No timeline sequence "${sequenceId}" is open. ` +
        (open.length > 0
          ? `Open sequences: ${open.join(", ")}. `
          : "No timeline sequences are currently open. ") +
        'Call ui_open_document with type "timeline" to open it.'
    );
  }
  return handler;
}

/** Ids of every sequence currently open in a timeline editor. */
export function listOpenTimelineSequenceIds(): string[] {
  return [...handlers.keys()];
}
