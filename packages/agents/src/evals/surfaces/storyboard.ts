/**
 * Headless bridge for the Storyboard tool-loop eval.
 *
 * The real frontend tools (`web/src/lib/tools/builtin/storyboard.ts`) delegate
 * to a `StoryboardAgentHandler` the live `StoryboardSurface` registers on
 * `storyboardAgentBridge` — it mutates a Zustand store backing the visual
 * shot cards, and its generate/render operations kick off real media jobs.
 * None of that can run under Node. This bridge reimplements the *effects* of
 * the tool surface against a plain in-memory board, faking the async
 * generate/render jobs by flipping shot status flags synchronously, so a
 * model can drive the exact same `ui_storyboard_*` tool surface headlessly.
 *
 * What it does NOT fork is the tool *contract*: names, descriptions, and Zod
 * parameter shapes are copied verbatim from the builtin file (minus the
 * `storyboard_id` parameter — this bridge has a single implicit board). Only
 * `Screenplay` / `Shot` / `ShotStatus` / `CameraDirection` / `isScreenplay`
 * are reused from `@nodetool-ai/protocol`, the single source of truth for
 * those shapes.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  isScreenplay,
  type CameraDirection,
  type Screenplay,
  type ShotStatus
} from "@nodetool-ai/protocol";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";

const targetParam = z
  .string()
  .describe(
    'Shot id, 0-based shot index (as a string), or the literal "selected" for the currently-selected shot.'
  );

const cameraParam = z
  .object({
    framing: z.string().optional(),
    lens: z.string().optional(),
    angle: z.string().optional(),
    movement: z.string().optional()
  })
  .describe("Structured camera direction (framing, lens, angle, movement).");

const shotStatusEnum = z.enum([
  "planned",
  "keyframe_generating",
  "keyframe_ready",
  "approved",
  "clip_generating",
  "rendered",
  "failed"
]) satisfies z.ZodType<ShotStatus>;

/** Internal shot node the board tracks. */
interface ShotNode {
  id: string;
  index: number;
  slug?: string;
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  status: ShotStatus;
  hasKeyframe: boolean;
  hasClip: boolean;
  costEstimate?: number | null;
}

/** Case-supplied starting point for a board. */
export interface StoryboardBridgeInitialState {
  title?: string;
  brief?: string;
  style?: string;
  aspectRatio?: string;
  shots?: {
    action: string;
    camera?: CameraDirection;
    motion?: string;
    durationSeconds?: number;
  }[];
}

/** Snapshot of the board handed to final-state predicates. */
export interface StoryboardBridgeFinalState {
  title: string;
  hasScreenplay: boolean;
  selectedShotId: string | null;
  shots: {
    id: string;
    index: number;
    action: string;
    status: ShotStatus;
    hasKeyframe: boolean;
    hasClip: boolean;
  }[];
}

function tool(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<unknown>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    execute: (args) => {
      const parsed = parseWithTypeCoercion(parameters, args ?? {}) as Record<
        string,
        unknown
      >;
      return impl(parsed);
    }
  };
}

/**
 * Build an in-memory Storyboard bridge whose tools share the `ui_storyboard_*`
 * contract but run headlessly against a plain shot array (no live surface,
 * no media generation — generate/render jobs are faked by flipping status
 * flags synchronously).
 */
