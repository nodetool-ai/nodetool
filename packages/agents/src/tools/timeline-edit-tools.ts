/**
 * Timeline edit tool — cut a saved sequence without a browser.
 *
 * Every structural edit the timeline surface offers lived behind the
 * `ui_timeline_*` tools, which only work while that sequence is open in a
 * browser: the call round-trips over the WebSocket into the editor's Zustand
 * stores. An agent working headlessly (chat, CLI, MCP) could read a cut and
 * roll it back through the version tools, but not change one.
 *
 * `edit_timeline` applies the same operations to the persisted row. It runs
 * them against the headless bridge the `timeline-tools` eval and
 * `nodetool timeline debug --interact` already drive — the one that reuses the
 * real `splitClip` / `ANIMATION_PRESETS` / `makeClip` logic from
 * `@nodetool-ai/timeline` — then compare-and-swaps the resulting document back
 * onto the row. The editor picks the change up over `resource_change`.
 *
 * Two `ui_timeline_*` tools are deliberately absent: `get_clip_frames` needs
 * rendered video and `generate_clip` starts a render job the browser drives.
 * Generation headlessly is `render_storyboard_clips` or a workflow run; this
 * tool authors the cut.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { TimelineSequence } from "@nodetool-ai/models";
import type { TimelineDocument } from "@nodetool-ai/models";
import { Tool } from "./base-tool.js";
import {
  createTimelineToolBridge,
  type TimelineBridgeFinalState
} from "../evals/surfaces/timeline.js";

/** Attempts to land the document write before reporting a conflict. */
const CAS_ATTEMPTS = 5;
/** Operations one call may apply, so a runaway script cannot rewrite a cut. */
const MAX_OPS = 60;

const TOOL_PREFIX = "ui_timeline_";

/** Tools the bridge exposes that this surface must not offer headlessly. */
const EXCLUDED_OPS = new Set([
  `${TOOL_PREFIX}get_clip_frames`,
  `${TOOL_PREFIX}generate_clip`
]);

type ToolError = { error: string };

const isError = (value: unknown): value is ToolError =>
  !!value &&
  typeof value === "object" &&
  typeof (value as ToolError).error === "string";

/** `add_track`, `ui_add_track`, and `ui_timeline_add_track` all name one tool. */
function normalizeOpName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.startsWith(TOOL_PREFIX)) return trimmed;
  const bare = trimmed.startsWith("ui_") ? trimmed.slice("ui_".length) : trimmed;
  return `${TOOL_PREFIX}${bare}`;
}

interface ParsedOp {
  op: string;
  input: Record<string, unknown>;
}

/** An op is `{op, ...args}` — the arguments sit alongside the verb. */
function parseOps(raw: unknown): ParsedOp[] | ToolError {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      error:
        'ops must be a non-empty array, e.g. [{"op": "add_track", "type": "audio"}].'
    };
  }
  if (raw.length > MAX_OPS) {
    return { error: `ops holds ${raw.length} entries; at most ${MAX_OPS} per call.` };
  }
  const parsed: ParsedOp[] = [];
  for (const [index, entry] of raw.entries()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { error: `ops[${index}] must be an object.` };
    }
    const { op, ...input } = entry as Record<string, unknown>;
    if (typeof op !== "string" || op.trim() === "") {
      return { error: `ops[${index}] has no \`op\` name.` };
    }
    parsed.push({ op: normalizeOpName(op), input });
  }
  return parsed;
}

