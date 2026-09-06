import { z } from "zod";
import {
  ANIMATED_PROPERTIES,
  ANIMATION_PRESETS,
  CUSTOM_ANIMATION_CONTRACT,
  DEFAULT_BEAT_TOLERANCE_MS,
  STAGGER_UNITS,
  beatCountToCover,
  buildBeatGrid,
  snapClipsToGrid,
  type ClipSnapResult,
  type SnapBoundaryMode,
  type SnapAction
} from "@nodetool-ai/timeline";
import {
  resolveDeleteTrackArgs,
  resolveMoveTrackArgs,
  resolveShapeArg,
  targetParam,
  textStylePatchParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import {
  buildTimelineToolContracts,
  liftCustomAnimation,
  rejectUnknownClipParams,
  type TimelineToolArgs,
  type TimelineToolName
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { FrontendToolRegistry } from "../frontendTools";
import {
  getTimelineAgentHandler,
  type ClipAnimationInput,
  type TimelineAgentHandler,
  type TimelineClipNode,
  type TimelineMarkerNode
} from "../../../components/timeline/timelineAgentBridge";
import { docUrl } from "./resourceLinks";

/**
 * Frontend tools that let the agent drive the live timeline / video editor —
 * cutting, arranging, generating, and tweaking clips like a real editor.
 *
 * They delegate to the handler each open {@link TimelineEditor} registers under
 * its sequence id on the {@link timelineAgentBridge}. When no editor is open for
 * the requested id, `getTimelineAgentHandler` throws a descriptive error listing
 * the ids that are open, which the tool layer surfaces back to the agent.
 *
 * Conventions:
 *   - Every tool names its target sequence via `timeline_id` — there is no
 *     implicit "current" timeline.
 *   - Times are in **milliseconds** on the sequence timeline.
 *   - Clips and tracks are addressed by id or by (case-insensitive) name; the
 *     literal `"selected"` resolves to the single selected clip.
 *   - Call `ui_timeline_get_state` first to discover the ids the other tools
 *     need.
 */

const timelineIdParam = z
  .string()
  .describe(
    "Id of the target timeline sequence. The ids of the sequences currently open are listed in the ui_context block of the system prompt."
  );

/**
 * The `ui_timeline_*` contracts, shared with the headless eval bridge
 * (`packages/agents/src/evals/surfaces/timeline.ts`). The vocabulary comes from
 * `@nodetool-ai/timeline`, which the protocol package sits below.
 */
const TIMELINE_CONTRACTS = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

/**
 * The name, description and parameters of one shared tool: the contract's own
 * fields plus the browser's `timeline_id` — the one field the headless bridge
 * has no use for, since it drives a single implicit sequence.
 */
interface SharedTimelineTool<K extends TimelineToolName> {
  name: K;
  description: string;
  parameters: z.ZodType<TimelineToolArgs<K> & { timeline_id: string }>;
}

/**
 * `uiToolParams` answers `z.ZodType` because a contract's `finalize` may close
 * or reopen the object, so the cast names the argument type its shape already
 * fixes — which is what `execute` destructures.
 */
const shared = <K extends TimelineToolName>(
  name: K
): SharedTimelineTool<K> => ({
  name,
  description: TIMELINE_CONTRACTS[name].description,
  parameters: uiToolParams(TIMELINE_CONTRACTS[name], {
    timeline_id: timelineIdParam
  }) as unknown as SharedTimelineTool<K>["parameters"]
});

/**
 * The same, for an op that reads a static catalog and so names no sequence —
 * it answers with no editor open, which is what its own test asserts.
 */
const sharedWithoutSequence = <K extends TimelineToolName>(name: K) => ({
  name,
  description: TIMELINE_CONTRACTS[name].description,
  parameters: uiToolParams(TIMELINE_CONTRACTS[name])
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_get_state"),
  async execute({ timeline_id }) {
    const snapshot = getTimelineAgentHandler(timeline_id).getSnapshot();
    return { ok: true, ...snapshot };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_track"),
  async execute({ timeline_id, type, name }) {
    const track = getTimelineAgentHandler(timeline_id).addTrack(type, name);
    return { ok: true, track, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_move_track"),
  async execute({ timeline_id, ...rest }) {
    const { target, toIndex, before, after } = resolveMoveTrackArgs(rest);
    const tracks = getTimelineAgentHandler(timeline_id).moveTrack(target, {
      toIndex,
      before,
      after
    });
    return { ok: true, tracks, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_track"),
  async execute({ timeline_id, ...rest }) {
    const { target, deleteClips } = resolveDeleteTrackArgs(rest);
    const result = getTimelineAgentHandler(timeline_id).deleteTrack(
      target,
      deleteClips
    );
    return { ok: true, ...result, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_media_clip"),
  async execute({ timeline_id, ...args }) {
    const clip = await getTimelineAgentHandler(timeline_id).addMediaClip(args);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_text_clip"),
  async execute({
    timeline_id,
    text,
    trackId,
    startMs,
    durationMs,
    opacity,
    style,
    ...loose
  }) {
    const clip = getTimelineAgentHandler(timeline_id).addTextClip({
      text,
      trackId,
      startMs,
      durationMs,
      opacity,
      // `style` wins over a top-level twin: a caller that sent both meant the
      // bag it named.
      style: { ...loose, ...(style ?? {}) }
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_shape_clip"),
  async execute({
    timeline_id,
    shape,
    shapeStyle,
    trackId,
    startMs,
    durationMs,
    opacity,
    ...loose
  }) {
    const clip = getTimelineAgentHandler(timeline_id).addShapeClip({
      shape: resolveShapeArg(shape, shapeStyle, loose),
      trackId,
      startMs,
      durationMs,
      opacity
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_generate_clip"),
  async execute({ timeline_id, ...args }) {
    const result =
      await getTimelineAgentHandler(timeline_id).generateClip(args);
    return {
      ok: true,
      ...result,
      url: docUrl("timeline", timeline_id, {
        key: "clip",
        value: result.clip.id
      })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_split_clip"),
  async execute({ timeline_id, target, atMs }) {
    const clips = getTimelineAgentHandler(timeline_id).splitClip(target, atMs);
    return { ok: true, clips, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_trim_clip"),
  async execute({ timeline_id, target, durationMs, inPointMs, outPointMs }) {
    const clip = getTimelineAgentHandler(timeline_id).trimClip(target, {
      durationMs,
      inPointMs,
      outPointMs
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_move_clip"),
  async execute({ timeline_id, target, startMs, trackId }) {
    const clip = getTimelineAgentHandler(timeline_id).moveClip(target, {
      startMs,
      trackId
    });
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_clip"),
  async execute({ timeline_id, target }) {
    const clip = getTimelineAgentHandler(timeline_id).deleteClip(target);
    return { ok: true, deleted: clip, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_duplicate_clip"),
  async execute({ timeline_id, target, gapMs }) {
    const clip = await getTimelineAgentHandler(timeline_id).duplicateClip(
      target,
      gapMs
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_clip_params"),
  // The shared shape says `textStyle` is the whole bag; the op merges a patch
  // over the clip's own. Overridden here and in the headless bridge until the
  // contract carries `textStylePatchParams`.
  parameters: z
    .object({
      timeline_id: timelineIdParam,
      ...TIMELINE_CONTRACTS.ui_timeline_set_clip_params.shape,
      textStyle: textStylePatchParams.optional()
    })
    .catchall(z.unknown()),
  async execute({
    timeline_id,
    target,
    startMs,
    trackId,
    durationMs,
    inPointMs,
    outPointMs,
    fontSizePx,
    ...rest
  }) {
    // The schema keeps a key it does not list so it can be refused by name:
    // stripping `startMs` looked like a call that succeeded and moved nothing.
    rejectUnknownClipParams({
      startMs,
      trackId,
      durationMs,
      inPointMs,
      outPointMs,
      fontSizePx,
      ...rest
    });
    const handler = getTimelineAgentHandler(timeline_id);
    let clip: TimelineClipNode | undefined;
    // Timing belongs to trim_clip and move_clip, but a caller sending it here
    // means one edit either way — so apply it through the same handlers rather
    // than dropping it or making them call twice.
    if (
      durationMs !== undefined ||
      inPointMs !== undefined ||
      outPointMs !== undefined
    ) {
      clip = handler.trimClip(target, { durationMs, inPointMs, outPointMs });
    }
    if (startMs !== undefined || trackId !== undefined) {
      clip = handler.moveClip(target, { startMs, trackId });
    }
    const patch = { ...rest };
    if (fontSizePx !== undefined) {
      // Shorthand for the one text field callers reach for by name. The patch
      // is merged over the clip's own style by the handler, so only the size
      // goes in — but a clip with no style to merge into has nowhere to put it.
      const styled =
        patch.textStyle ?? (clip ?? resolveClip(handler, target))?.textStyle;
      if (!styled) {
        throw new Error(
          `Clip "${clip?.name ?? target}" carries no text to size; fontSizePx applies to a text clip's textStyle.`
        );
      }
      patch.textStyle = { ...patch.textStyle, fontSizePx };
    }
    if (Object.keys(patch).length > 0 || clip === undefined) {
      clip = handler.setClipParams(target, patch);
    }
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_group"),
  async execute({ timeline_id, ...args }) {
    const result = getTimelineAgentHandler(timeline_id).addGroup(args);
    return {
      ok: true,
      ...result,
      url: docUrl("timeline", timeline_id, {
        key: "clip",
        value: result.clip.id
      })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_parent"),
  async execute({ timeline_id, target, parentId }) {
    const clip = getTimelineAgentHandler(timeline_id).setParent(
      target,
      parentId
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_transition"),
  async execute({ timeline_id, target, transition }) {
    const clip = getTimelineAgentHandler(timeline_id).setTransition(
      target,
      transition
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_mask"),
  async execute({ timeline_id, target, mask }) {
    const clip = getTimelineAgentHandler(timeline_id).setMask(target, mask);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_matte"),
  async execute({ timeline_id, target, matte }) {
    const clip = getTimelineAgentHandler(timeline_id).setMatte(target, matte);
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_effects"),
  async execute({ timeline_id, target, effects }) {
    const clip = getTimelineAgentHandler(timeline_id).setEffects(
      target,
      effects
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_clip_binding"),
  async execute({ timeline_id, target, ...patch }) {
    const clip = await getTimelineAgentHandler(timeline_id).setClipBinding(
      target,
      patch
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_animate_clip"),
  async execute({ timeline_id, target, mode, animations }) {
    const clip = getTimelineAgentHandler(timeline_id).setClipAnimations(
      target,
      // `{preset: "custom", custom: {curves}}` reads as naturally as the flat
      // form, so lift it rather than handing the editor an animation with
      // neither curves nor code. The units come from the engine's own
      // STAGGER_UNITS, which `z.enum` widened to string on the way through the
      // contract.
      animations.map(liftCustomAnimation) as ClipAnimationInput[],
      mode ?? "replace"
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_clear_animations"),
  async execute({ timeline_id, target, role }) {
    const clip = getTimelineAgentHandler(timeline_id).clearClipAnimations(
      target,
      role
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...sharedWithoutSequence("ui_timeline_list_animation_presets"),
  async execute() {
    const presets = ANIMATION_PRESETS.map((p) => ({
      id: p.id,
      roles: p.roles,
      defaultDurationMs: p.defaultDurationMs,
      defaultEasing: p.defaultEasing,
      params: p.params,
      describe: p.describe
    }));
    return {
      ok: true,
      presets,
      custom: CUSTOM_ANIMATION_CONTRACT,
      properties: CUSTOM_ANIMATION_CONTRACT.properties
    };
  }
});

FrontendToolRegistry.register({
  name: "ui_timeline_get_clip_frames",
  description:
    "Inspect visual frames from ONE rendered video clip. `target` is required and names that clip — this tool never composites the timeline, so to see the finished frame (every track layered, titles and scrims drawn) call preview_timeline_frame instead. Give optional absolute timeline `timesMs`; otherwise the tool samples evenly across the clip. Returns JPEG data URLs plus timeline/source timestamps so you can see the clip content before splitting, trimming, or editing it.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    target: targetParam,
    timesMs: z
      .array(z.number())
      .max(8)
      .optional()
      .describe(
        "Absolute timeline timestamps in milliseconds to inspect. Omit to sample evenly across the clip."
      ),
    count: z
      .number()
      .min(1)
      .max(8)
      .optional()
      .describe(
        "Number of evenly spaced frames to sample when timesMs is omitted. Default 3, max 8."
      ),
    width: z
      .number()
      .min(1)
      .max(1024)
      .optional()
      .describe("Output JPEG width in pixels. Default 512, max 1024.")
  }),
  async execute({ timeline_id, target, timesMs, count, width }) {
    const result = await getTimelineAgentHandler(timeline_id).getClipFrames(
      target,
      {
        timesMs,
        count,
        width
      }
    );
    return { ok: true, ...result };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_select_clip"),
  async execute({ timeline_id, target }) {
    const clip = getTimelineAgentHandler(timeline_id).selectClip(
      target ?? null
    );
    return { ok: true, selected: clip };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_seek"),
  async execute({ timeline_id, timeMs }) {
    const playheadMs = getTimelineAgentHandler(timeline_id).seek(timeMs);
    return { ok: true, playheadMs };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_add_marker"),
  async execute({ timeline_id, ...opts }) {
    const marker = getTimelineAgentHandler(timeline_id).addMarker(opts);
    return { ok: true, marker, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_delete_marker"),
  async execute({ timeline_id, target }) {
    const deleted = getTimelineAgentHandler(timeline_id).deleteMarker(target);
    return { ok: true, deleted, url: docUrl("timeline", timeline_id) };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_time_remap"),
  async execute({ timeline_id, target, timeRemap }) {
    const clip = getTimelineAgentHandler(timeline_id).setTimeRemap(
      target,
      timeRemap
    );
    return {
      ok: true,
      clip,
      url: docUrl("timeline", timeline_id, { key: "clip", value: clip.id })
    };
  }
});

FrontendToolRegistry.register({
  ...shared("ui_timeline_set_markers_from_beats"),
  async execute({ timeline_id, onsets_ms, bpm, offset_ms, count, label }) {
    const handler = getTimelineAgentHandler(timeline_id);
    const grid = buildBeatGrid({
      onsetsMs: onsets_ms,
      bpm,
      offsetMs: offset_ms,
      count
    });
    const stem = (label ?? "Beat").trim() || "Beat";
    const taken = new Set(
      handler.getSnapshot().markers.map((marker) => marker.timeMs)
    );
    const added: TimelineMarkerNode[] = [];
    const skipped: number[] = [];
    for (const [index, timeMs] of grid.entries()) {
      if (taken.has(timeMs)) {
        skipped.push(timeMs);
        continue;
      }
      added.push(handler.addMarker({ timeMs, label: `${stem} ${index + 1}` }));
      taken.add(timeMs);
    }
    return {
      ok: true,
      grid: {
        count: grid.length,
        firstMs: grid[0],
        lastMs: grid[grid.length - 1]
      },
      added,
      skipped_times_ms: skipped,
      markers: handler.getSnapshot().markers.length,
      url: docUrl("timeline", timeline_id)
    };
  }
});

/** The clip a target names — an id, a name, or the literal "selected". */
function resolveClip(
  handler: TimelineAgentHandler,
  target: string
): TimelineClipNode | undefined {
  const snapshot = handler.getSnapshot();
  if (target === "selected") {
    return snapshot.clips.find((c) => snapshot.selectedClipIds.includes(c.id));
  }
  return resolveSnapTargets(snapshot.clips, [target]).clips[0];
}

/** Clips a snap targets: named ones resolved by id or name, else every clip. */
function resolveSnapTargets(
  clips: TimelineClipNode[],
  targets: string[] | undefined
): { clips: TimelineClipNode[]; missing: string[] } {
  if (!targets || targets.length === 0) {
    return { clips: [...clips], missing: [] };
  }
  const resolved: TimelineClipNode[] = [];
  const missing: string[] = [];
  for (const target of targets) {
    const lower = target.toLowerCase();
    const clip =
      clips.find((c) => c.id === target) ??
      clips.find((c) => c.name.toLowerCase() === lower);
    // Recorded as a skip in the op's own report, with the reason.
    if (!clip) missing.push(target);
    else if (!resolved.includes(clip)) resolved.push(clip);
  }
  return { clips: resolved, missing };
}

FrontendToolRegistry.register({
  ...shared("ui_timeline_snap_to_beats"),
  async execute({
    timeline_id,
    targets,
    onsets_ms,
    bpm,
    offset_ms,
    tolerance_ms,
    mode,
    action
  }) {
    const handler = getTimelineAgentHandler(timeline_id);
    const named = targets === undefined || targets === "all" ? undefined : targets;
    const { clips: targeted, missing } = resolveSnapTargets(
      handler.getSnapshot().clips,
      named
    );

    const offsetMs = offset_ms ?? 0;
    // A tempo grid has to reach the last boundary being snapped, so its length
    // comes from the targets rather than from the caller.
    const reachMs = targeted.reduce(
      (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
      0
    );
    const grid = buildBeatGrid({
      onsetsMs: onsets_ms,
      bpm,
      offsetMs: offset_ms,
      count: bpm === undefined ? undefined : beatCountToCover(bpm, offsetMs, reachMs)
    });

    const options: {
      toleranceMs?: number;
      mode?: SnapBoundaryMode;
      action?: SnapAction;
    } = {};
    if (tolerance_ms !== undefined) options.toleranceMs = tolerance_ms;
    if (mode !== undefined) options.mode = mode;
    if (action !== undefined) options.action = action;

    const result = snapClipsToGrid(
      targeted.map((clip) => ({
        id: clip.id,
        startMs: clip.startMs,
        durationMs: clip.durationMs
      })),
      grid,
      options
    );

    const byId = new Map(targeted.map((clip) => [clip.id, clip]));
    const reported: (ClipSnapResult & { clipName: string | null })[] = [];
    let applied = 0;
    for (const entry of result.clips) {
      const clip = byId.get(entry.clipId);
      if (!entry.snapped) {
        reported.push({ ...entry, clipName: clip?.name ?? null });
        continue;
      }
      try {
        // The move carries a group's children with it; the trim then holds the
        // far boundary, so the two together land the clip on `after`.
        if (entry.after.startMs !== entry.before.startMs) {
          handler.moveClip(entry.clipId, { startMs: entry.after.startMs });
        }
        if (entry.after.durationMs !== entry.before.durationMs) {
          handler.trimClip(entry.clipId, { durationMs: entry.after.durationMs });
        }
        applied += 1;
        reported.push({ ...entry, clipName: clip?.name ?? null });
      } catch (e) {
        reported.push({
          ...entry,
          snapped: false,
          after: entry.before,
          delta: { startMs: 0, endMs: 0 },
          clipName: clip?.name ?? null,
          reason: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // A name nothing matched is a skip like any other: the caller has to see it
    // in the same list, not infer it from a shorter one.
    for (const target of missing) {
      reported.push({
        clipId: target,
        clipName: null,
        snapped: false,
        before: { startMs: 0, endMs: 0, durationMs: 0 },
        after: { startMs: 0, endMs: 0, durationMs: 0 },
        delta: { startMs: 0, endMs: 0 },
        reason: `no clip matches "${target}"`
      });
    }

    return {
      ok: true,
      grid: {
        count: grid.length,
        firstMs: grid[0],
        lastMs: grid[grid.length - 1]
      },
      toleranceMs: result.toleranceMs,
      mode: result.mode,
      action: result.action,
      snapped: applied,
      skipped: reported.length - applied,
      clips: reported,
      url: docUrl("timeline", timeline_id)
    };
  }
});

/** Ops one `ui_timeline_edit` call may carry — the headless cap (D-batch). */
const MAX_TIMELINE_EDIT_OPS = 60;
const TIMELINE_TOOL_PREFIX = "ui_timeline_";

/** Op names `ui_timeline_edit` dispatches to, without the prefix. */
function timelineOpNames(): string[] {
  return FrontendToolRegistry.getManifest()
    .map((tool) => tool.name)
    .filter(
      (name) =>
        name.startsWith(TIMELINE_TOOL_PREFIX) && name !== "ui_timeline_edit"
    )
    .map((name) => name.slice(TIMELINE_TOOL_PREFIX.length))
    .sort();
}

FrontendToolRegistry.register({
  name: "ui_timeline_edit",
  description:
    "Apply several timeline edits in one call. Each op names any ui_timeline_* tool — with or without the `ui_timeline_` prefix — and carries that tool's own input; `timeline_id` is taken from this call, so ops need not repeat it. Ops run in order and a failing one does not stop the rest: read `results` for the per-op outcome. Call ui_timeline_get_state afterwards when you need the ids the edits created.",
  parameters: z.object({
    timeline_id: timelineIdParam,
    ops: z
      .array(
        z.object({
          tool: z
            .string()
            .describe(
              'A ui_timeline_* tool name, with or without the "ui_timeline_" prefix.'
            ),
          input: z
            .record(z.string(), z.unknown())
            .optional()
            .describe("That tool's own input, minus timeline_id.")
        })
      )
      .min(1)
      .describe(`Up to ${MAX_TIMELINE_EDIT_OPS} operations, applied in order.`)
  }),
  async execute({ timeline_id, ops }, ctx) {
    if (ops.length > MAX_TIMELINE_EDIT_OPS) {
      throw new Error(
        `ops holds ${ops.length} entries; at most ${MAX_TIMELINE_EDIT_OPS} per call.`
      );
    }
    const results: {
      tool: string;
      ok: boolean;
      result?: unknown;
      error?: string;
    }[] = [];
    let applied = 0;
    for (const [index, op] of ops.entries()) {
      const name = op.tool.startsWith(TIMELINE_TOOL_PREFIX)
        ? op.tool
        : `${TIMELINE_TOOL_PREFIX}${op.tool}`;
      // A batch inside a batch has no meaning and would recurse.
      if (name === "ui_timeline_edit" || !FrontendToolRegistry.has(name)) {
        results.push({
          tool: op.tool,
          ok: false,
          error: `No timeline operation named "${name.slice(
            TIMELINE_TOOL_PREFIX.length
          )}". Available: ${timelineOpNames().join(", ")}.`
        });
        continue;
      }
      try {
        const result = await FrontendToolRegistry.call(
          name,
          { ...op.input, timeline_id },
          `ui_timeline_edit-${index}-${Date.now()}`,
          { getState: ctx.getState }
        );
        applied += 1;
        results.push({ tool: name, ok: true, result });
      } catch (e) {
        results.push({
          tool: name,
          ok: false,
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    const failed = results.length - applied;
    return {
      ok: failed === 0,
      applied,
      failed,
      results,
      url: docUrl("timeline", timeline_id)
    };
  }
});
