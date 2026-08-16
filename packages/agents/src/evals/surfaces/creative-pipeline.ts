/**
 * Headless bridge for the long-horizon creative-pipeline tool-loop eval.
 *
 * Every other tool-loop suite scores one surface. This one scores the seam
 * between six phases of a single job — brief, ideation, sketch, storyboard,
 * timeline, review — because that is where a capable model stops looking
 * capable. A model can pass `sketch-tools` and `storyboard-tools` outright and
 * still lose the client's aspect ratio somewhere between them, or assemble a
 * cut that runs twice the length it was commissioned at and call it done.
 *
 * The four creative surfaces are *composed*, not reimplemented: this bridge
 * builds the real {@link createScriptToolBridge}, {@link createSketchToolBridge},
 * {@link createStoryboardToolBridge} and {@link createTimelineToolBridge} and
 * merges their tool arrays, so the model drives the same `ui_script_*` /
 * `ui_sketch_*` / `ui_storyboard_*` / `ui_timeline_*` contract those suites
 * already cover, and this file cannot drift from them.
 *
 * Three things are added on top.
 *
 * `ui_storyboard_assemble_timeline` is replaced. The storyboard bridge's own
 * version returns a plausible `sequenceId` and touches nothing, which is fine
 * when only the board is under test and useless here — the handoff *is* the
 * thing being measured. The replacement drives the timeline bridge's own tools
 * to lay one clip per rendered shot, so a later timeline edit acts on the
 * storyboard's output rather than on an unrelated blank sequence. When the
 * board was derived from the script it takes the *linked* path instead: the
 * pure `buildLinkedTimeline` cuts board and script into one sequence — shots
 * as long as the takes they cover, a voiceover clip per voiced line carrying
 * both linkage families — and the timeline bridge is reseeded with it, so the
 * cut the model goes on to edit is the jointly-assembled one.
 *
 * `ui_script_derive_storyboard` is replaced for the same reason. The script
 * bridge's own version scaffolds shots into a board only it can see; the
 * replacement lays those shots onto the shared storyboard bridge and records
 * which script lines each covers, which is the link the joint assemble reads.
 *
 * `validate_timeline` is the agent-side tool, not a `ui_*` one, and runs the
 * shipped `validateTimelineSequence` over whatever the timeline now holds. A
 * cut that assembles is not a cut that validates, and this is the only tool
 * here that can tell the two apart.
 *
 * The brief and review phases have no shipped `ui_*` surface, so their tools
 * are defined here and named `ui_brief_*` / `ui_review_*`. They are eval
 * instrumentation, NOT a frontend contract — nothing in `web/` implements them.
 * They exist because a brief passed only in the prompt cannot be distinguished
 * from a brief the model ignored, and a review with no way to report findings
 * cannot be told apart from no review at all.
 *
 * The planted defect is deliberate. `ui_storyboard_generate_clip` returns a
 * clip {@link RENDER_OVERSHOOT}× longer than the shot asked for, the way a
 * real text-to-video model that only emits fixed-length takes would. A model
 * that plans shot durations to exactly fill the brief and never re-measures
 * ships a cut that is over length. Catching that in review, and trimming, is
 * the difference between a run that scores and one that does not.
 */

import { z } from "zod";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import type { Shot } from "@nodetool-ai/protocol";
import { buildLinkedTimeline } from "@nodetool-ai/timeline";
import {
  validateTimelineSequence,
  type TimelineValidation
} from "@nodetool-ai/execution/timeline-debug";
import type { HeadlessTool } from "../tool-loop-bridge.js";
import type {
  HeadlessSurfaceBridge,
  ToolLoopEvalCase
} from "../tool-loop-eval.js";
import {
  createScriptToolBridge,
  type ScriptBridgeFinalState
} from "./script.js";
import {
  createSketchToolBridge,
  type SketchBridgeFinalState
} from "./sketch.js";
import {
  createStoryboardToolBridge,
  type StoryboardBridgeFinalState
} from "./storyboard.js";
import {
  createTimelineToolBridge,
  type TimelineBridgeFinalState
} from "./timeline.js";

/**
 * How much longer a rendered clip comes back than the shot requested. Video
 * models emit fixed-length takes, so a 3s shot lands at 4.05s and a cut planned
 * to the second overruns. Not a trap — a model that measures the assembled
 * sequence instead of trusting its plan sees it immediately.
 */
const RENDER_OVERSHOOT = 1.35;

/** Shot duration used when a shot is added without one, matching the surface default. */
const DEFAULT_SHOT_SECONDS = 3;

/** The commission the run has to satisfy. */
export interface CreativeBrief {
  client: string;
  product: string;
  objective: string;
  /** Hard constraint: the delivered sequence must be authored at this ratio. */
  aspectRatio: string;
  /** Hard constraint: total runtime of the assembled cut, in seconds. */
  maxDurationSeconds: number;
  /** Each must appear, case-insensitively, in at least one shot action. */
  mustFeature: string[];
  /** None may appear in any shot action or sketch layer name. */
  forbid: string[];
  deliverable: string;
}

/** One idea produced in the ideation phase. */
export interface CreativeConcept {
  id: string;
  title: string;
  premise: string;
}

/** A finding from the review phase. */
export interface ReviewNote {
  severity: "blocker" | "major" | "minor";
  note: string;
  targetClipId?: string;
}

