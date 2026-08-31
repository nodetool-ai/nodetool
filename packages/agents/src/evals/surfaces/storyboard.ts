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
 * `storyboard_id` parameter — this bridge has a single implicit board). The
 * shapes come from `@nodetool-ai/protocol` (`Screenplay` / `Shot` /
 * `ShotStatus` / `CameraDirection`), and so does the write path: the same
 * `normalizeStoryboardScreenplay` the browser tool calls, validating against
 * the same schema the save uses.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type {
  CameraDirection,
  Screenplay,
  Shot,
  ShotStatus
} from "@nodetool-ai/protocol";
import {
  extractScriptFromScreenplay,
  joinLineTexts
} from "@nodetool-ai/protocol";
import { storyboards } from "@nodetool-ai/protocol/api-schemas";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";
import { isNumber, isString } from "../../utils/type-guards.js";

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

/** Mirrors `screenplayShotParam` in the builtin file. */
const screenplayShotParam = z
  .object({
    action: z
      .string()
      .describe("The concrete visual to render: subject plus setting."),
    slug: z.string().optional().describe("Short human label for the shot."),
    camera: cameraParam.optional(),
    motion: z.string().optional(),
    dialogue: z.string().optional(),
    narration: z.string().optional(),
    durationSeconds: z.number().optional(),
    entityIds: z.array(z.string()).optional()
  })
  .passthrough();

/** Mirrors `screenplayParam` in the builtin file. */
const screenplayParam = z
  .object({
    type: z
      .literal("screenplay")
      .describe("Discriminator — always the literal 'screenplay'."),
    shots: z
      .array(screenplayShotParam)
      .describe("The shots, in order. Each needs an `action`."),
    id: z.string().optional().describe("Generated when omitted."),
    title: z.string().optional(),
    logline: z.string().optional(),
    brief: z.string().optional().describe("What the piece is for."),
    style: z
      .string()
      .optional()
      .describe("The look applied to every shot (alias of styleBible)."),
    styleBible: z.string().optional(),
    aspectRatio: z.string().optional(),
    narration: z.string().optional(),
    musicPrompt: z.string().optional(),
    entityIds: z.array(z.string()).optional()
  })
  .passthrough();

const shotStatusEnum = z.enum([
  "planned",
  "keyframe_generating",
  "keyframe_ready",
  "approved",
  "clip_generating",
  "rendered",
  "failed"
]) satisfies z.ZodType<ShotStatus>;

/**
 * The serializable shot the tools answer with — a projection of the stored wire
 * `Shot`, exactly as `toShotNode` projects it in the browser bridge.
 */
interface ShotNode {
  id: string;
  index: number;
  slug?: string;
  action: string;
  camera?: CameraDirection;
  motion?: string;
  durationSeconds?: number;
  durationSource?: "audio" | "manual";
  status: ShotStatus;
  hasKeyframe: boolean;
  hasClip: boolean;
  costEstimate?: number | null;
}

const toShotNode = (shot: Shot): ShotNode => ({
  id: shot.id,
  index: shot.index,
  slug: shot.slug,
  action: shot.action,
  camera: shot.camera,
  motion: shot.motion,
  durationSeconds: shot.duration_seconds,
  durationSource: shot.duration_source,
  status: shot.status,
  hasKeyframe: !!shot.keyframe,
  hasClip: !!shot.clip,
  costEstimate: shot.cost_estimate ?? null
});

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
    dialogue?: string;
    narration?: string;
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
    slug?: string;
    action: string;
    durationSeconds?: number;
    status: ShotStatus;
    hasKeyframe: boolean;
    hasClip: boolean;
  }[];
  /** Whether the shots the board holds would survive `storyboards.update`. */
  savable: boolean;
  /** The failing schema paths when `savable` is false. */
  saveIssues: string[];
  /** The script this board links, once one has been extracted. */
  scriptId: string | null;
  /** Lines the extracted script holds. */
  scriptLineCount: number;
  /** Shots carrying the ids of the script lines they cover. */
  linkedShotIds: string[];
}

export interface ExplainerStoryboardBridgeFinalState {
  created: boolean;
  entityIds: string[];
  shots: { slug: string; action: string; durationSeconds: number }[];
  savable: boolean;
}

const EXPLAINER_ENTITIES = [
  { id: "lumen-style", name: "Lumen Style", kind: "style" },
  { id: "support-lead", name: "Support Lead", kind: "character" },
  { id: "lumen-dashboard-mock", name: "Lumen Dashboard Mock", kind: "prop" },
  { id: "glass-funnel", name: "Glass Funnel", kind: "prop" }
] as const;