export function createStoryboardToolBridge(
  initial: StoryboardBridgeInitialState = {}
): HeadlessSurfaceBridge<StoryboardBridgeFinalState> {
  const boardId = "board_1";
  let title = initial.title ?? "";
  const brief = initial.brief ?? "";
  const style = initial.style ?? "";
  const aspectRatio = initial.aspectRatio ?? "16:9";
  let hasScreenplay = false;
  let selectedShotId: string | null = null;
  let shotSeq = 0;

  const nextShotId = () => `shot_${++shotSeq}`;

  let shots: ShotNode[] = (initial.shots ?? []).map((s) => ({
    id: nextShotId(),
    index: 0,
    action: s.action,
    camera: s.camera,
    motion: s.motion,
    durationSeconds: s.durationSeconds,
    status: "planned",
    hasKeyframe: false,
    hasClip: false
  }));
  reindex();

  function reindex(): void {
    shots.forEach((s, i) => {
      s.index = i;
    });
  }

  function findShot(id: string): ShotNode | undefined {
    return shots.find((s) => s.id === id);
  }

  /** Resolve a shot by id, 0-based index, or the literal "selected". */
  function resolveTarget(target: string): ShotNode {
    if (target === "selected") {
      if (!selectedShotId) {
        throw new Error("No shot is currently selected.");
      }
      const shot = findShot(selectedShotId);
      if (!shot) {
        throw new Error(`Selected shot "${selectedShotId}" no longer exists.`);
      }
      return shot;
    }
    const byId = findShot(target);
    if (byId) return byId;
    if (/^\d+$/.test(target)) {
      const idx = Number(target);
      const byIndex = shots.find((s) => s.index === idx);
      if (byIndex) return byIndex;
    }
    throw new Error(
      `No shot found matching "${target}" (by id, 0-based index, or "selected").`
    );
  }

  const serialize = (s: ShotNode) => ({ ...s });

  function snapshot() {
    return {
      boardId,
      title,
      brief,
      style,
      aspectRatio,
      hasScreenplay,
      selectedShotId,
      shots: shots.map(serialize)
    };
  }

  const tools: HeadlessTool[] = [
    tool(
      "ui_storyboard_get_state",
      "Read the specified storyboard: title, brief, style, aspect ratio, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, status, and whether it has a rendered keyframe/clip. Call this first to discover the shot ids/indexes the other tools need.",
      z.object({}),
      async () => ({ ok: true, ...snapshot() })
    ),

    tool(
      "ui_storyboard_set_screenplay",
      "Load a full screenplay onto the specified storyboard, replacing its shots. `screenplay` is a Screenplay object ({ type:'screenplay', id, title, shots: Shot[], ... }) — typically the output of the Director node.",
      z.object({ screenplay: z.record(z.string(), z.unknown()) }),
      async ({ screenplay }) => {
        if (!isScreenplay(screenplay)) {
          throw new Error(
            "`screenplay` must be a Screenplay object ({ type:'screenplay', shots: [...] })."
          );
        }
        const play = screenplay as Screenplay;
        shots = play.shots.map((shot) => ({
          id: nextShotId(),
          index: 0,
          slug: shot.slug,
          action: shot.action,
          camera: shot.camera,
          motion: shot.motion,
          durationSeconds: undefined,
          status: "planned",
          hasKeyframe: false,
          hasClip: false
        }));
        reindex();
        hasScreenplay = true;
        if (play.title) title = play.title;
        selectedShotId = null;
        return { ok: true, ...snapshot() };
      }
    ),

    tool(
      "ui_storyboard_add_shot",
      "Add a new shot to the specified storyboard. `action` is the concrete visual (required). Optionally set `camera`, `motion`, `durationSeconds`, and an `index` to insert at (appended when omitted). The shot starts in the 'planned' status.",
      z.object({
        action: z.string(),
        camera: cameraParam.optional(),
        motion: z.string().optional(),
        durationSeconds: z.number().optional(),
        index: z.number().optional()
      }),
      async ({ action, camera, motion, durationSeconds, index }) => {
        const shot: ShotNode = {
          id: nextShotId(),
          index: 0,
          action: action as string,
          camera: camera as CameraDirection | undefined,
          motion: motion as string | undefined,
          durationSeconds: durationSeconds as number | undefined,
          status: "planned",
          hasKeyframe: false,
          hasClip: false
        };
        if (typeof index === "number" && index >= 0 && index <= shots.length) {
          shots.splice(index, 0, shot);
        } else {
          shots.push(shot);
        }
        reindex();
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_update_shot",
      "Edit an existing shot's `action`, `camera`, `motion`, or `status`. Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        action: z.string().optional(),
        camera: cameraParam.optional(),
        motion: z.string().optional(),
        status: shotStatusEnum.optional()
      }),
      async ({ target, action, camera, motion, status }) => {
        const shot = resolveTarget(target as string);
        if (typeof action === "string") shot.action = action;
        if (camera !== undefined) shot.camera = camera as CameraDirection;
        if (typeof motion === "string") shot.motion = motion;
        if (status !== undefined) shot.status = status as ShotStatus;
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_generate_keyframe",
      "Generate (or regenerate) the cheap keyframe still for a shot from its action + the board style. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const shot = resolveTarget(target as string);
        shot.status = "keyframe_ready";
        shot.hasKeyframe = true;
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_generate_clip",
      "Render the final clip for a shot, animating its selected keyframe still. The shot must have a still. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const shot = resolveTarget(target as string);
        if (!shot.hasKeyframe) {
          throw new Error(
            `Shot "${shot.id}" must have a still before a clip can be generated. Call ui_storyboard_generate_keyframe first.`
          );
        }
        shot.status = "rendered";
        shot.hasClip = true;
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_revise_shot",
      "Regenerate a shot's video clip via video-to-video using a text instruction, e.g. 'make it darker, add rain'. Seeds the shot's existing clip and swaps the revised result in place. The shot must already have a clip (generate one first). Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
      z.object({
        target: targetParam,
        instruction: z
          .string()
          .describe(
            "The change to make, phrased as a video edit prompt (e.g. 'make it darker, add rain')."
          )
      }),
      async ({ target }) => {
        const shot = resolveTarget(target as string);
        if (!shot.hasClip) {
          throw new Error(
            `Shot "${shot.id}" has no clip to revise. Call ui_storyboard_generate_clip first.`
          );
        }
        shot.status = "rendered";
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_assemble_timeline",
      "Assemble the specified storyboard's rendered shots into a persisted timeline sequence and open it in the timeline editor. Shot clips are laid end to end in order; the screenplay's narration and music become draft audio clips ready to generate. Shots without a rendered clip are skipped (returned in skippedShotIds). Each timeline clip stays linked to its shot, so ui_storyboard_revise_shot updates the cut in place.",
      z.object({}),
      async () => {
        const withClip = shots.filter((s) => s.hasClip);
        if (withClip.length === 0) {
          throw new Error(
            "No shot has a rendered clip yet. Generate at least one clip before assembling the timeline."
          );
        }
        const skippedShotIds = shots
          .filter((s) => !s.hasClip)
          .map((s) => s.id);
        return {
          ok: true,
          sequenceId: "seq_1",
          clipCount: withClip.length,
          skippedShotIds
        };
      }
    ),

    tool(
      "ui_storyboard_select_shot",
      "Select a shot on the specified storyboard (driving the surface's focus). Pass null to clear the selection.",
      z.object({ target: targetParam.nullable() }),
      async ({ target }) => {
        const t = target as string | null;
        if (t === null) {
          selectedShotId = null;
          return { ok: true, selected: null };
        }
        const shot = resolveTarget(t);
        selectedShotId = shot.id;
        return { ok: true, selected: serialize(shot) };
      }
    )
  ];

  return {
    tools,
    finalState: (): StoryboardBridgeFinalState => ({
      title,
      hasScreenplay,
      selectedShotId,
      shots: shots.map((s) => ({
        id: s.id,
        index: s.index,
        action: s.action,
        status: s.status,
        hasKeyframe: s.hasKeyframe,
        hasClip: s.hasClip
      }))
    })
  };
}

const STORYBOARD_SYSTEM_PROMPT = `You are an assistant directing a Storyboard through UI tools.

Use the ui_storyboard_* tools to inspect and drive the board:
- Call ui_storyboard_get_state first to see what's already there and get the shot ids/indexes the other tools need.
- Add shots with ui_storyboard_add_shot, or load a whole screenplay at once with ui_storyboard_set_screenplay.
- Edit an existing shot with ui_storyboard_update_shot.
- Address shots by id, 0-based index, or the literal "selected" for generate_keyframe / generate_clip / revise_shot / select_shot.
- Generate a keyframe still before generating a clip; a clip must exist before revising it.
- ui_storyboard_assemble_timeline cuts every shot with a rendered clip into a sequence.

Call one tool at a time and use the result before the next call. When the objective is fully satisfied, STOP calling tools and give a one-line summary.`;

/** A valid Screenplay the `load-screenplay` case's objective asks to load. */
export const SAMPLE_SCREENPLAY: Screenplay = {
  type: "screenplay",
  id: "sp_1",
  title: "Lighthouse Dawn",
  logline: "A keeper's last night before the light goes dark.",
  aspect_ratio: "16:9",
  shots: [
    {
      type: "shot",
      id: "sp1_shot_0",
      index: 0,
      slug: "Lighthouse at dusk",
      action: "A lighthouse stands against a darkening sky, waves crashing below.",
      camera: { framing: "wide", angle: "low angle" },
      motion: "slow push in",
      status: "planned"
    },
    {
      type: "shot",
      id: "sp1_shot_1",
      index: 1,
      slug: "Keeper climbs the stairs",
      action: "The keeper climbs a spiral staircase, lantern in hand.",
      camera: { framing: "medium" },
      motion: "handheld",
      status: "planned"
    },
    {
      type: "shot",
      id: "sp1_shot_2",
      index: 2,
      slug: "The light goes out",
      action: "The lighthouse beam flickers and dies as dawn breaks.",
      camera: { framing: "close-up" },
      motion: "static",
      status: "planned"
    }
  ]
};

export const STORYBOARD_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<StoryboardBridgeFinalState>[] =
  [
    {
      id: "board-from-scratch",
      description:
        "Add 3 shots for a short sequence, each with camera framing, then select the first",
      objective:
        "Build a short 3-shot sequence for a storyboard from scratch: add 3 shots describing the sequence, each with a camera framing, then select the first shot.",
      createBridge: () => createStoryboardToolBridge(),
      systemPrompt: STORYBOARD_SYSTEM_PROMPT,
      expect: {
        requiredTools: ["ui_storyboard_add_shot"],
        noErrorResults: true,
        minToolCalls: 3,
        maxToolCalls: 15,
        finalState: [
          {
            name: "hasThreeShots",
            detail: "fewer than 3 shots on the board",
            test: (s) => s.shots.length >= 3
          }
        ]
      }
    },
    {
      id: "render-pipeline",
      description:
        "Generate a keyframe then a clip for each of 2 planned shots, then assemble the timeline",
      objective:
        "The storyboard has 2 planned shots. Generate a keyframe and then a clip for each shot, then assemble the timeline.",
      createBridge: () =>
        createStoryboardToolBridge({
          shots: [
            { action: "A car speeds down a coastal highway." },
            { action: "The car pulls into a quiet driveway at night." }
          ]
        }),
      systemPrompt: STORYBOARD_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The storyboard has 2 planned shots (shot_1, shot_2). Generate a keyframe and then a clip for each shot, then assemble the timeline.",
      expect: {
        requiredTools: [
          "ui_storyboard_generate_keyframe",
          "ui_storyboard_generate_clip",
          "ui_storyboard_assemble_timeline"
        ],
        ordering: [
          ["ui_storyboard_generate_keyframe", "ui_storyboard_generate_clip"],
          ["ui_storyboard_generate_clip", "ui_storyboard_assemble_timeline"]
        ],
        noErrorResults: true,
        minToolCalls: 4,
        maxToolCalls: 15,
        finalState: [
          {
            name: "everyShotHasClip",
            detail: "not every shot has a rendered clip",
            test: (s) => s.shots.length > 0 && s.shots.every((sh) => sh.hasClip)
          }
        ]
      }
    },
    {
      id: "load-screenplay",
      description: "Load the provided screenplay onto an empty board",
      objective:
        "Load the provided screenplay onto the storyboard, replacing any existing shots.",
      createBridge: () => createStoryboardToolBridge(),
      systemPrompt: STORYBOARD_SYSTEM_PROMPT,
      userPrompt: `Objective: Load this screenplay onto the storyboard using ui_storyboard_set_screenplay, passing it verbatim as the \`screenplay\` argument:\n\n${JSON.stringify(SAMPLE_SCREENPLAY)}`,
      needsModelProviders: false,
      expect: {
        requiredTools: ["ui_storyboard_set_screenplay"],
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 10,
        finalState: [
          {
            name: "screenplayLoaded",
            detail: "hasScreenplay is not true",
            test: (s) => s.hasScreenplay === true
          },
          {
            name: "shotCountMatches",
            detail: "shot count does not match the screenplay",
            test: (s) => s.shots.length === SAMPLE_SCREENPLAY.shots.length
          }
        ]
      }
    }
  ] as const;