/** Snapshot handed to the case's final-state predicates. */
export interface CreativePipelineFinalState {
  brief: CreativeBrief;
  /** The model called `ui_brief_get` before mutating any surface. */
  briefReadBeforeWork: boolean;
  concepts: CreativeConcept[];
  chosenConceptId: string | null;
  script: ScriptBridgeFinalState;
  sketch: SketchBridgeFinalState;
  storyboard: StoryboardBridgeFinalState;
  timeline: TimelineBridgeFinalState;
  /** The replaced assemble tool ran and laid clips into the timeline. */
  timelineAssembled: boolean;
  /** The board was derived from the script, so the two documents are linked. */
  scriptLinked: boolean;
  /** Script lines each board shot covers, keyed by shot id. */
  scriptLineIdsByShotId: Record<string, string[]>;
  /** Assembly took the joint path: one cut built from board and script together. */
  assembledLinked: boolean;
  /** Lines the joint assemble gave no clip — unvoiced, or on a skipped shot. */
  skippedLineIds: string[];
  /** What `validate_timeline` last said about the cut, or null when never run. */
  timelineValidation: TimelineValidation | null;
  /** Total runtime of the assembled cut, in seconds. */
  cutDurationSeconds: number;
  reviewNotes: ReviewNote[];
  /** The model inspected the assembled cut before reporting on it. */
  inspectedCut: boolean;
  /**
   * Media a live {@link MediaBackend} produced. Always empty in the default
   * headless mode, so no predicate depends on it — a case that asserted on
   * artifacts would fail every CI run.
   */
  artifacts: GeneratedArtifact[];
  /**
   * Timeline-mutating calls made after the cut was assembled. Zero means the
   * model shipped the sequence exactly as the renderer handed it over.
   *
   * Deliberately keyed on assembly rather than on the review notes. An earlier
   * version counted edits after the first note and so required the model to
   * report before fixing. A live sonnet run assembled at 16.20s, trimmed and
   * ripple-moved down to 12.00s, verified with ui_review_get_cut and *then*
   * filed notes as a compliance sign-off — a complete review loop that scored
   * as "review changed nothing". Measuring from assembly accepts either order.
   */
  editsAfterAssembly: number;
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
 * Map a severity word onto the three the state model keeps.
 *
 * The enum is this harness's vocabulary, not the model's. Rejecting "critical"
 * as a severity fails the run on a tool-design choice rather than on anything
 * about the cut, so the common synonyms are accepted and folded in. Anything
 * unrecognised lands on "major": a note the model bothered to file is not a
 * nitpick by default.
 */
function normaliseSeverity(raw: string): ReviewNote["severity"] {
  const s = raw.trim().toLowerCase();
  if (["blocker", "critical", "fatal", "high", "severe"].includes(s)) {
    return "blocker";
  }
  if (["minor", "low", "nit", "trivial", "cosmetic"].includes(s)) {
    return "minor";
  }
  return "major";
}

/** Tools that change the cut — used to tell a real review from a reported one. */
const TIMELINE_MUTATORS = new Set([
  "ui_timeline_add_track",
  "ui_timeline_add_text_clip",
  "ui_timeline_add_shape_clip",
  "ui_timeline_generate_clip",
  "ui_timeline_split_clip",
  "ui_timeline_trim_clip",
  "ui_timeline_move_clip",
  "ui_timeline_delete_clip",
  "ui_timeline_duplicate_clip",
  "ui_timeline_set_clip_params",
  "ui_timeline_set_clip_binding",
  "ui_timeline_animate_clip",
  "ui_timeline_clear_animations"
]);

/** Surface tools that count as "work" for the brief-read-first check. */
const WORK_PREFIXES = [
  "ui_script_",
  "ui_sketch_",
  "ui_storyboard_",
  "ui_timeline_"
];

/** One piece of media a live backend actually produced. */
export interface GeneratedArtifact {
  kind: "style" | "keyframe" | "clip";
  /** Absolute path on disk, or undefined when the generation failed. */
  path?: string;
  prompt: string;
  shotId?: string;
  bytes?: number;
  error?: string;
}

/**
 * Optional sink that turns the faked generate/render calls into real media.
 *
 * The suite is headless by default: `ui_sketch_generate` and the storyboard's
 * keyframe/clip jobs flip a status flag and produce nothing, which is what
 * makes the eval runnable in CI for the price of the agent loop alone. Supply
 * a backend and the same tool calls additionally hit a real provider, so the
 * run leaves actual stills and clips on disk without changing a single tool
 * contract or predicate.
 *
 * Kept as an interface here rather than a fal implementation because
 * `packages/agents` has no fal dependency and should not grow one for an
 * opt-in path — see `scripts/dump-creative-run.ts` for the fal wiring.
 *
 * Known divergence in live mode: the timeline still lays clips at the
 * simulated {@link RENDER_OVERSHOOT}, so the scored runtime is not the runtime
 * of the files on disk. A live run against LTX asked for 3s takes and got
 * 4.84s ones — a 1.61× overshoot against the 1.35× modelled here, so the
 * planted defect is if anything conservative. Closing the gap means feeding
 * the delivered duration back into assembly, which needs the backend to
 * report it; until then, treat live media as artifacts the run produced
 * rather than as the thing being measured.
 */
export interface MediaBackend {
  image(prompt: string, label: string): Promise<{ path: string; bytes: Uint8Array }>;
  video(
    from: Uint8Array,
    prompt: string,
    label: string,
    durationSeconds: number
  ): Promise<{ path: string; bytes: Uint8Array }>;
}

export interface CreativePipelineInitialState {
  brief: CreativeBrief;
  /** Omit for the headless default; supply to produce real media. */
  media?: MediaBackend;
}

/**
 * Build the composite bridge: the three real creative surfaces plus brief and
 * review instrumentation, sharing one project state.
 */
export function createCreativePipelineBridge(
  initial: CreativePipelineInitialState
): HeadlessSurfaceBridge<CreativePipelineFinalState> {
  const brief = initial.brief;
  const media = initial.media;
  const artifacts: GeneratedArtifact[] = [];

  const script = createScriptToolBridge({ title: brief.product });
  const sketch = createSketchToolBridge({
    name: `${brief.product} — style frame`,
    layers: [{ name: "Background" }]
  });
  const storyboard = createStoryboardToolBridge({
    title: brief.product,
    brief: brief.objective,
    aspectRatio: brief.aspectRatio
  });
  // Reassigned by the linked assemble, which reseeds the editor with the cut
  // `buildLinkedTimeline` produced rather than replaying it through the tools
  // (a replay would drop the script/board ids every clip carries). Every
  // timeline tool below dispatches through the current instance, so the swap
  // is invisible to the model.
  let timeline = createTimelineToolBridge({});

  let briefRead = false;
  let briefReadBeforeWork = false;
  let anyWorkDone = false;
  const concepts: CreativeConcept[] = [];
  let chosenConceptId: string | null = null;
  let timelineAssembled = false;
  let inspectedCut = false;
  const reviewNotes: ReviewNote[] = [];
  let toolSeq = 0;
  let editsAfterAssembly = 0;
  let conceptSeq = 0;
  let scriptLinked = false;
  let assembledLinked = false;
  let skippedLineIds: string[] = [];
  let timelineValidation: TimelineValidation | null = null;

  /** Script lines each board shot covers — the link the joint assemble reads. */
  const scriptLineIdsByShotId = new Map<string, string[]>();

  /** Requested duration per shot id, since the board's snapshot omits it. */
  const shotSeconds = new Map<string, number>();

  const byName = (b: HeadlessSurfaceBridge<unknown>, name: string) => {
    const found = b.tools.find((t) => t.name === name);
    if (!found) throw new Error(`composite bridge: missing tool ${name}`);
    return found;
  };

  interface AssembleResult {
    sequenceId: string;
    clipCount: number;
    skippedShotIds: string[];
    durationSeconds: number;
    linked: boolean;
    skippedLineIds?: string[];
  }

  /**
   * The board as the pure assemblers want it: wire `Shot` objects carrying the
   * rendered clip and the script lines each shot covers. The storyboard bridge
   * projects its shots for its own answers, so this rebuilds the fields joint
   * assembly reads from that projection.
   */
  function linkedShots(): Shot[] {
    return storyboard.finalState().shots.map((s) => ({
      type: "shot",
      id: s.id,
      index: s.index,
      action: s.action,
      status: s.status,
      duration_seconds: s.durationSeconds,
      clip: s.hasClip
        ? { type: "video" as const, asset_id: `asset_clip_${s.id}` }
        : undefined,
      script_line_ids: scriptLineIdsByShotId.get(s.id)
    }));
  }

  /**
   * Cut board and script into one sequence with the shipped
   * `buildLinkedTimeline`, then reseed the timeline editor with the result.
   *
   * Shot length here is the length of the takes the shot covers, so the
   * {@link RENDER_OVERSHOOT} the unlinked path models does not apply: on a
   * linked board the audio decides, which is the whole point of the link.
   */
  function assembleLinked(): AssembleResult {
    const shots = linkedShots();
    const assembled = buildLinkedTimeline({
      boardId: "board_1",
      shots,
      script: script.finalState().assembly
    });
    const { fps, width, height } = timeline.finalState();
    timeline = createTimelineToolBridge({
      sequence: {
        fps,
        width,
        height,
        tracks: assembled.tracks,
        clips: assembled.clips
      }
    });
    timelineAssembled = true;
    assembledLinked = true;
    skippedLineIds = assembled.skippedLineIds;
    return {
      sequenceId: "seq_1",
      clipCount: assembled.clips.length,
      skippedShotIds: assembled.skippedShotIds,
      skippedLineIds: assembled.skippedLineIds,
      durationSeconds: assembled.durationMs / 1000,
      linked: true
    };
  }

  /**
   * Lay one timeline clip per rendered shot, end to end, by driving the
   * timeline bridge's own tools — so the assembled cut is real state a later
   * trim or delete operates on.
   */
  async function assembleTimeline(): Promise<AssembleResult> {
    const board = storyboard.finalState();
    const rendered = board.shots.filter((s) => s.hasClip);
    if (rendered.length === 0) {
      throw new Error(
        "No shot has a rendered clip yet. Generate at least one clip before assembling the timeline."
      );
    }
    if (scriptLinked) return assembleLinked();

    const addTrack = byName(timeline, "ui_timeline_add_track");
    const generate = byName(timeline, "ui_timeline_generate_clip");
    const track = (await addTrack.execute({
      type: "video",
      name: "Programme"
    })) as { track?: { id?: string } };
    const trackId = track?.track?.id;

    let startMs = 0;
    for (const shot of rendered) {
      const requested = shotSeconds.get(shot.id) ?? DEFAULT_SHOT_SECONDS;
      // What the renderer actually delivered, not what the shot asked for.
      const durationMs = Math.round(requested * RENDER_OVERSHOOT * 1000);
      await generate.execute({
        kind: "text-to-video",
        prompt: shot.action,
        trackId,
        startMs,
        durationMs,
        autoGenerate: false
      });
      startMs += durationMs;
    }

    timelineAssembled = true;
    return {
      sequenceId: "seq_1",
      clipCount: rendered.length,
      skippedShotIds: board.shots.filter((s) => !s.hasClip).map((s) => s.id),
      durationSeconds: startMs / 1000,
      linked: false
    };
  }

  const cutDurationSeconds = () => {
    const { clips } = timeline.finalState();
    if (clips.length === 0) return 0;
    return (
      Math.max(...clips.map((c) => c.startMs + c.durationMs), 0) / 1000
    );
  };

  const briefTools: HeadlessTool[] = [
    tool(
      "ui_brief_get",
      "Read the client brief for this job: objective, deliverable, and the hard constraints (aspect ratio, maximum runtime, elements that must appear, elements that are forbidden). Call this first — the constraints are not repeated anywhere else.",
      z.object({}),
      async () => {
        briefRead = true;
        if (!anyWorkDone) briefReadBeforeWork = true;
        return { ok: true, brief };
      }
    ),

    tool(
      "ui_brief_propose_concepts",
      "Record the distinct creative concepts considered for this brief. Each needs a short title and a one-sentence premise. Submit at least three genuinely different directions before choosing one — variations on a single idea do not count as alternatives.",
      z.object({
        concepts: z
          .array(
            z.object({
              title: z.string(),
              premise: z.string()
            })
          )
          .min(1)
      }),
      async ({ concepts: proposed }) => {
        const list = proposed as { title: string; premise: string }[];
        for (const c of list) {
          concepts.push({
            id: `concept_${++conceptSeq}`,
            title: c.title,
            premise: c.premise
          });
        }
        return { ok: true, concepts };
      }
    ),

    tool(
      "ui_brief_choose_concept",
      "Commit to one of the proposed concepts by id. Everything after this — the style frame, the shots, the cut — should serve the chosen concept.",
      z.object({ conceptId: z.string() }),
      async ({ conceptId }) => {
        const id = conceptId as string;
        const found = concepts.find((c) => c.id === id);
        if (!found) {
          throw new Error(
            `No concept with id ${id}. Known: ${concepts.map((c) => c.id).join(", ") || "(none proposed yet)"}`
          );
        }
        chosenConceptId = id;
        return { ok: true, chosen: found };
      }
    )
  ];

  const reviewTools: HeadlessTool[] = [
    tool(
      "ui_review_get_cut",
      "Inspect the assembled cut as delivered: every clip in order with its real start and duration, and the total runtime. Rendered clips do not always come back the length that was requested, so measure here rather than trusting the shot plan.",
      z.object({}),
      async () => {
        const { clips } = timeline.finalState();
        inspectedCut = true;
        const ordered = [...clips].sort((a, b) => a.startMs - b.startMs);
        return {
          ok: true,
          totalDurationSeconds: cutDurationSeconds(),
          aspectRatioConstraint: brief.aspectRatio,
          maxDurationSeconds: brief.maxDurationSeconds,
          clips: ordered.map((c) => ({
            id: c.id,
            name: c.name,
            prompt: c.prompt,
            startSeconds: c.startMs / 1000,
            durationSeconds: c.durationMs / 1000
          }))
        };
      }
    ),

    tool(
      "ui_review_submit_notes",
      "Record the findings from reviewing the assembled cut. Each note needs a severity (blocker, major or minor — critical/high/medium/low are accepted and mapped) and a description, and may name the clip it applies to. Submitting notes does not change the cut — fix anything you raise as a blocker with the ui_timeline_* tools afterwards.",
      z.object({
        notes: z
          .array(
            z.object({
              severity: z.string(),
              note: z.string(),
              targetClipId: z.string().nullish()
            })
          )
          .min(1)
      }),
      async ({ notes }) => {
        const list = notes as {
          severity: string;
          note: string;
          targetClipId?: string | null;
        }[];
        for (const n of list) {
          reviewNotes.push({
            severity: normaliseSeverity(n.severity),
            note: n.note,
            targetClipId: n.targetClipId ?? undefined
          });
        }
        return { ok: true, noteCount: reviewNotes.length };
      }
    )
  ];

  /**
   * Derive the board from the script and record the link.
   *
   * The script bridge's own derive scaffolds shots onto a board only it can
   * see. This runs that scaffold — so the line→shot mapping is still the pure
   * `deriveShotScaffold` every surface uses — and then lays each scaffolded
   * shot onto the shared storyboard bridge, keeping the line ids it covers.
   * That map is what {@link assembleLinked} reads.
   */
  async function deriveStoryboard(args: Record<string, unknown>): Promise<{
    ok: true;
    storyboardId: string;
    shots: { id: string; scriptLineIds: string[]; action: string }[];
  }> {
    const derived = (await byName(
      script,
      "ui_script_derive_storyboard"
    ).execute(args)) as {
      storyboardId: string;
      shots: { scriptLineIds: string[]; text: string }[];
    };
    const addShot = byName(storyboard, "ui_storyboard_add_shot");
    const placed: { id: string; scriptLineIds: string[]; action: string }[] = [];
    for (const scaffold of derived.shots) {
      // The design's headless fallback: with no director pass the shot's
      // action is the line text it covers, status planned.
      const action = scaffold.text;
      const result = (await addShot.execute({ action })) as {
        shot: { id: string };
      };
      scriptLineIdsByShotId.set(result.shot.id, scaffold.scriptLineIds);
      placed.push({
        id: result.shot.id,
        scriptLineIds: scaffold.scriptLineIds,
        action
      });
    }
    scriptLinked = true;
    return { ok: true, storyboardId: derived.storyboardId, shots: placed };
  }

  const deriveTool = tool(
    "ui_script_derive_storyboard",
    "Create a storyboard whose shots cover this script's lines and open it: one shot per line in reading order, each carrying the ids of the lines it covers and an action projected from them. The board is linked to the script from here on, so assembling it cuts words and pictures together. Direct or render the shots from the storyboard surface.",
    z.object({
      name: z
        .string()
        .optional()
        .describe("Name for the created storyboard. Defaults to the script's.")
    }),
    deriveStoryboard
  );

  const validateTool = tool(
    "validate_timeline",
    "Check the assembled sequence without rendering it: tracks and clips a render would refuse, timings that cannot lay out, animation presets that do not exist. Returns errors and warnings. Call it on the delivered cut — a sequence that assembled is not necessarily a sequence that validates.",
    z.object({}),
    async () => {
      const { fps, width, height, documentTracks, documentClips } =
        timeline.finalState();
      timelineValidation = validateTimelineSequence(
        { tracks: documentTracks, clips: documentClips, markers: [] },
        { fps, width, height }
      );
      // `ok` here is the validator's verdict, not "the call succeeded" — a cut
      // that fails validation is a successful call with a negative answer.
      return { ...timelineValidation };
    }
  );

  // Compose: real surface tools, minus the two the surfaces can only fake in
  // isolation (assemble and derive, replaced below so the handoffs actually
  // move state) and the script's own send-to-timeline, which would open a
  // second sequence nothing else in this bridge can see.
  const surfaceTools: HeadlessTool[] = [
    ...script.tools.filter(
      (t) =>
        t.name !== "ui_script_derive_storyboard" &&
        t.name !== "ui_script_send_to_timeline"
    ),
    ...sketch.tools,
    ...storyboard.tools.filter(
      (t) => t.name !== "ui_storyboard_assemble_timeline"
    ),
    // Dispatch by name at call time: the linked assemble swaps the timeline
    // bridge underneath, and a captured `execute` would keep editing the cut
    // that was replaced.
    ...timeline.tools.map((t) => ({
      ...t,
      execute: (args: Record<string, unknown>) =>
        byName(timeline, t.name).execute(args)
    }))
  ];

  const assembleTool = tool(
    "ui_storyboard_assemble_timeline",
    "Assemble the storyboard's rendered shots into a timeline sequence and open it in the timeline editor. Shot clips are laid end to end in order. Shots without a rendered clip are skipped (returned in skippedShotIds). The delivered clip lengths are what the renderer produced, which is not necessarily what each shot requested. When the board was derived from a script, the cut is assembled jointly instead: each shot runs as long as the takes it covers, every voiced line gets its own voiceover clip, and lines that got none are returned in skippedLineIds.",
    z.object({}),
    async () => {
      const result = await assembleTimeline();
      return { ok: true, ...result };
    }
  );

  /** Keyframe bytes per shot, so a clip can be animated from its own still. */
  const keyframeBytes = new Map<string, Uint8Array>();

  const shotAction = (id: string) =>
    storyboard.finalState().shots.find((s) => s.id === id)?.action ?? "";

  /**
   * Mirror a faked generate/render onto the live backend.
   *
   * A generation failure is recorded on the artifact and never thrown: the
   * model is being scored on directing the pipeline, and failing its run
   * because fal rate-limited would measure the weather. It is not swallowed
   * either — the error lands in the artifact list and in the run report.
   */
  async function captureMedia(
    name: string,
    args: Record<string, unknown>,
    result: unknown
  ): Promise<void> {
    if (!media) return;
    const record = async (
      kind: GeneratedArtifact["kind"],
      prompt: string,
      shotId: string | undefined,
      run: () => Promise<{ path: string; bytes: Uint8Array }>
    ) => {
      try {
        const out = await run();
        artifacts.push({ kind, path: out.path, prompt, shotId, bytes: out.bytes.length });
        if (kind === "keyframe" && shotId) keyframeBytes.set(shotId, out.bytes);
      } catch (err) {
        artifacts.push({ kind, prompt, shotId, error: (err as Error).message });
      }
    };

    if (name === "ui_sketch_generate") {
      const prompt = String(args.prompt ?? "");
      if (prompt) await record("style", prompt, undefined, () => media.image(prompt, "style-frame"));
      return;
    }
    const shotId = (result as { shot?: { id?: string } })?.shot?.id;
    if (!shotId) return;

    if (name === "ui_storyboard_generate_keyframe") {
      const prompt = shotAction(shotId);
      await record("keyframe", prompt, shotId, () => media.image(prompt, `keyframe-${shotId}`));
      return;
    }
    if (name === "ui_storyboard_generate_clip") {
      const still = keyframeBytes.get(shotId);
      if (!still) {
        artifacts.push({
          kind: "clip",
          prompt: shotAction(shotId),
          shotId,
          error: "no keyframe was generated for this shot to animate"
        });
        return;
      }
      const prompt = shotAction(shotId);
      const seconds = shotSeconds.get(shotId) ?? DEFAULT_SHOT_SECONDS;
      await record("clip", prompt, shotId, () =>
        media.video(still, prompt, `clip-${shotId}`, seconds)
      );
    }
  }

  /**
   * Wrap every surface tool to maintain the cross-phase bookkeeping the
   * predicates read: which phase the model is in, what each shot's requested
   * duration was, and whether the assembled cut was revised.
   */
  const instrument = (t: HeadlessTool): HeadlessTool => ({
    ...t,
    execute: async (args) => {
      toolSeq += 1;
      if (WORK_PREFIXES.some((p) => t.name.startsWith(p))) anyWorkDone = true;
      if (timelineAssembled && TIMELINE_MUTATORS.has(t.name)) {
        editsAfterAssembly += 1;
      }
      const result = await t.execute(args);

      // The board snapshot drops durationSeconds, so capture it from the call
      // that set it; assembly needs it to lay clips at the right length.
      if (
        t.name === "ui_storyboard_add_shot" ||
        t.name === "ui_storyboard_update_shot"
      ) {
        const shot = (result as { shot?: { id?: string } })?.shot;
        const seconds = args
          ?.durationSeconds;
        if (shot?.id && typeof seconds === "number") {
          shotSeconds.set(shot.id, seconds);
        }
      }

      if (media) await captureMedia(t.name, args, result);
      return result;
    }
  });

  const tools = [
    ...briefTools,
    ...surfaceTools.map(instrument),
    instrument(assembleTool),
    instrument(deriveTool),
    validateTool,
    ...reviewTools
  ];

  return {
    tools,
    finalState: () => ({
      brief,
      briefReadBeforeWork: briefRead && briefReadBeforeWork,
      concepts: [...concepts],
      chosenConceptId,
      script: script.finalState(),
      sketch: sketch.finalState(),
      storyboard: storyboard.finalState(),
      timeline: timeline.finalState(),
      timelineAssembled,
      scriptLinked,
      scriptLineIdsByShotId: Object.fromEntries(scriptLineIdsByShotId),
      assembledLinked,
      skippedLineIds: [...skippedLineIds],
      timelineValidation,
      cutDurationSeconds: cutDurationSeconds(),
      reviewNotes: [...reviewNotes],
      inspectedCut,
      artifacts: [...artifacts],
      editsAfterAssembly
    })
  };
}

const CREATIVE_PIPELINE_SYSTEM_PROMPT = `You are a creative director running a commissioned video job end to end through UI tools.

A narrated job starts from the words: write the script with the ui_script_* tools, give the cast a voice and voice every line, then call ui_script_derive_storyboard to turn it into a linked board — one shot per line. Rendering and assembly are the same tools as any other job, except that an assembled linked board cuts the words in with the pictures, and validate_timeline checks the sequence that comes out.

Work the job in phases, and finish each before starting the next:

1. BRIEF — call ui_brief_get. It carries hard constraints that appear nowhere else.
2. IDEATION — propose at least three genuinely different directions with ui_brief_propose_concepts, then commit to one with ui_brief_choose_concept.
3. STYLE FRAME — build a look with the ui_sketch_* tools: layers, colour, and a generated image the shots can follow.
4. STORYBOARD — write the shots with ui_storyboard_add_shot, give each a camera framing and a duration, then take each to a rendered clip via ui_storyboard_generate_keyframe and ui_storyboard_generate_clip.
5. CUT — assemble with ui_storyboard_assemble_timeline, then shape it with the ui_timeline_* tools.
6. REVIEW — measure the delivered cut with ui_review_get_cut, report what you find with ui_review_submit_notes, and then fix anything you called a blocker.

The brief's constraints bind the finished cut, not your plan for it. Rendered clips do not always come back the length that was asked for, so measure the assembled sequence rather than assuming it matches the shot durations.

Call one tool at a time and use its result before the next call. When the job is delivered and every blocker you raised is fixed, STOP calling tools and give a one-line summary.`;

/** The commission driving the full-pipeline case. */
export const LANTERN_BRIEF: CreativeBrief = {
  client: "Ostara Coffee",
  product: "Single-Origin Cold Brew",
  objective:
    "A social spot that sells the origin story of the beans, not the packaging.",
  aspectRatio: "9:16",
  maxDurationSeconds: 12,
  mustFeature: ["hands", "sunrise"],
  forbid: ["logo"],
  deliverable: "One vertical cut for social, under 12 seconds."
};

/** A second commission with tighter runtime, used by the constraint case. */
export const ATLAS_BRIEF: CreativeBrief = {
  client: "Atlas Trailrunners",
  product: "All-Weather Trail Shoe",
  objective: "Show the shoe surviving conditions that stop other shoes.",
  aspectRatio: "16:9",
  maxDurationSeconds: 8,
  mustFeature: ["mud"],
  forbid: ["treadmill"],
  deliverable: "One landscape cut for pre-roll, under 8 seconds."
};

/**
 * A narrated commission, used by the linked case.
 *
 * Its runtime ceiling is generous on purpose: a linked cut is as long as the
 * voiced takes make it, so a runtime predicate here would score how many words
 * the model wrote rather than whether it carried the link through.
 */
export const TIDEWATCH_BRIEF: CreativeBrief = {
  client: "Tidewatch Trust",
  product: "Estuary Restoration",
  objective: "A narrated piece about a river mouth coming back to life.",
  aspectRatio: "16:9",
  maxDurationSeconds: 60,
  mustFeature: [],
  forbid: [],
  deliverable: "One narrated cut, words and pictures assembled together."
};

const actionsOf = (s: CreativePipelineFinalState) =>
  s.storyboard.shots.map((sh) => sh.action.toLowerCase()).join("   ");

const featuresCovered = (s: CreativePipelineFinalState) => {
  const hay = actionsOf(s);
  return s.brief.mustFeature.every((f) => hay.includes(f.toLowerCase()));
};

const forbiddenAvoided = (s: CreativePipelineFinalState) => {
  const hay = `${actionsOf(s)}   ${s.sketch.layers
    .map((l) => l.name.toLowerCase())
    .join("   ")}`;
  return s.brief.forbid.every((f) => !hay.includes(f.toLowerCase()));
};

export const CREATIVE_PIPELINE_TOOL_LOOP_CASES: readonly ToolLoopEvalCase<CreativePipelineFinalState>[] =
  [
    {
      id: "full-pipeline",
      description:
        "Run a commission through all six phases and deliver a cut inside the brief's runtime",
      objective:
        "Take the commissioned job from brief to delivered cut. Read the brief, propose and choose a concept, build a style frame, storyboard and render the shots, assemble the cut, then review the delivered sequence and fix what you find.",
      createBridge: () =>
        createCreativePipelineBridge({ brief: LANTERN_BRIEF }),
      systemPrompt: CREATIVE_PIPELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_brief_get",
          "ui_brief_propose_concepts",
          "ui_brief_choose_concept",
          "ui_sketch_generate",
          "ui_storyboard_add_shot",
          "ui_storyboard_generate_keyframe",
          "ui_storyboard_generate_clip",
          "ui_storyboard_assemble_timeline",
          "ui_review_get_cut",
          "ui_review_submit_notes"
        ],
        ordering: [
          ["ui_brief_get", "ui_brief_propose_concepts"],
          ["ui_brief_propose_concepts", "ui_brief_choose_concept"],
          ["ui_brief_choose_concept", "ui_storyboard_add_shot"],
          ["ui_storyboard_add_shot", "ui_storyboard_generate_keyframe"],
          ["ui_storyboard_generate_keyframe", "ui_storyboard_generate_clip"],
          ["ui_storyboard_generate_clip", "ui_storyboard_assemble_timeline"],
          ["ui_storyboard_assemble_timeline", "ui_review_get_cut"],
          ["ui_review_get_cut", "ui_review_submit_notes"]
        ],
        noErrorResults: true,
        // Measured, not guessed. The scripted optimum in the harness test is
        // 18 calls; a live claude_agent_sdk/sonnet run spent 97 on the sibling
        // case and passed everything else. The first ceiling here was 90 and
        // failed that run on the budget alone, which measures the guess rather
        // than the model. 150 leaves room for state polling and still catches
        // a model that loops.
        minToolCalls: 15,
        maxToolCalls: 150,
        finalState: [
          {
            name: "briefReadFirst",
            detail: "started editing a surface before reading the brief",
            test: (s) => s.briefReadBeforeWork
          },
          {
            name: "threeDistinctConcepts",
            detail: "fewer than 3 concepts, or duplicate titles",
            test: (s) =>
              s.concepts.length >= 3 &&
              new Set(s.concepts.map((c) => c.title.trim().toLowerCase()))
                .size >= 3
          },
          {
            name: "conceptChosen",
            detail: "no concept was committed to",
            test: (s) => s.chosenConceptId !== null
          },
          {
            name: "styleFrameBuilt",
            detail: "no generated sketch layer to anchor the look",
            test: (s) => s.sketch.layers.some((l) => l.hasBinding)
          },
          {
            name: "shotsRendered",
            detail: "fewer than 3 shots reached a rendered clip",
            test: (s) =>
              s.storyboard.shots.filter((sh) => sh.hasClip).length >= 3
          },
          {
            name: "timelineAssembled",
            detail: "the storyboard was never cut into a timeline",
            test: (s) => s.timelineAssembled && s.timeline.clips.length > 0
          },
          {
            name: "cutInspected",
            detail: "reviewed without measuring the delivered cut",
            test: (s) => s.inspectedCut
          },
          {
            name: "reviewRaisedFindings",
            detail: "no review notes were submitted",
            test: (s) => s.reviewNotes.length > 0
          },
          {
            name: "cutRevisedAfterAssembly",
            detail:
              "the cut was shipped exactly as the renderer handed it over — nothing was revised",
            test: (s) => s.editsAfterAssembly > 0
          },
          {
            name: "withinBriefRuntime",
            detail:
              "the delivered cut runs longer than the brief allows (clips render longer than requested)",
            test: (s) =>
              s.cutDurationSeconds > 0 &&
              s.cutDurationSeconds <= s.brief.maxDurationSeconds
          },
          {
            name: "mustFeatureCovered",
            detail: "a required element never appears in any shot action",
            test: featuresCovered
          },
          {
            name: "forbiddenAvoided",
            detail: "a forbidden element appears in a shot action or layer name",
            test: forbiddenAvoided
          }
        ]
      }
    },

    {
      id: "brief-constraints-hold",
      description:
        "Carry a tight 8s runtime and a forbidden element through every phase without drift",
      objective:
        "Deliver the commissioned cut. The brief's constraints are hard: the finished sequence must satisfy every one of them, including the runtime ceiling measured on the assembled cut.",
      createBridge: () => createCreativePipelineBridge({ brief: ATLAS_BRIEF }),
      systemPrompt: CREATIVE_PIPELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_brief_get",
          "ui_storyboard_assemble_timeline",
          "ui_review_get_cut"
        ],
        noErrorResults: true,
        // A live sonnet run delivered this case correctly in 97 calls.
        minToolCalls: 12,
        maxToolCalls: 130,
        finalState: [
          {
            name: "withinBriefRuntime",
            detail:
              "delivered cut overruns the 8s ceiling — the plan fit, the render did not",
            test: (s) =>
              s.cutDurationSeconds > 0 &&
              s.cutDurationSeconds <= s.brief.maxDurationSeconds
          },
          {
            name: "mustFeatureCovered",
            detail: "'mud' never appears in any shot action",
            test: featuresCovered
          },
          {
            name: "forbiddenAvoided",
            detail: "'treadmill' appears despite being ruled out in the brief",
            test: forbiddenAvoided
          },
          {
            name: "cutDelivered",
            detail: "no assembled timeline to deliver",
            test: (s) => s.timelineAssembled && s.timeline.clips.length > 0
          }
        ]
      }
    },

    {
      id: "review-catches-overrun",
      description:
        "Assemble a pre-storyboarded job, then detect and trim the render overrun in review",
      objective:
        "The storyboard is already written and every shot is rendered. Assemble the cut, measure what was actually delivered, report any problem you find, and fix it so the sequence satisfies the brief.",
      createBridge: () => {
        const bridge = createCreativePipelineBridge({ brief: LANTERN_BRIEF });
        return bridge;
      },
      systemPrompt: `${CREATIVE_PIPELINE_SYSTEM_PROMPT}

The storyboard phase is already done for this job: add the shots that were planned (four shots of three seconds each), render them, and go straight to assembling and reviewing the cut. Do not spend calls on the sketch surface.`,
      expect: {
        requiredTools: [
          "ui_storyboard_assemble_timeline",
          "ui_review_get_cut",
          "ui_review_submit_notes"
        ],
        forbiddenTools: ["ui_sketch_generate"],
        ordering: [
          ["ui_storyboard_assemble_timeline", "ui_review_get_cut"],
          ["ui_review_get_cut", "ui_review_submit_notes"]
        ],
        noErrorResults: true,
        minToolCalls: 8,
        maxToolCalls: 70,
        finalState: [
          {
            name: "overrunJudgedSerious",
            detail:
              "the cut overran the brief but no note treated it as more than a nitpick",
            // Deliberately not a keyword match on the note text. An earlier
            // version grepped the prose for "runtime"/"duration"/"long" and
            // scored a run that found the overrun, trimmed four clips and
            // ripple-moved three to close the gaps as a miss, purely on
            // wording. Severity is the model's own judgement of the finding
            // and survives paraphrase.
            test: (s) =>
              s.reviewNotes.some(
                (n) => n.severity === "blocker" || n.severity === "major"
              )
          },
          {
            name: "cutRevisedAfterAssembly",
            detail: "the assembled cut was never revised",
            test: (s) => s.editsAfterAssembly > 0
          },
          {
            name: "withinBriefRuntime",
            detail: "cut still overruns the brief after review",
            test: (s) =>
              s.cutDurationSeconds > 0 &&
              s.cutDurationSeconds <= s.brief.maxDurationSeconds
          }
        ]
      }
    },

    {
      // The link is the thing under test, and it is only observable at the
      // end: a run can call every tool in the right order and still deliver a
      // cut whose voiceover clips point at nothing, or a board whose shots
      // lost the lines they cover. So the predicates read the assembled
      // document — both linkage families on every voiceover clip — rather
      // than the calls that produced it, and the last one asks the shipped
      // validator whether the cut would survive a render at all.
      id: "script-to-linked-cut",
      description:
        "Write and voice a script, derive a linked board from it, render it, assemble words and pictures together, and validate the cut",
      objective:
        "This is a narrated piece. Write a short narration of at least three lines, give the narrator a voice and voice every line, then derive a storyboard from the script. Render a keyframe and a clip for every shot, assemble the cut, and validate the assembled sequence.",
      createBridge: () =>
        createCreativePipelineBridge({ brief: TIDEWATCH_BRIEF }),
      systemPrompt: CREATIVE_PIPELINE_SYSTEM_PROMPT,
      expect: {
        requiredTools: [
          "ui_script_add_speaker",
          "ui_script_add_line",
          "ui_script_derive_storyboard",
          "ui_storyboard_generate_keyframe",
          "ui_storyboard_generate_clip",
          "ui_storyboard_assemble_timeline",
          "validate_timeline"
        ],
        forbiddenTools: ["ui_sketch_generate"],
        ordering: [
          ["ui_script_add_line", "ui_script_derive_storyboard"],
          ["ui_script_derive_storyboard", "ui_storyboard_generate_keyframe"],
          ["ui_storyboard_generate_keyframe", "ui_storyboard_generate_clip"],
          ["ui_storyboard_generate_clip", "ui_storyboard_assemble_timeline"],
          ["ui_storyboard_assemble_timeline", "validate_timeline"]
        ],
        noErrorResults: true,
        // The scripted optimum in the harness test is 15 calls. The ceiling
        // matches the sibling cases' allowance for state polling.
        minToolCalls: 10,
        maxToolCalls: 130,
        finalState: [
          {
            name: "scriptWritten",
            detail: "fewer than 3 lines of narration were written",
            test: (s) => s.script.lines.length >= 3
          },
          {
            name: "everyLineVoiced",
            detail:
              "a line reached assembly unvoiced, so its words are not in the cut",
            test: (s) =>
              s.script.lines.length > 0 &&
              s.script.lines.every((l) => l.status === "voiced")
          },
          {
            name: "boardDerivedFromScript",
            detail: "the board was built by hand instead of derived, so the two documents are not linked",
            test: (s) => s.scriptLinked
          },
          {
            name: "everyShotKeepsItsLines",
            detail: "a shot covers no script line",
            test: (s) =>
              s.storyboard.shots.length > 0 &&
              s.storyboard.shots.every(
                (sh) => (s.scriptLineIdsByShotId[sh.id] ?? []).length > 0
              )
          },
          {
            name: "everyShotRendered",
            detail: "a shot reached assembly without a rendered clip",
            test: (s) =>
              s.storyboard.shots.length > 0 &&
              s.storyboard.shots.every((sh) => sh.hasClip)
          },
          {
            name: "assembledJointly",
            detail:
              "the cut was assembled from the board alone — the words never reached the timeline",
            test: (s) => s.assembledLinked && s.skippedLineIds.length === 0
          },
          {
            name: "voiceoverClipPerLine",
            detail: "the cut holds fewer voiceover clips than the script has lines",
            test: (s) =>
              s.timeline.documentClips.filter((c) => c.scriptLineId).length >=
              s.script.lines.length
          },
          {
            name: "clipsCarryBothLinks",
            detail:
              "a voiceover clip reached the cut without its script or storyboard ids, so neither editor can sync it back",
            test: (s) => {
              const voice = s.timeline.documentClips.filter(
                (c) => c.scriptLineId
              );
              return (
                voice.length > 0 &&
                voice.every(
                  (c) =>
                    !!c.scriptId && !!c.storyboardBoardId && !!c.storyboardShotId
                )
              );
            }
          },
          {
            name: "cutValidates",
            detail:
              "validate_timeline never ran, or the assembled cut does not validate",
            test: (s) =>
              s.timelineValidation !== null &&
              s.timelineValidation.ok &&
              s.timelineValidation.errors.length === 0
          }
        ]
      }
    }
  ];