/** Direct storyboard/entity capability bridge for explainer planning jobs. */
export function createExplainerStoryboardToolBridge(
  entities: readonly { id: string; name: string; kind: string }[] = EXPLAINER_ENTITIES
): HeadlessSurfaceBridge<ExplainerStoryboardBridgeFinalState> {
  let created = false;
  let entityIds: string[] = [];
  const shots: { slug: string; action: string; durationSeconds: number }[] = [];
  const tools: HeadlessTool[] = [
    tool("list_entities", "List reusable production entities before making a storyboard.", z.object({}), async () => ({ entities })),
    tool("create_storyboard", "Create a blank persisted storyboard. Returns storyboard_id.", z.object({ name: z.string(), brief: z.string(), style: z.string(), aspect_ratio: z.string() }), async () => {
      created = true;
      return { ok: true, storyboard_id: "board_1" };
    }),
    tool("edit_storyboard", "Edit a storyboard. Use set_board with entity_ids to attach its entity roster, then add_shot with action, duration_seconds, and slug.", z.object({ storyboard_id: z.literal("board_1"), ops: z.array(z.object({ op: z.string() }).passthrough()).min(1) }), async ({ ops }) => {
      for (const op of ops as Array<Record<string, unknown>>) {
        if (op.op === "set_board") {
          const supplied = op.entity_ids;
          const values = Array.isArray(supplied)
            ? supplied
            : typeof supplied === "object" && supplied !== null && Array.isArray((supplied as { item?: unknown }).item)
              ? (supplied as { item: unknown[] }).item
              : [];
          entityIds = values.filter(isString);
          continue;
        }
        const duration = typeof op.duration_seconds === "string" ? Number(op.duration_seconds) : op.duration_seconds;
        if (op.op === "add_shot" && isString(op.slug) && isString(op.action) && isNumber(duration)) {
          shots.push({ slug: op.slug, action: op.action, durationSeconds: duration });
          continue;
        }
        throw new Error("edit_storyboard requires set_board.entity_ids or add_shot with slug, action, and duration_seconds.");
      }
      return { ok: true, entity_ids: entityIds, shots: shots.length };
    })
  ];
  return {
    tools,
    finalState: () => ({
      created,
      entityIds,
      shots,
      savable: created && entityIds.length > 0 && shots.length > 0 && shots.every((shot) => shot.action.trim() !== "" && shot.durationSeconds > 0)
    })
  };
}

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): HeadlessTool {
  return {
    name,
    description,
    parameters,
    // Async so a parameter-validation failure reaches the caller as a rejected
    // promise, the way a failure inside the impl does.
    execute: async (args) => {
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
 *
 * The board holds wire `Shot` objects and projects them for its answers, the
 * way the browser store does. Holding the projection instead let the bridge
 * mint the `id`, `index` and `status` a shot arrived without — which made it
 * accept screenplays the real save refuses, and is why this suite stayed green
 * through a bug that lost a user's board. `finalState().savable` reports what
 * `storyboards.update` would say about what the board now holds.
 */
export function createStoryboardToolBridge(
  initial: StoryboardBridgeInitialState = {}
): HeadlessSurfaceBridge<StoryboardBridgeFinalState> {
  const boardId = "board_1";
  let title = initial.title ?? "";
  const brief = initial.brief ?? "";
  const style = initial.style ?? "";
  const aspectRatio = initial.aspectRatio ?? "16:9";
  let entityIds: string[] = [];
  let hasScreenplay = false;
  let selectedShotId: string | null = null;
  let shotSeq = 0;
  let scriptId: string | null = null;
  let scriptLineCount = 0;

  const nextShotId = () => `shot_${++shotSeq}`;

  let screenplayId = "sp_1";

  let shots: Shot[] = (initial.shots ?? []).map((s, i) =>
    storyboards.normalizeStoryboardShot(s, i, { generateId: nextShotId })
  );
  reindex();

  function reindex(): void {
    shots.forEach((s, i) => {
      s.index = i;
    });
  }

  function findShot(id: string): Shot | undefined {
    return shots.find((s) => s.id === id);
  }

  /** Resolve a shot by id, 0-based index, or the literal "selected". */
  function resolveTarget(target: string): Shot {
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

  const serialize = (s: Shot): ShotNode => toShotNode(s);

  /**
   * What `storyboards.update` would say about the shots the board now holds.
   * The board's own id and title are the row's, not the agent's, so they are
   * supplied here; the shots are exactly what the agent handed over.
   */
  function saveIssues(): string[] {
    const parsed = storyboards.storyboardScreenplay.safeParse({
      type: "screenplay",
      id: screenplayId,
      title,
      shots
    });
    return parsed.success
      ? []
      : parsed.error.issues.map(
          (issue) => `${issue.path.join(".") || "screenplay"}: ${issue.message}`
        );
  }

  function snapshot() {
    return {
      boardId,
      scriptId,
      title,
      brief,
      style,
      aspectRatio,
      entityIds,
      hasScreenplay,
      selectedShotId,
      shots: shots.map(serialize)
    };
  }

  const tools: HeadlessTool[] = [
    tool(
      "ui_storyboard_get_state",
      "Read the specified storyboard: title, brief, style, aspect ratio, the entity ids cast on the board, whether a screenplay is loaded, the selected shot, and every shot with its index, slug, action, camera, motion, duration, status, and whether it has a rendered keyframe/clip. Call this first to discover the shot ids/indexes the other tools need.",
      z.object({}),
      async () => ({ ok: true, ...snapshot() })
    ),

    tool(
      "ui_storyboard_set_screenplay",
      "Load a full screenplay onto the specified storyboard, replacing its shots. `screenplay` is a Screenplay object ({ type:'screenplay', title, shots: Shot[], ... }) — typically the output of the Director node. Shot ids, indexes and statuses are filled in for you; every shot needs an `action`. A top-level `entityIds` casts those entities on the board (use ui_storyboard_set_entities to change the cast without replacing the shots); a shot's own `entityIds` overrides the board cast for that shot.",
      z.object({ screenplay: screenplayParam }),
      async ({ screenplay }) => {
        const play = storyboards.normalizeStoryboardScreenplay(screenplay, {
          generateId: nextShotId
        });
        shots = play.shots;
        reindex();
        hasScreenplay = true;
        screenplayId = play.id;
        if (play.title) title = play.title;
        if (play.entity_ids) entityIds = play.entity_ids;
        selectedShotId = null;
        return { ok: true, ...snapshot() };
      }
    ),

    tool(
      "ui_storyboard_set_entities",
      "Cast library entities (characters, locations, styles, props) on the specified storyboard, replacing the current selection. Their descriptors and reference images season every shot's still and clip prompt — a style or location applies to every shot, a character or prop applies to the shots whose text names it. Pass an empty array to clear the cast. Discover ids with ui_entity_list.",
      z.object({ entity_ids: z.array(z.string()) }),
      async ({ entity_ids }) => {
        // The headless tool signature erases the parsed shape to `unknown`;
        // the schema above has already refused anything but a string array.
        entityIds = (Array.isArray(entity_ids) ? entity_ids : []).filter(
          isString
        );
        return { ok: true, ...snapshot() };
      }
    ),

    tool(
      "ui_storyboard_add_shot",
      "Add a new shot to the specified storyboard. `action` is the concrete visual (required). `slug` is the shot's short title, e.g. 'Lighthouse at dusk' — give every shot one. Optionally set `camera`, `motion`, `durationSeconds`, and an `index` to insert at (appended when omitted). The shot starts in the 'planned' status.",
      z.object({
        action: z.string(),
        slug: z.string().optional(),
        camera: cameraParam.optional(),
        motion: z.string().optional(),
        durationSeconds: z.number().optional(),
        index: z.number().optional()
      }),
      async ({ action, slug, camera, motion, durationSeconds, index }) => {
        const shot = storyboards.normalizeStoryboardShot(
          { action, slug, camera, motion, durationSeconds },
          shots.length,
          { generateId: nextShotId }
        );
        if (isNumber(index) && index >= 0 && index <= shots.length) {
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
      "Edit an existing shot's `slug` (its short title), `action`, `camera`, `motion`, `durationSeconds` (which pins the shot to that length), or `status`. Omit a field to leave it unchanged.",
      z.object({
        target: targetParam,
        action: z.string().optional(),
        slug: z.string().optional(),
        camera: cameraParam.optional(),
        motion: z.string().optional(),
        durationSeconds: z.number().optional(),
        status: shotStatusEnum.optional()
      }),
      async ({ target, action, slug, camera, motion, durationSeconds, status }) => {
        const shot = resolveTarget(target as string);
        if (isString(action)) shot.action = action;
        if (isString(slug)) shot.slug = slug;
        if (camera !== undefined) shot.camera = camera as CameraDirection;
        if (isString(motion)) shot.motion = motion;
        if (isNumber(durationSeconds)) {
          shot.duration_seconds = durationSeconds;
          shot.duration_source = "manual";
        }
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
        shot.keyframe = { type: "image", uri: `fake://still/${shot.id}` };
        return { ok: true, shot: serialize(shot) };
      }
    ),

    tool(
      "ui_storyboard_generate_clip",
      "Render the final clip for a shot, animating its selected keyframe still. The shot must have a still. Kicks off the job and returns the shot; poll ui_storyboard_get_state for the resulting status.",
      z.object({ target: targetParam }),
      async ({ target }) => {
        const shot = resolveTarget(target as string);
        if (!shot.keyframe) {
          throw new Error(
            `Shot "${shot.id}" must have a still before a clip can be generated. Call ui_storyboard_generate_keyframe first.`
          );
        }
        shot.status = "rendered";
        shot.clip = { type: "video", uri: `fake://clip/${shot.id}` };
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
        if (!shot.clip) {
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
        const withClip = shots.filter((s) => s.clip);
        if (withClip.length === 0) {
          throw new Error(
            "No shot has a rendered clip yet. Generate at least one clip before assembling the timeline."
          );
        }
        const skippedShotIds = shots.filter((s) => !s.clip).map((s) => s.id);
        return {
          ok: true,
          sequenceId: "seq_1",
          clipCount: withClip.length,
          skippedShotIds
        };
      }
    ),

    tool(
      "ui_storyboard_extract_script",
      "Extract the board's spoken words into a linked script resource: every shot's dialogue and narration becomes a script line, and each shot keeps the ids of the lines it covers. Fails when the board already links a script — pass relink: true to re-project onto that script instead. Voice the lines from the script surface afterwards.",
      z.object({
        name: z
          .string()
          .optional()
          .describe("Name for the created script. Defaults to the board's name."),
        relink: z
          .boolean()
          .optional()
          .describe(
            "Re-project onto the script the board already links, instead of failing."
          )
      }),
      async ({ relink }) => {
        if (scriptId && relink !== true) {
          throw new Error(
            `This board already links script "${scriptId}". Pass relink: true to re-project onto it.`
          );
        }
        const play: Screenplay = {
          type: "screenplay",
          id: screenplayId,
          title,
          shots
        };
        // The same pure mapping the headless `extract_script_from_storyboard`
        // tool runs, so the eval cannot pass on a projection the tool refuses.
        const extracted = extractScriptFromScreenplay(play, []);
        const lines = extracted.document.sections.flatMap((s) => s.lines);
        if (lines.length === 0) {
          throw new Error(
            "No shot carries dialogue or narration, so there is nothing to extract."
          );
        }
        const textByLineId = new Map(lines.map((l) => [l.id, l.text]));
        for (const shot of shots) {
          const lineIds = extracted.lineIdsByShotId[shot.id];
          if (!lineIds || lineIds.length === 0) {
            delete shot.script_line_ids;
            delete shot.script_text_snapshot;
            continue;
          }
          shot.script_line_ids = lineIds;
          shot.script_text_snapshot = joinLineTexts(
            lineIds.map((id) => textByLineId.get(id) ?? "")
          );
        }
        scriptId = scriptId && relink === true ? scriptId : "script_1";
        scriptLineCount = lines.length;
        return {
          ok: true,
          scriptId,
          relinked: relink === true,
          lineCount: lines.length,
          castCount: extracted.document.cast.length,
          lines: lines.map((l) => ({
            id: l.id,
            speakerId: l.speakerId ?? null,
            text: l.text
          })),
          linkedShotIds: shots
            .filter((s) => (s.script_line_ids ?? []).length > 0)
            .map((s) => s.id)
        };
      }
    ),

    tool(
      "ui_storyboard_set_duration_source",
      'Choose where the named shots get their length. "audio" times each shot from the takes of the script lines it covers, so the clip is long enough to hold its voiceover (a shot with an unvoiced line keeps its own duration until the line is voiced). "manual" pins the shot to its own durationSeconds and audio never touches it. Only meaningful on a board linked to a script.',
      z.object({
        targets: z.union([targetParam, z.array(targetParam).min(1)]),
        source: z.enum(["audio", "manual"])
      }),
      async ({ targets, source }) => {
        const list = (
          Array.isArray(targets) ? targets : [targets]
        ) as string[];
        const touched = list.map((target) => {
          const shot = resolveTarget(target);
          shot.duration_source = source as "audio" | "manual";
          return serialize(shot);
        });
        return { ok: true, source, shots: touched };
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
        slug: s.slug,
        action: s.action,
        durationSeconds: s.duration_seconds,
        status: s.status,
        hasKeyframe: !!s.keyframe,
        hasClip: !!s.clip
      })),
      savable: saveIssues().length === 0,
      saveIssues: saveIssues(),
      scriptId,
      scriptLineCount,
      linkedShotIds: shots
        .filter((s) => (s.script_line_ids ?? []).length > 0)
        .map((s) => s.id)
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
- ui_storyboard_extract_script moves the board's dialogue and narration into a linked script, one line per shot's words.
- ui_storyboard_set_duration_source picks whether a shot's length comes from its script takes ("audio") or from its own durationSeconds ("manual").

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
    },
    {
      // `load-screenplay` hands the model a fully-formed screenplay and asks it
      // to copy it, so it never exercises the shape a model writes itself:
      // shots with a slug, an action and a camelCase duration, and no `type`,
      // `id`, `index` or `status`. That is the payload that lost a user's
      // board, and this case is the one that produces it.
      id: "author-screenplay",
      description:
        "Write a 3-shot screenplay from a brief and load it, with no example to copy",
      objective:
        "Write a short screenplay for the board's brief and load it onto the storyboard.",
      createBridge: () =>
        createStoryboardToolBridge({
          brief: "A 20-second teaser for a lighthouse keeper's last night."
        }),
      systemPrompt: STORYBOARD_SYSTEM_PROMPT,
      userPrompt:
        "Objective: The brief is 'A 20-second teaser for a lighthouse keeper's last night.' Write the screenplay yourself — do not ask for one and do not wait for a Director node. Then load it onto the storyboard with a single ui_storyboard_set_screenplay call. Give it a title, and give every shot a slug, an action, a camera framing and a duration in seconds. Use exactly 3 shots.",
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
            name: "hasThreeShots",
            detail: "the board does not hold 3 shots",
            test: (s) => s.shots.length === 3
          },
          {
            name: "durationsSurvived",
            detail: "a shot reached the board without its duration",
            test: (s) =>
              s.shots.length > 0 &&
              s.shots.every((sh) => sh.durationSeconds != null)
          },
          {
            // The check the old bridge could not make: it minted the fields a
            // model omits, so an unsavable screenplay looked loaded.
            name: "screenplayIsSavable",
            detail: "the loaded screenplay would be refused by the save",
            test: (s) => s.savable === true
          }
        ]
      }
    },
    {
      // The board already carries the words; the script is where they belong
      // once anyone means to voice them. What is scored is the link the
      // extraction leaves behind, not that a tool was called.
      id: "extract-script",
      description:
        "Extract a spoken board's dialogue and narration into a linked script",
      objective:
        "The board's shots already carry the spoken words. Extract them into a script linked to this board.",
      createBridge: () =>
        createStoryboardToolBridge({
          shots: [
            {
              action: "The keeper looks out over the water.",
              dialogue: "The light goes out tonight."
            },
            {
              action: "The keeper turns to the stairs.",
              narration: "He had kept it for forty years."
            }
          ]
        }),
      systemPrompt: STORYBOARD_SYSTEM_PROMPT,
      userPrompt:
        "Objective: Both shots on this board already carry spoken words. Extract them into a script linked to the board, so the lines can be voiced.",
      needsModelProviders: false,
      expect: {
        requiredTools: ["ui_storyboard_extract_script"],
        noErrorResults: true,
        minToolCalls: 1,
        maxToolCalls: 10,
        finalState: [
          {
            name: "boardLinksAScript",
            detail: "the board links no script",
            test: (s) => s.scriptId !== null
          },
          {
            name: "everyShotKeepsItsLines",
            detail: "a shot reached the script with no line references",
            test: (s) =>
              s.shots.length > 0 && s.linkedShotIds.length === s.shots.length
          },
          {
            name: "bothSpeechesBecameLines",
            detail: "the script does not hold a line per spoken shot",
            test: (s) => s.scriptLineCount >= 2
          }
        ]
      }
    }
  ] as const;