interface OpRecord {
  op: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

interface ApplyOutcome {
  records: OpRecord[];
  state: TimelineBridgeFinalState;
}

/**
 * Run `ops` against a bridge seeded from `document`.
 *
 * A failing op is recorded and the script continues: stopping at the first
 * error hides every problem behind it, and the caller wants the whole picture.
 */
async function applyOps(
  sequence: TimelineSequence,
  document: TimelineDocument,
  ops: ParsedOp[]
): Promise<ApplyOutcome> {
  const bridge = createTimelineToolBridge({
    sequence: {
      fps: sequence.fps,
      width: sequence.width,
      height: sequence.height,
      tracks: document.tracks,
      clips: document.clips
    }
  });
  const byName = new Map(
    bridge.tools
      .filter((tool) => !EXCLUDED_OPS.has(tool.name))
      .map((tool) => [tool.name, tool])
  );

  const records: OpRecord[] = [];
  for (const { op, input } of ops) {
    const tool = byName.get(op);
    if (!tool) {
      const known = [...byName.keys()]
        .map((name) => name.slice(TOOL_PREFIX.length))
        .sort()
        .join(", ");
      records.push({
        op,
        ok: false,
        error: `No timeline operation named "${op.slice(TOOL_PREFIX.length)}". Available: ${known}.`
      });
      continue;
    }
    try {
      records.push({ op, ok: true, result: await tool.execute(input) });
    } catch (e) {
      records.push({ op, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { records, state: bridge.finalState() };
}

export class EditTimelineTool extends Tool {
  readonly name = "edit_timeline";
  readonly description =
    "Edit a saved timeline sequence headlessly: add tracks, add text and " +
    "shape clips, split, trim, move, duplicate and delete clips, set clip " +
    "params and workflow bindings, and animate clips with presets. Pass a " +
    "list of operations; they run in order against the stored document and " +
    "the result is saved. An open editor picks the change up live. Call " +
    "list_timelines to find a sequence and validate_timeline afterwards. " +
    "Use render_storyboard_clips or a workflow run to generate media — this " +
    "tool authors the cut, it does not render.";
  readonly jsonSchema = {
    type: "object" as const,
    properties: {
      timeline_id: { type: "string" as const, description: "Timeline sequence id." },
      ops: {
        type: "array" as const,
        description:
          'Operations in order. Each is {"op": <name>, ...arguments}, e.g. ' +
          '{"op": "add_track", "type": "audio", "name": "Music"} or ' +
          '{"op": "animate_clip", "target": "Title", "animations": [{"role": "in", "preset": "fade"}]}. ' +
          "Ops: get_state, add_track, add_text_clip, add_shape_clip, " +
          "split_clip, trim_clip, move_clip, duplicate_clip, delete_clip, " +
          "set_clip_params, set_clip_binding, animate_clip, clear_animations, " +
          "list_animation_presets, select_clip, seek. Start with get_state to " +
          "read track and clip ids.",
        items: { type: "object" as const }
      }
    },
    required: ["timeline_id", "ops"]
  };

  async process(
    context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    const timelineId = params["timeline_id"];
    if (typeof timelineId !== "string" || !timelineId) {
      return { error: "timeline_id is required (use list_timelines to find one)." };
    }
    const ops = parseOps(params["ops"]);
    if (isError(ops)) return ops;

    for (let attempt = 0; attempt < CAS_ATTEMPTS; attempt++) {
      const sequence = await TimelineSequence.findById(timelineId);
      // A sequence owned by someone else reads as missing — the rule the tRPC
      // router's ownership check applies.
      if (!sequence || sequence.user_id !== context.userId) {
        return { error: `Timeline ${timelineId} was not found.` };
      }
      const document = sequence.toDocument();
      const { records, state } = await applyOps(sequence, document, ops);

      // Markers and the transcript ride along untouched: no timeline operation
      // edits them, so the stored copies stay authoritative.
      const next: TimelineDocument = {
        ...document,
        tracks: state.documentTracks,
        clips: state.documentClips
      };
      const saved = await TimelineSequence.updateDocumentIfUnchanged(
        timelineId,
        sequence.updated_at,
        next
      );
      if (!saved) continue;

      const failed = records.filter((record) => !record.ok);
      return {
        timeline_id: timelineId,
        updated_at: saved.updated_at,
        applied: records.length - failed.length,
        failed: failed.length,
        ops: records,
        tracks: state.tracks,
        clips: state.clips.map((clip) => ({
          id: clip.id,
          name: clip.name,
          track_id: clip.trackId,
          media_type: clip.mediaType,
          start_ms: clip.startMs,
          duration_ms: clip.durationMs,
          animations: clip.animations
        }))
      };
    }

    return {
      error: `Timeline ${timelineId} is being modified concurrently; nothing was saved. Retry the call.`
    };
  }

  userMessage(params: Record<string, unknown>): string {
    const count = Array.isArray(params["ops"]) ? params["ops"].length : 0;
    return `Editing timeline ${String(params["timeline_id"])} (${count} ops)`;
  }
}
