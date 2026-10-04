/**
 * Saved-document timeline adapter. Tool schemas parse calls, the shared ops
 * engine edits the document, and host hooks resolve assets, persist derived
 * formats, start jobs, and sample frames. Eval surfaces use this adapter too.
 */

import { isShortResourceId } from "@nodetool-ai/protocol";
import {
  buildTimelineToolContracts,
  type TimelineToolName
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import {
  APPLY_TRANSITION_AT_CUT_DESCRIPTION,
  SET_BAKED_ANIMATION_DESCRIPTION,
  SET_GENERATED_MATTE_DESCRIPTION,
  applyTransitionAtCutParams,
  buildTransition,
  setBakedAnimationParams,
  setGeneratedMatteParams,
  textStylePatchParams,
  type TransitionParams
} from "@nodetool-ai/protocol/api-schemas/timeline-tool-params.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { parseWithTypeCoercion } from "@nodetool-ai/runtime";
import {
  ANIMATED_PROPERTIES,
  DEFAULT_BEAT_TOLERANCE_MS,
  DEFAULT_MIDI_INSTRUMENT,
  DEFAULT_TEMPO,
  STAGGER_UNITS,
  activeTakeIdOf,
  applyTakeToClip,
  applyTransitionAtCutCandidate,
  captureMediaEditSourceContext,
  composeGenerativeTakePatch,
  createMediaEditRequest,
  ensureBaselineTake,
  formatBarsBeats,
  makeClip,
  makeTrack,
  planTransitionAtCut,
  resolveTempo,
  visibleNotes,
  type AnimationRole,
  type ClipTransform,
  type CustomClipAnimation,
  type MediaEditRequest,
  type MediaTrack,
  type TimelineBeat,
  type TimelineClip,
  type TimelineComposition,
  type TimelineMarker,
  type TimelineSequence,
  type TimelineSetup,
  type TimelineTempo,
  type TimelineTrack,
  type TransitionAtCutInput
} from "@nodetool-ai/timeline";
import type {
  TimelineOpBakeModel3DRequest,
  TimelineOpBakeModel3DResult
} from "@nodetool-ai/timeline/ops";
import {
  applyTimelineOp,
  timelineOpFromToolArgs,
  type TimelineOpContext,
  type TimelineOpName,
  type TimelineOpState
} from "@nodetool-ai/timeline/ops";
import { computeActiveLayers, parseSvgPath } from "@nodetool-ai/timeline/scene";
import { z } from "zod";
export { unwrapClipParams } from "@nodetool-ai/timeline/ops";
/**
 * The `ui_timeline_*` contracts, shared with the browser registry
 * (`web/src/lib/tools/builtin/timeline.ts`). The vocabulary comes from
 * `@nodetool-ai/timeline`, which the protocol package sits below.
 */
const CONTRACTS = buildTimelineToolContracts({
  staggerUnits: STAGGER_UNITS,
  animatedProperties: ANIMATED_PROPERTIES,
  beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
});

const generatedTransitionCandidateParams = applyTransitionAtCutParams;
const transitionCandidateParams = z.object({
  candidate_id: z.string().trim().min(1)
});
const transitionCandidateLifecycleParams = applyTransitionAtCutParams
  .partial()
  .extend({ candidate_id: z.string().trim().min(1).optional() })
  .superRefine((value, context) => {
    if (
      value.candidate_id === undefined &&
      (value.outgoingClipId === undefined || value.incomingClipId === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Provide outgoingClipId and incomingClipId to create a candidate, or candidate_id to apply one."
      });
    }
  });

export interface TimelineTransitionCandidate {
  readonly id: string;
  readonly generationId: string;
  readonly kind: "generated_transition_at_cut";
  readonly status: "success";
  readonly asset: {
    readonly id: string;
    readonly contentType: "video/mp4";
  };
  readonly source: {
    readonly sequenceId: string;
    readonly outgoingClipId: string;
    readonly incomingClipId: string;
    readonly outgoingTakeId?: string;
    readonly incomingTakeId?: string;
    readonly outgoingAssetId?: string;
    readonly incomingAssetId?: string;
    readonly outgoingTransition?: TimelineClip["transitionIn"];
    readonly incomingTransition?: TimelineClip["transitionIn"];
    readonly outgoingStartMs: number;
    readonly outgoingDurationMs: number;
    readonly incomingStartMs: number;
    readonly incomingDurationMs: number;
    readonly cutTimeMs: number;
    readonly durationMs: number;
  };
  readonly request: {
    readonly durationMs: number;
    readonly overlapMs: number;
    readonly type: TransitionAtCutInput["type"];
    readonly easing?: string;
    readonly color?: string;
    readonly direction?: TransitionAtCutInput["direction"];
    readonly softness?: number;
  };
  readonly operation: {
    readonly op: "apply_generated_transition_at_cut";
    readonly candidateId: string;
    readonly outgoingClipId: string;
    readonly incomingClipId: string;
    readonly cutTimeMs: number;
    readonly durationMs: number;
    readonly undoable: true;
  };
}

/** Host seam for the provider-backed selected-cut transition generation. */
export interface TimelineTransitionGenerationRequest {
  readonly sequenceId: string;
  readonly source: TimelineTransitionCandidate["source"];
  readonly request: TimelineTransitionCandidate["request"];
}

export interface TimelineTransitionGenerationResult {
  /** Provider generation id, persisted with the candidate for provenance. */
  readonly generationId: string;
  /** Persisted provider output. A fabricated generative URI is not valid. */
  readonly assetId: string;
  readonly contentType?: "video/mp4";
}

export type TimelineTransitionGenerator = (
  request: TimelineTransitionGenerationRequest
) => Promise<TimelineTransitionGenerationResult>;

/** Units a failed lookup names before it stops and points at get_state. */
const MAX_LISTED_UNITS = 12;

/**
 * What the bridge needs to know about an asset to place it as a clip. A host
 * that can read the asset table supplies {@link TimelineAssetResolver}; the
 * eval bridge seeds a fixed table instead, so the op is exercised with no
 * database in reach.
 */
export interface TimelineBridgeAsset {
  id: string;
  name: string;
  contentType: string;
  /** Length in ms, when the catalogue knows it. */
  durationMs?: number;
  thumbnailAssetId?: string;
}

/** Look up an asset by id or `asset://<id>[.ext]` URI. */
/**
 * Reads a composition by id and lists what is available. The bridge holds no
 * library of its own: a capability run resolves shipped files and the caller's
 * assets, and an eval hands over a fixture.
 */
export interface TimelineCompositionLoader {
  get(id: string): Promise<TimelineComposition | null>;
  listIds(): Promise<string[]>;
}

export type TimelineAssetResolver = (
  ref: string
) => Promise<TimelineBridgeAsset | null>;

/** Persist one derived format without modifying the source sequence. */
export type TimelineFormatRetargeter = (
  sequence: TimelineSequence
) => Promise<{ sequenceId: string; name?: string }>;

/** A whole sequence handed to the bridge as-is, fields and all. */
export interface TimelineBridgeSequenceSeed {
  fps?: number;
  width?: number;
  height?: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  /** The document's markers. Absent reads as a sequence with none. */
  markers?: TimelineMarker[];
  /** Script/transcript state copied into derived format adaptations. */
  transcript?: TimelineSequence["transcript"];
  scriptEnabled?: TimelineSequence["scriptEnabled"];
  templateId?: TimelineSequence["templateId"];
  /**
   * The document's tempo. Absent is a document that has never carried one:
   * midi clips read at {@link DEFAULT_TEMPO} until a midi track is added or
   * `set_tempo` is called, and the bridge writes none back.
   */
  tempo?: TimelineTempo;
  camera2d?: TimelineSequence["camera2d"];
  /** Guided video-flow state. Absent reads as a sequence never in the flow. */
  setup?: TimelineSetup;
  /**
   * Subject/object tracks (P0 AI Video, Phase 2). Document-level, each owning
   * one `clipId`. Absent reads as a sequence with none. It is seeded here
   * rather than on {@link TimelineBridgeInitialState} because it is a field of
   * the document, exactly like `markers`, `tempo` and `setup`.
   */
  mediaTracks?: MediaTrack[];
}

/**
 * One custom-animation bake: a JS body plus the clip context it is written
 * against. The bridge never runs the body itself — a sandbox belongs to the
 * host, so `edit_timeline` hands `bakeCustomAnimation` down and the eval
 * surface runs without one.
 */
export interface TimelineAnimationBakeRequest {
  code: string;
  role: AnimationRole;
  /** The animation's own window, in ms. */
  durationMs: number;
  clipDurationMs: number;
  canvas: { width: number; height: number };
  params?: Record<string, number | string | boolean>;
  /** Stagger units the clip splits into (a text clip's word count), else 0. */
  staggerCount?: number;
}

/** What a bake returns. Mirrors `BakeCustomAnimationResult` minus the logs. */
export interface TimelineAnimationBakeResult {
  ok: boolean;
  curves?: CustomClipAnimation["curves"];
  mask?: { direction: string; softness: number };
  error?: string;
}

export type TimelineAnimationBaker = (
  request: TimelineAnimationBakeRequest
) => Promise<TimelineAnimationBakeResult>;

/** Renders one 3D clip through Blender and stores the video (design §D6). */
export type TimelineModel3DBaker = (
  request: TimelineOpBakeModel3DRequest
) => Promise<TimelineOpBakeModel3DResult>;

/** Case-supplied starting point for a run. */
export interface TimelineBridgeInitialState {
  fps?: number;
  width?: number;
  height?: number;
  /**
   * A real sequence to start from — every track and clip field preserved
   * (effects, animations, generation bindings, styles). Wins over the
   * `tracks`/`clips` shorthand below, which only carries what an eval case
   * needs to state a starting position. The bridge deep-clones it, so a caller
   * can hand over state it still owns.
   */
  sequence?: TimelineBridgeSequenceSeed;
  /**
   * Resolve an asset ref for `ui_timeline_add_media_clip`. Without one the op
   * reports that this surface has no asset lookup rather than inventing a
   * clip that points at nothing.
   */
  resolveAsset?: TimelineAssetResolver;
  /**
   * Bake a `preset: "custom"` animation's `code` into curves. Without one the
   * op says so and points at `curves`, rather than storing an animation whose
   * body nothing ever ran.
   */
  bakeAnimation?: TimelineAnimationBaker;
  /**
   * Render `ui_timeline_bake_model3d_clip` through Blender and store the
   * video. Without one the op reports that this surface has no renderer,
   * rather than stamping a bake nothing produced.
   */
  bakeModel3DClip?: TimelineModel3DBaker;
  /**
   * Resolve a composition for `ui_timeline_insert_composition`, and report the
   * ids this host offers so a bad one can name the alternatives. Without one
   * the op says this surface has no composition library rather than inventing
   * a template.
   */
  loadComposition?: TimelineCompositionLoader;
  /**
   * Store a sequence created by `ui_timeline_retarget_format`. The bridge
   * computes the complete adapted sequence first, then hands it to the host;
   * a database-backed host creates a new row while an eval keeps it in memory.
   */
  retargetFormat?: TimelineFormatRetargeter;
  /**
   * Generate the selected-cut transition through the host's provider path.
   * Without this seam the headless bridge refuses the action instead of
   * claiming that an in-memory placeholder is generated media.
   */
  generateTransition?: TimelineTransitionGenerator;
  /** Persist real output through the host generation lifecycle. */
  generateMediaEdit?: (request: MediaEditRequest) => Promise<{
    generationId: string;
    assetId: string;
  }>;
  /** Render or decode one clip through the host's media adapter. */
  getClipFrames?: (
    clip: TimelineClip,
    options: {
      timesMs?: number[];
      count?: number;
      width?: number;
    }
  ) => Promise<unknown>;
  /**
   * Offer `preview_timeline_frame` — a look at the layer stack at a timecode.
   * Off by default: `edit_timeline` builds this bridge too and reads its ops
   * off the `ui_timeline_` prefix, so a tool outside it would sit in that
   * catalogue as a verb nothing can call.
   */
  preview?: boolean;
  /**
   * The id `ui_timeline_get_state` reports. `edit_timeline` builds this bridge
   * against a real row and passes that row's id, because an agent reads the id
   * out of the state it just fetched and uses it in the next call — the eval
   * placeholder went out to real callers as the id of a sequence that does not
   * exist.
   */
  sequenceId?: string;
  /** Source sequence name/project, used when a format adaptation is derived. */
  sequenceName?: string;
  projectId?: string;
  tracks?: {
    name?: string;
    type: "video" | "audio" | "overlay" | "subtitle" | "midi";
  }[];
  clips?: {
    name: string;
    trackIndex: number;
    mediaType?: TimelineClip["mediaType"];
    startMs: number;
    durationMs: number;
  }[];
}

/** Snapshot of the sequence handed to final-state predicates. */
export interface TimelineBridgeFinalState {
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  playheadMs: number;
  tracks: { id: string; name: string; type: string; index: number }[];
  clips: {
    id: string;
    name: string;
    trackId: string;
    mediaType: string;
    startMs: number;
    durationMs: number;
    prompt?: string;
    animations: { role: string; preset: string }[];
  }[];
  /**
   * The full tracks and clips, not the reduced view above. Predicates read the
   * reduced shape; a host that has to reconstruct a document from the session
   * (the `nodetool timeline debug` harness) needs every field back.
   */
  documentTracks: TimelineTrack[];
  documentClips: TimelineClip[];
  /**
   * The document's markers. There is no reduced twin: a marker is four fields
   * wide, so a predicate and a document reader want the same shape.
   */
  markers: TimelineMarker[];
  /**
   * The document's subject/object tracks (P0 AI Video, Phase 2). A host
   * writing the session back has to store it for the same reason it stores
   * markers: `delete_track_object` removes one and `bind_to_track` makes a
   * clip follow one, so dropping the array loses the edit and leaves every
   * bound clip pointing at an id nothing answers.
   */
  mediaTracks: MediaTrack[];
  /** Derived formats created during this session. The source state stays put. */
  derivedSequences: TimelineSequence[];
  /**
   * The document's tempo, or undefined when it never carried one. A host
   * writing the session back has to store it: `set_tempo` and the first midi
   * track are the two ops that set it, and dropping it means every midi clip
   * plays at the wrong speed on the next read.
   */
  tempo?: TimelineTempo;
  camera2d?: TimelineSequence["camera2d"];
  /**
   * Guided video-flow state, or null on a sequence that was never in it.
   * `edit_timeline` writes it back, so the flow's stage and plan survive an
   * op run the same way tracks and clips do.
   */
  setup: TimelineSetup | null;
  /** Cut-level generated candidates live outside the clip take history. */
  transitionCandidates?: TimelineTransitionCandidate[];
  /** Preview-only audition state for one generated cut candidate. */
  auditionedTransitionCandidateId?: string;
  /** Candidates explicitly applied through one undoable cut operation. */
  appliedTransitionCandidates?: TimelineTransitionCandidate[];
  /**
   * Every tool this bridge ran, in call order, by name — failed calls
   * included, because a call that errored still happened. A document cannot
   * say whether the agent *looked* at what it made: "previewed after the last
   * edit" is a fact about the transcript, and a final-state predicate is all
   * the runner hands a case.
   */
  toolLog: string[];
  /** Timecodes successfully previewed by the bridge. */
  previewTimesMs: number[];
  /**
   * Layer kinds the previews reported, deduplicated. A `model3d` clip that
   * drew nothing is indistinguishable from one that was never added if a
   * case can only read the document, so what the preview *said* is
   * recorded too.
   */
  previewedLayerKinds: string[];
}

/**
 * Tools that read the sequence without changing it. Everything else is an
 * edit, which is what {@link previewedAfterLastEdit} measures "last" against.
 */
export interface TimelineBridgeTool {
  name: string;
  description: string;
  parameters: z.ZodType;
  execute(args: Record<string, unknown>): Promise<unknown>;
}
export interface TimelineToolBridge {
  tools: TimelineBridgeTool[];
  finalState(): TimelineBridgeFinalState;
}

function tool<TResult>(
  name: string,
  description: string,
  parameters: z.ZodTypeAny,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): TimelineBridgeTool {
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
 * `set_clip_params` takes the style as a patch merged over the clip's own, so
 * every field is optional. The shared contract still declares the whole-bag
 * `textStyleParams`, which refuses `{textStyle: {fontFamily}}` on a finished
 * title. Both hosts override that one field; when protocol carries
 * `textStylePatchParams` the two overrides go together.
 */
const CONTRACT_SHAPE_OVERRIDES: Partial<
  Record<TimelineToolName, z.ZodRawShape>
> = {
  ui_timeline_set_clip_params: { textStyle: textStylePatchParams.optional() }
};

/** A tool whose name, description and argument shape both hosts share. */
function sharedTool<TResult>(
  name: TimelineToolName,
  impl: (args: Record<string, unknown>) => Promise<TResult>
): TimelineBridgeTool {
  const contract = CONTRACTS[name];
  const shape = { ...contract.shape, ...CONTRACT_SHAPE_OVERRIDES[name] };
  // No host fields: this bridge drives one implicit sequence, so there is no
  // `timeline_id` to disambiguate.
  return tool(
    name,
    contract.description,
    uiToolParams({ ...contract, shape }),
    impl
  );
}

/**
 * Keys a caller wraps the whole patch in.
 *
 * `set_clip_params` reads its fields off the op itself — `{op, target,
 * textStyle}` — but a REST-shaped guess sends `{op, target, params: {…}}`, and
 * that used to be refused as an unknown key with the real fields hidden one
 * level down inside it. The wrapper says nothing the op does not already know,
 * so it is unwrapped rather than argued with.
 */
const isRecordValue = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type ClipTransformPatch = {
  position?: Partial<ClipTransform["position"]>;
  scale?: Partial<ClipTransform["scale"]>;
  rotation?: number;
  rotationX?: number;
  rotationY?: number;
  perspective?: number;
  anchor?: Partial<ClipTransform["anchor"]>;
};

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/**
 * Build an in-memory timeline bridge whose tools share the `ui_timeline_*`
 * contract but run headlessly against a plain sequence of tracks/clips (no
 * Zustand stores, no rendering).
 */
export function createTimelineToolBridge(
  initial: TimelineBridgeInitialState = {}
): TimelineToolBridge {
  const seed = initial.sequence;
  const resolveAsset = initial.resolveAsset;
  const bakeAnimation = initial.bakeAnimation;
  const bakeModel3DClip = initial.bakeModel3DClip;
  const loadComposition = initial.loadComposition;
  const retargetFormat = initial.retargetFormat;
  const generateTransition = initial.generateTransition;
  const sequenceId = initial.sequenceId ?? "seq_eval";
  const sequenceName = initial.sequenceName ?? "Sequence";
  const projectId = initial.projectId ?? "";
  const fps = seed?.fps ?? initial.fps ?? 30;
  const width = seed?.width ?? initial.width ?? 1920;
  const height = seed?.height ?? initial.height ?? 1080;

  let playheadMs = 0;
  let selectedClipIds: string[] = [];
  // Absent until a midi track or `set_tempo` puts one there — a document with
  // no midi in it should not grow a tempo field it never asked for.
  let tempo: TimelineTempo | undefined = seed?.tempo;
  let trackSeq = 0;
  let clipSeq = 0;
  let versionSeq = 0;
  let transitionSeq = 0;
  const tracks: TimelineTrack[] = [];
  let clips: TimelineClip[] = [];
  let markers: TimelineMarker[] = [];
  // Document-level, like markers: a track is named by `clipId`, and a clip
  // follows one through its own `trackBinding` (P0 AI Video, Phase 2).
  let mediaTracks: MediaTrack[] = [];
  let transitionCandidates: TimelineTransitionCandidate[] = [];
  let auditionedTransitionCandidateId: string | undefined;
  let appliedTransitionCandidates: TimelineTransitionCandidate[] = [];
  const derivedSequences: TimelineSequence[] = [];
  let setup: TimelineSetup | null = seed?.setup
    ? structuredClone(seed.setup)
    : null;
  const toolLog: string[] = [];
  const previewTimesMs: number[] = [];
  const previewedLayerKinds = new Set<string>();

  // Ids the sequence already uses. A seeded document brings its own, which the
  // `track_1`/`clip_1` counters would otherwise collide with on the first edit.
  const usedIds = new Set<string>();
  const mint = (prefix: string, next: () => number): string => {
    let id = `${prefix}_${next()}`;
    while (usedIds.has(id)) {
      id = `${prefix}_${next()}`;
    }
    usedIds.add(id);
    return id;
  };
  const nextTrackId = () => mint("track", () => ++trackSeq);
  const nextClipId = () => mint("clip", () => ++clipSeq);
  const nextVersionId = () => mint("version", () => ++versionSeq);
  const nextTransitionId = () => mint("transition", () => ++transitionSeq);

  const clipEnd = (clip: TimelineClip): number =>
    clip.startMs + clip.durationMs;

  function isAmbiguousCut(
    outgoing: TimelineClip,
    incoming: TimelineClip
  ): boolean {
    const cutTimeMs = incoming.startMs;
    return clips.some((candidate) => {
      if (
        candidate.id === outgoing.id ||
        candidate.id === incoming.id ||
        candidate.trackId !== outgoing.trackId
      ) {
        return false;
      }
      return (
        (candidate.startMs <= cutTimeMs && clipEnd(candidate) > cutTimeMs) ||
        candidate.startMs === cutTimeMs
      );
    });
  }

  function transitionSource(
    outgoing: TimelineClip,
    incoming: TimelineClip,
    durationMs: number
  ): TimelineTransitionCandidate["source"] {
    return {
      sequenceId,
      outgoingClipId: outgoing.id,
      incomingClipId: incoming.id,
      outgoingTakeId: activeTakeIdOf(outgoing),
      incomingTakeId: activeTakeIdOf(incoming),
      outgoingAssetId: outgoing.currentAssetId,
      incomingAssetId: incoming.currentAssetId,
      outgoingTransition: outgoing.transitionIn
        ? structuredClone(outgoing.transitionIn)
        : undefined,
      incomingTransition: incoming.transitionIn
        ? structuredClone(incoming.transitionIn)
        : undefined,
      outgoingStartMs: outgoing.startMs,
      outgoingDurationMs: outgoing.durationMs,
      incomingStartMs: incoming.startMs,
      incomingDurationMs: incoming.durationMs,
      cutTimeMs: incoming.startMs,
      durationMs
    };
  }

  function assertFreshTransitionCandidate(
    candidate: TimelineTransitionCandidate
  ): void {
    const outgoing = clips.find(
      (clip) => clip.id === candidate.source.outgoingClipId
    );
    const incoming = clips.find(
      (clip) => clip.id === candidate.source.incomingClipId
    );
    if (!outgoing || !incoming) {
      throw new Error(
        "The generated transition candidate is stale because its selected clip no longer exists."
      );
    }
    if (isAmbiguousCut(outgoing, incoming)) {
      throw new Error(
        "The generated transition candidate is stale because the selected cut is ambiguous."
      );
    }
    const source = transitionSource(
      outgoing,
      incoming,
      candidate.source.durationMs
    );
    if (JSON.stringify(source) !== JSON.stringify(candidate.source)) {
      throw new Error(
        "The generated transition candidate is stale because the selected clips or cut changed."
      );
    }
  }

  async function createTransitionCandidate(
    input: Record<string, unknown>
  ): Promise<TimelineTransitionCandidate> {
    const outgoingClipId = input.outgoingClipId as string;
    const incomingClipId = input.incomingClipId as string;
    const outgoing = resolveClip(outgoingClipId);
    const incoming = resolveClip(incomingClipId);
    if (isAmbiguousCut(outgoing, incoming)) {
      throw new Error(
        "The selected cut is ambiguous. Choose two adjacent clips with no other clip crossing the cut."
      );
    }
    const planned = planTransitionAtCut(clips, {
      outgoingClipId: outgoing.id,
      incomingClipId: incoming.id,
      durationMs: input.durationMs as number | undefined,
      overlapMs: input.overlapMs as number | undefined,
      type: input.type as TransitionAtCutInput["type"],
      easing: input.easing as string | undefined,
      color: input.color as string | undefined,
      direction: input.direction as TransitionAtCutInput["direction"],
      softness: input.softness as number | undefined
    });
    if (!planned.ok) {
      throw new Error(planned.error);
    }

    if (!generateTransition) {
      throw new Error(
        "Selected-cut transition generation is unavailable because this surface has no provider generator."
      );
    }

    const source = transitionSource(
      outgoing,
      incoming,
      planned.candidate.durationMs
    );
    const request: TimelineTransitionCandidate["request"] = {
      durationMs: planned.candidate.durationMs,
      overlapMs: planned.candidate.overlapMs,
      type: planned.candidate.type,
      easing: input.easing as string | undefined,
      color: input.color as string | undefined,
      direction: input.direction as TransitionAtCutInput["direction"],
      softness: input.softness as number | undefined
    };
    const generated = await generateTransition({
      sequenceId,
      source,
      request
    });
    if (
      generated.generationId.trim().length === 0 ||
      generated.assetId.trim().length === 0
    ) {
      throw new Error(
        "Selected-cut transition generation returned no generation id or asset."
      );
    }

    const id = nextTransitionId();
    const candidate: TimelineTransitionCandidate = {
      id,
      generationId: generated.generationId,
      kind: "generated_transition_at_cut",
      status: "success",
      asset: {
        id: generated.assetId,
        contentType: generated.contentType ?? "video/mp4"
      },
      source,
      request,
      operation: {
        op: "apply_generated_transition_at_cut",
        candidateId: id,
        outgoingClipId: outgoing.id,
        incomingClipId: incoming.id,
        cutTimeMs: incoming.startMs,
        durationMs: planned.candidate.durationMs,
        undoable: true
      }
    };
    transitionCandidates = [...transitionCandidates, candidate];
    return candidate;
  }

  function applyTransitionCandidate(candidateId: string): {
    candidate: TimelineTransitionCandidate;
    operation: TimelineTransitionCandidate["operation"];
    description: string;
  } {
    const candidate = transitionCandidates.find(
      (entry) => entry.id === candidateId
    );
    if (!candidate) {
      throw new Error(
        `No generated transition candidate named "${candidateId}" exists.`
      );
    }
    assertFreshTransitionCandidate(candidate);
    if (
      appliedTransitionCandidates.some((entry) => entry.id === candidate.id)
    ) {
      throw new Error(
        `Generated transition candidate "${candidate.id}" was already applied.`
      );
    }
    const planned = planTransitionAtCut(clips, {
      outgoingClipId: candidate.source.outgoingClipId,
      incomingClipId: candidate.source.incomingClipId,
      ...candidate.request
    });
    if (!planned.ok) {
      throw new Error(planned.error);
    }
    const applied = applyTransitionAtCutCandidate(clips, planned.candidate);
    if (!applied.ok) {
      throw new Error(applied.error);
    }
    clips = applied.clips;
    appliedTransitionCandidates = [
      ...appliedTransitionCandidates,
      structuredClone(candidate)
    ];
    if (auditionedTransitionCandidateId === candidate.id) {
      auditionedTransitionCandidateId = undefined;
    }
    return {
      candidate,
      operation: candidate.operation,
      description: `Apply generated transition candidate "${candidate.id}" to the selected cut as one undoable operation.`
    };
  }

  function addTrackInternal(
    type: TimelineTrack["type"],
    name?: string
  ): TimelineTrack {
    const index = tracks.length;
    const track = makeTrack({
      id: nextTrackId(),
      type,
      name: name ?? `${capitalize(type)} ${index + 1}`,
      index
    });
    if (type === "midi") {
      // The track owns the voice, so a midi track without one plays nothing.
      track.instrument = DEFAULT_MIDI_INSTRUMENT;
      // Ticks are read against the tempo, so the first midi track is where a
      // document that never had one gets it — written down rather than left
      // implicit, so the next reader does not have to know the default.
      tempo ??= DEFAULT_TEMPO;
    }
    tracks.push(track);
    return track;
  }

  function findOrCreateTrack(type: TimelineTrack["type"]): TimelineTrack {
    const existing = tracks.find((t) => t.type === type);
    if (existing) {
      return existing;
    }
    return addTrackInternal(type);
  }

  /**
   * The ids and names a caller could have used, for the message a failed
   * lookup throws. Capped, because a long cut has hundreds of clips and an
   * error listing all of them is one an agent stops reading.
   */
  function validUnits(
    units: readonly { id: string; name: string }[],
    kind: string
  ): string {
    if (units.length === 0) {
      return `The timeline has no ${kind}s yet.`;
    }
    const shown = units
      .slice(0, MAX_LISTED_UNITS)
      .map((u) => `${u.id} ("${u.name}")`)
      .join(", ");
    const rest = units.length - MAX_LISTED_UNITS;
    return rest > 0
      ? `Valid ${kind}s: ${shown}, and ${rest} more — call get_state for the full list.`
      : `Valid ${kind}s: ${shown}.`;
  }

  function resolveClip(target: string): TimelineClip {
    if (target.toLowerCase() === "selected") {
      if (selectedClipIds.length !== 1) {
        throw new Error(
          `"selected" requires exactly one selected clip (currently ${selectedClipIds.length}).`
        );
      }
      const clip = clips.find((c) => c.id === selectedClipIds[0]);
      if (!clip) {
        throw new Error("Selected clip no longer exists.");
      }
      return clip;
    }
    const byId = clips.find((c) => c.id === target);
    if (byId) {
      return byId;
    }
    if (isShortResourceId(target)) {
      const matches = clips.filter((clip) => clip.id.startsWith(target));
      if (matches.length === 1) {
        return matches[0];
      }
      if (matches.length > 1) {
        throw new Error(
          `Short clip id "${target}" matches more than one clip. Use the full id or name.`
        );
      }
    }
    const lower = target.toLowerCase();
    const byName = clips.find((c) => c.name.toLowerCase() === lower);
    if (byName) {
      return byName;
    }
    throw new Error(
      `No clip found matching "${target}". ${validUnits(clips, "clip")}`
    );
  }

  function serializeClip(c: TimelineClip) {
    const track = tracks.find((t) => t.id === c.trackId);
    return {
      id: c.id,
      name: c.name,
      trackId: c.trackId,
      trackName: track?.name ?? null,
      mediaType: c.mediaType,
      sourceType: c.sourceType,
      startMs: c.startMs,
      durationMs: c.durationMs,
      endMs: c.startMs + c.durationMs,
      inPointMs: c.inPointMs,
      outPointMs: c.outPointMs,
      status: c.status,
      currentAssetId: c.currentAssetId,
      activeTakeId: activeTakeIdOf(c),
      takeCount: c.versions?.length ?? 0,
      prompt: c.prompt,
      provider: c.provider,
      model: c.model,
      voice: c.voice,
      animations: (c.animations ?? []).map((a) => ({
        role: a.role,
        preset: a.preset
      })),
      hidden: c.hidden ?? false,
      muted: c.muted ?? false,
      locked: c.locked,
      opacity: c.opacity,
      transform: c.transform,
      textStyle: c.textStyle,
      shapeStyle: c.shapeStyle,
      captionStyle: c.caption?.style,
      transitionIn: c.transitionIn,
      mask: c.mask,
      matte: c.matte,
      timeRemap: c.timeRemap,
      effects: c.effects,
      parentId: c.parentId,
      reframe: c.reframe
        ? {
            mode: c.reframe.mode,
            trackId: c.reframe.trackId,
            safeMargin: c.reframe.safeMargin,
            smoothing: c.reframe.smoothing,
            sampleCount: c.reframe.samples?.length ?? 0,
            keyframeCount: c.reframe.keyframes?.length ?? 0
          }
        : undefined,
      // The notes themselves are the clip's bulk — a phrase is hundreds of
      // them — so state reports how many there are and how many the window
      // actually plays. `set_notes` sends the list; nothing reads it back.
      noteCount: c.notes?.length,
      audibleNoteCount:
        c.mediaType === "midi"
          ? visibleNotes(c, resolveTempo({ tempo }).bpm).length
          : undefined,
      // Where the phrase starts in musical time, so placing the next one is
      // reading a bar number rather than dividing milliseconds by the tempo.
      startBarsBeats:
        c.mediaType === "midi"
          ? formatBarsBeats(c.startMs, resolveTempo({ tempo }))
          : undefined
    };
  }

  // Seed from a real sequence when one was handed over, otherwise from the
  // shorthand. Cloned, so the bridge never writes through to the caller's state.
  if (seed) {
    for (const track of seed.tracks) {
      const copy = structuredClone(track);
      usedIds.add(copy.id);
      tracks.push(copy);
    }
    for (const clip of seed.clips) {
      const copy = structuredClone(clip);
      usedIds.add(copy.id);
      for (const animation of copy.animations ?? []) {
        usedIds.add(animation.id);
      }
      clips.push(copy);
    }
    for (const marker of seed.markers ?? []) {
      const copy = structuredClone(marker);
      usedIds.add(copy.id);
      markers.push(copy);
    }
    for (const mediaTrack of seed.mediaTracks ?? []) {
      const copy = structuredClone(mediaTrack);
      usedIds.add(copy.id);
      mediaTracks.push(copy);
    }
  }

  // Seed initial tracks and clips.
  for (const t of seed ? [] : (initial.tracks ?? [])) {
    addTrackInternal(t.type, t.name);
  }
  for (const c of seed ? [] : (initial.clips ?? [])) {
    const track = tracks[c.trackIndex];
    if (!track) {
      throw new Error(
        `Initial clip "${c.name}" references trackIndex ${c.trackIndex}, but only ${tracks.length} track(s) exist.`
      );
    }
    clips.push(
      makeClip({
        id: nextClipId(),
        trackId: track.id,
        name: c.name,
        startMs: c.startMs,
        durationMs: c.durationMs,
        mediaType: c.mediaType ?? "video",
        sourceType: "imported",
        status: "generated"
      })
    );
  }

  function readState(): TimelineOpState {
    return {
      fps,
      width,
      height,
      tracks,
      clips,
      markers,
      mediaTracks,
      playheadMs,
      selectedClipIds,
      tempo,
      setup,
      transcript: seed?.transcript,
      scriptEnabled: seed?.scriptEnabled,
      templateId: seed?.templateId,
      camera2d: structuredClone(seed?.camera2d ?? null)
    };
  }
  const generateFromBeats = async ({
    model,
    provider,
    voice,
    music
  }: Extract<
    import("@nodetool-ai/timeline/ops").TimelineOp,
    { op: "generate_from_beats" }
  >) => {
    const plan = setup?.beats ?? [];
    if (plan.length === 0) {
      throw new Error(
        "There is no beat plan to generate from; call ui_timeline_plan_beats first."
      );
    }
    const videoTrack = findOrCreateTrack("video");
    const wantsMusic =
      (music as boolean | undefined) ??
      plan.some((beat) => beat.music === true);
    const voiceTrack =
      voice !== undefined && plan.some((beat) => (beat.voiceover ?? "") !== "")
        ? findOrCreateTrack("audio")
        : null;

    const videoClipIds: string[] = [];
    const voiceoverClipIds: string[] = [];
    const planned: TimelineBeat[] = [];
    let startMs = 0;
    for (const [index, beat] of plan.entries()) {
      const durationMs = Math.max(1, Math.round(beat.duration_ms));
      const clip = makeClip({
        id: nextClipId(),
        trackId: videoTrack.id,
        name: `Beat ${index + 1}`,
        startMs,
        durationMs,
        mediaType: "video",
        sourceType: "generated",
        bindingKind: "text-to-video",
        prompt: beat.prompt,
        provider: provider as string | undefined,
        model: model as string | undefined,
        beatId: beat.id,
        status: "draft"
      });
      if (beat.transition) {
        clip.transitionIn = buildTransition({
          type: beat.transition as TransitionParams["type"],
          durationMs: 500
        });
      }
      clips.push(clip);
      videoClipIds.push(clip.id);

      const line = (beat.voiceover ?? "").trim();
      if (voiceTrack && line.length > 0) {
        const voiceClip = makeClip({
          id: nextClipId(),
          trackId: voiceTrack.id,
          name: `Beat ${index + 1} voiceover`,
          startMs,
          durationMs,
          mediaType: "audio",
          sourceType: "generated",
          bindingKind: "text-to-audio",
          prompt: line,
          voice: voice as string | undefined,
          beatId: beat.id,
          status: "draft"
        });
        clips.push(voiceClip);
        voiceoverClipIds.push(voiceClip.id);
      }
      planned.push({ ...beat, clip_id: clip.id });
      startMs += durationMs;
    }

    let musicClipId: string | null = null;
    if (wantsMusic) {
      // One bed under the whole cut, never one per beat: overlapping music
      // clips would play at once.
      const musicTrack = findOrCreateTrack("audio");
      const musicClip = makeClip({
        id: nextClipId(),
        trackId: musicTrack.id,
        name: "Music",
        startMs: 0,
        durationMs: startMs,
        mediaType: "audio",
        sourceType: "generated",
        bindingKind: "text-to-audio",
        prompt: `Instrumental score under: ${setup?.brief ?? ""}`,
        status: "draft"
      });
      clips.push(musicClip);
      musicClipId = musicClip.id;
    }

    setup = {
      stage: "done",
      brief: setup?.brief ?? "",
      format: setup?.format,
      voiceover: setup?.voiceover,
      beats: planned
    };
    return {
      ok: true,
      videoClipIds,
      voiceoverClipIds,
      musicClipId,
      // Nothing renders headlessly: this authors the cut, and the clips are
      // drafts until a renderer runs them.
      startedClipIds: [],
      note: "Clips created as drafts — this surface renders nothing."
    };
  };
  const opContext: TimelineOpContext = {
    newId: (kind) =>
      mint(kind, () => (counters[kind] = (counters[kind] ?? 0) + 1)),
    resolveAsset,
    bakeAnimation,
    bakeModel3DClip,
    loadComposition,
    parseSvgPath,
    sequence: { id: sequenceId, name: sequenceName, projectId },
    retargetFormat: async (sequence) => {
      const stored = retargetFormat
        ? await retargetFormat(structuredClone(sequence))
        : { sequenceId: sequence.id, name: sequence.name };
      derivedSequences.push(structuredClone(sequence));
      return { sequenceId: stored.sequenceId, name: stored.name };
    },
    generateFromBeats: async (_state, op) => {
      const result = await generateFromBeats(op);
      return { state: readState(), result, changedClipIds: [] };
    }
  };
  const counters: Partial<Record<string, number>> = {};
  async function editOp(name: TimelineOpName, args: Record<string, unknown>) {
    const outcome = await applyTimelineOp(
      readState(),
      timelineOpFromToolArgs(name, args),
      opContext
    );
    if (outcome.error) {
      throw new Error(outcome.error);
    }
    tracks.splice(0, tracks.length, ...outcome.state.tracks);
    clips = outcome.state.clips;
    markers = outcome.state.markers;
    mediaTracks = outcome.state.mediaTracks ?? [];
    tempo = outcome.state.tempo;
    setup = outcome.state.setup ?? null;
    playheadMs = outcome.state.playheadMs;
    selectedClipIds = outcome.state.selectedClipIds;
    return name === "get_state"
      ? { sequenceId, ...outcome.result }
      : outcome.result;
  }

  const tools: TimelineBridgeTool[] = [
    sharedTool("ui_timeline_get_state", async (args) =>
      editOp("get_state", args)
    ),

    sharedTool("ui_timeline_add_track", async (args) =>
      editOp("add_track", args)
    ),
    sharedTool("ui_timeline_move_track", async (args) =>
      editOp("move_track", args)
    ),

    sharedTool("ui_timeline_add_text_clip", async (args) =>
      editOp("add_text_clip", args)
    ),

    sharedTool("ui_timeline_delete_track", async (args) =>
      editOp("delete_track", args)
    ),

    sharedTool("ui_timeline_add_media_clip", async (args) =>
      editOp("add_media_clip", args)
    ),

    sharedTool("ui_timeline_add_shape_clip", async (args) =>
      editOp("add_shape_clip", args)
    ),

    sharedTool("ui_timeline_add_model3d_clip", async (args) =>
      editOp("add_model3d_clip", args)
    ),

    sharedTool("ui_timeline_set_model3d_style", async (args) =>
      editOp("set_model3d_style", args)
    ),

    sharedTool("ui_timeline_bake_model3d_clip", async (args) =>
      editOp("bake_model3d_clip", args)
    ),

    sharedTool("ui_timeline_generate_clip", async (args) =>
      editOp("generate_clip", args)
    ),

    sharedTool(
      "ui_timeline_get_clip_frames",
      async ({ target, timesMs, count, width }) => {
        if (!initial.getClipFrames) {
          throw new Error(
            "This timeline host has no clip-frame renderer. Use a media-backed host."
          );
        }
        const clip = resolveClip(target as string);
        const frames = await initial.getClipFrames(clip, {
          timesMs: timesMs as number[] | undefined,
          count: count as number | undefined,
          width: width as number | undefined
        });
        return { ok: true, clip: serializeClip(clip), frames };
      }
    ),

    sharedTool(
      "ui_timeline_generatively_edit_clip",
      async ({ clip_id, instruction, provider, model }) => {
        // The P0 request captures a durable destination. Unlike general
        // timeline actions, this intentionally refuses names and selection.
        const clip = clips.find((candidate) => candidate.id === clip_id);
        if (!clip) {
          throw new Error(
            `No clip with id "${clip_id}" exists on this timeline. Call ui_timeline_get_state and pass the clip id.`
          );
        }
        const baseline = ensureBaselineTake(clip);
        if (baseline !== clip) {
          clips = clips.map((candidate) =>
            candidate.id === clip.id ? baseline : candidate
          );
        }
        const source = captureMediaEditSourceContext(sequenceId, baseline);
        if (!source.ok) {
          throw new Error(source.error);
        }

        // Eval hosts have no selected model catalog. These deterministic
        // placeholders only stand in for a real provider's returned asset;
        // browser and server execution keep their normal model validation.
        const resolvedProvider = (provider as string | undefined) ?? "headless";
        const resolvedModel =
          (model as string | undefined) ?? "headless-video-to-video";
        const request = createMediaEditRequest({
          sourceContext: source.context,
          instruction: instruction as string,
          provider: resolvedProvider,
          model: resolvedModel
        });
        const generated = initial.generateMediaEdit
          ? await initial.generateMediaEdit(request)
          : { generationId: nextVersionId(), assetId: "" };
        const generationId = generated.generationId;
        const now = new Date().toISOString();
        const next = composeGenerativeTakePatch(baseline, "restyle", {
          assetId:
            generated.assetId || `generative://${baseline.id}/${generationId}`,
          jobId: generationId,
          createdAt: now,
          workflowUpdatedAt: now,
          provider: request.provider,
          model: request.model,
          prompt: request.instruction,
          durationMs: request.sourceContext.timelineDurationMs,
          mediaEdit: request
        });
        clips = clips.map((candidate) =>
          candidate.id === baseline.id ? next : candidate
        );
        const take = next.versions?.find(
          (candidate) => candidate.id === generationId
        );
        if (!take) {
          throw new Error("The AI edit candidate could not be recorded.");
        }
        return {
          ok: true,
          requestId: generationId,
          generationId,
          activeTakeId: activeTakeIdOf(next) ?? null,
          candidate: {
            id: take.id,
            status: take.status,
            source: take.source
          },
          clip: serializeClip(next)
        };
      }
    ),

    sharedTool("ui_timeline_apply_take", async ({ clip_id, take_id }) => {
      const clip = clips.find((candidate) => candidate.id === clip_id);
      if (!clip) {
        throw new Error(
          `No clip with id "${clip_id}" exists on this timeline. Call ui_timeline_get_state and pass the clip id.`
        );
      }
      const take = (clip.versions ?? []).find(
        (candidate) => candidate.id === take_id
      );
      if (!take?.mediaEdit) {
        throw new Error(
          `Take "${take_id}" is not an AI edit candidate for "${clip.name}". Apply only the candidate returned by ui_timeline_generatively_edit_clip.`
        );
      }
      const result = applyTakeToClip(clip, take_id as string);
      if (result.error) {
        throw new Error(result.error);
      }
      clips = clips.map((candidate) =>
        candidate.id === clip.id ? result.clip : candidate
      );
      return { ok: true, clip: serializeClip(result.clip) };
    }),

    sharedTool("ui_timeline_split_clip", async (args) =>
      editOp("split_clip", args)
    ),

    sharedTool("ui_timeline_trim_clip", async (args) =>
      editOp("trim_clip", args)
    ),

    sharedTool("ui_timeline_move_clip", async (args) =>
      editOp("move_clip", args)
    ),

    sharedTool("ui_timeline_delete_clip", async (args) =>
      editOp("delete_clip", args)
    ),

    sharedTool("ui_timeline_duplicate_clip", async (args) =>
      editOp("duplicate_clip", args)
    ),

    sharedTool("ui_timeline_set_clip_params", async (args) =>
      editOp("set_clip_params", args)
    ),

    sharedTool("ui_timeline_add_group", async (args) =>
      editOp("add_group", args)
    ),

    sharedTool("ui_timeline_set_parent", async (args) =>
      editOp("set_parent", args)
    ),

    sharedTool("ui_timeline_set_transition", async (args) =>
      editOp("set_transition", args)
    ),

    tool(
      "ui_timeline_generate_transition_at_cut",
      "Generate an inactive cut-level transition candidate for two explicitly adjacent clips. This does not change either clip or create a clip take. Preview the returned candidate before applying it.",
      generatedTransitionCandidateParams,
      async (args) => {
        const candidate = await createTransitionCandidate(args);
        return {
          ok: true,
          requestId: candidate.generationId,
          generationId: candidate.generationId,
          candidate,
          source: candidate.source
        };
      }
    ),

    tool(
      "ui_timeline_preview_transition_candidate",
      "Audition one generated cut-level transition candidate without changing the timeline document. Refuses candidates whose selected clips, source takes, or cut are stale.",
      transitionCandidateParams,
      async ({ candidate_id }) => {
        const candidate = transitionCandidates.find(
          (entry) => entry.id === candidate_id
        );
        if (!candidate) {
          throw new Error(
            `No generated transition candidate named "${candidate_id}" exists.`
          );
        }
        assertFreshTransitionCandidate(candidate);
        auditionedTransitionCandidateId = candidate.id;
        return { ok: true, previewOnly: true, candidate };
      }
    ),

    tool(
      "ui_timeline_apply_transition_at_cut",
      `${APPLY_TRANSITION_AT_CUT_DESCRIPTION} With clip ids and timing, this creates an inactive cut-level candidate. Apply a returned candidate_id explicitly to commit it as one undoable operation.`,
      transitionCandidateLifecycleParams,
      async (args) => {
        if (args.candidate_id !== undefined) {
          const applied = applyTransitionCandidate(args.candidate_id as string);
          return { ok: true, applied: true, ...applied };
        }
        const candidate = await createTransitionCandidate(args);
        return {
          ok: true,
          applied: false,
          requestId: candidate.generationId,
          generationId: candidate.generationId,
          candidate,
          source: candidate.source,
          next: "Preview with ui_timeline_preview_transition_candidate, then call this tool with candidate_id to apply."
        };
      }
    ),

    sharedTool("ui_timeline_set_mask", async (args) =>
      editOp("set_mask", args)
    ),

    sharedTool("ui_timeline_set_matte", async (args) =>
      editOp("set_matte", args)
    ),

    // Headless-only: the inspector's own controls write these knobs into the
    // store. Both this and the ops module's `set_generated_matte` reach
    // `selectGeneratedMatteVersion`, so the version list cannot fork.
    tool(
      "ui_timeline_set_generated_matte",
      SET_GENERATED_MATTE_DESCRIPTION,
      setGeneratedMatteParams,
      async (args) => editOp("set_generated_matte", args)
    ),

    sharedTool("ui_timeline_set_time_remap", async (args) =>
      editOp("set_time_remap", args)
    ),

    sharedTool("ui_timeline_set_effects", async (args) =>
      editOp("set_effects", args)
    ),

    sharedTool("ui_timeline_set_clip_binding", async (args) =>
      editOp("set_clip_binding", args)
    ),

    sharedTool("ui_timeline_animate_clip", async (args) =>
      editOp("animate_clip", args)
    ),

    // Headless-only: the browser writes curves through the inspector, not
    // through an agent call. Both this and the ops module's `set_baked_animation`
    // go through `buildBakedAnimation`, so the replace rule cannot fork.
    tool(
      "ui_timeline_set_baked_animation",
      SET_BAKED_ANIMATION_DESCRIPTION,
      setBakedAnimationParams,
      async (args) => editOp("set_baked_animation", args)
    ),

    sharedTool("ui_timeline_stagger_animations", async (args) =>
      editOp("stagger_animations", args)
    ),

    sharedTool("ui_timeline_clear_animations", async (args) =>
      editOp("clear_animations", args)
    ),

    sharedTool("ui_timeline_list_animation_presets", async (args) =>
      editOp("list_animation_presets", args)
    ),

    sharedTool("ui_timeline_select_clip", async (args) =>
      editOp("select_clip", args)
    ),

    sharedTool("ui_timeline_seek", async (args) => editOp("seek", args)),

    sharedTool("ui_timeline_add_marker", async (args) =>
      editOp("add_marker", args)
    ),

    // ── Guided video flow (PRD § 8.6) ───────────────────────────────────

    sharedTool("ui_timeline_set_setup", async (args) =>
      editOp("set_setup", args)
    ),

    sharedTool("ui_timeline_plan_beats", async (args) =>
      editOp("plan_beats", args)
    ),

    sharedTool("ui_timeline_update_beat", async (args) =>
      editOp("update_beat", args)
    ),

    sharedTool("ui_timeline_remove_beat", async (args) =>
      editOp("remove_beat", args)
    ),

    sharedTool("ui_timeline_generate_from_beats", async (args) =>
      editOp("generate_from_beats", args)
    ),

    sharedTool("ui_timeline_delete_marker", async (args) =>
      editOp("delete_marker", args)
    ),

    sharedTool("ui_timeline_set_markers_from_beats", async (args) =>
      editOp("set_markers_from_beats", args)
    ),

    sharedTool("ui_timeline_snap_to_beats", async (args) =>
      editOp("snap_to_beats", args)
    ),

    // ── MIDI ────────────────────────────────────────────────────────────
    // Notes live on the clip, the instrument on the track, and the tempo on
    // the document, so each gets its own op.

    sharedTool("ui_timeline_add_midi_clip", async (args) =>
      editOp("add_midi_clip", args)
    ),

    sharedTool("ui_timeline_set_notes", async (args) =>
      editOp("set_notes", args)
    ),

    sharedTool("ui_timeline_set_tempo", async (args) =>
      editOp("set_tempo", args)
    ),

    sharedTool("ui_timeline_set_track_instrument", async (args) =>
      editOp("set_track_instrument", args)
    ),

    // The note edits. Each runs the whole list through one pure function from
    // `@nodetool-ai/timeline` and replaces it — the ids survive, so a
    // selection and an undo in the editor still point at the same notes.

    sharedTool("ui_timeline_transpose_clip", async (args) =>
      editOp("transpose_clip", args)
    ),

    sharedTool("ui_timeline_quantize_notes", async (args) =>
      editOp("quantize_notes", args)
    ),

    sharedTool("ui_timeline_scale_velocity", async (args) =>
      editOp("scale_velocity", args)
    ),

    tool(
      "ui_timeline_insert_composition",
      "Insert a stored composition — a group of clips with named parameters (a lower third, a title card, a callout) — at a timecode. Its children keep the layering the template declares: each template track becomes an overlay track of its own, front-most on top, reused across insertions. `params` overrides the template's defaults by name; anything omitted keeps its default. Call list_compositions for the ids and their parameters.",
      z.object({
        composition_id: z
          .string()
          .describe("Composition id, from list_compositions."),
        startMs: z
          .number()
          .describe("Where the group starts on the timeline, in ms."),
        trackId: z
          .string()
          .optional()
          .describe(
            "Track for the group clip itself. Its children still get their own overlay tracks. Defaults to an overlay track."
          ),
        params: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional()
          .describe(
            'Parameter overrides by name, e.g. {name: "Ada Lovelace"}. A name the template does not declare, or a value of the wrong type, is refused.'
          )
      }),
      async (args) => editOp("insert_composition", args)
    ),

    // Headless-only: the editor's ClipVersionHistory panel writes take
    // switches, renames and deletes straight into TimelineStore via
    // restoreVersion/renameTake/deleteTake. This op reaches the same
    // `selectTake`/`renameTake`/`deleteTake` helpers, so the take list cannot
    // fork between the two hosts (P0 AI Video, PRD § 8.10).
    tool(
      "ui_timeline_list_takes",
      "List a clip's take history (clip.versions): id, label, source, " +
        "provider, model, createdAt, costCredits, durationMs, status, " +
        "favorite, and which one is active.",
      z.object({ target: z.string().describe("Clip id or name.") }),
      async (args) => editOp("list_takes", args)
    ),

    tool(
      "ui_timeline_select_take",
      "Make a stored take current on a clip — the same switch " +
        "restoreVersion does in the editor. Refuses a take that is not " +
        '`status: "success"`.',
      z.object({
        target: z.string().describe("Clip id or name."),
        takeId: z.string().describe("A take id, from list_takes.")
      }),
      async (args) => editOp("select_take", args)
    ),

    tool(
      "ui_timeline_rename_take",
      "Set a take's display label.",
      z.object({
        target: z.string().describe("Clip id or name."),
        takeId: z.string().describe("A take id, from list_takes."),
        label: z.string().describe("The new display label.")
      }),
      async (args) => editOp("rename_take", args)
    ),

    tool(
      "ui_timeline_delete_take",
      "Remove a take from a clip's history. Refuses when `takeId` is the " +
        "active take — select_take a different take first, then delete the " +
        "one you no longer want; a clip must always keep at least one take.",
      z.object({
        target: z.string().describe("Clip id or name."),
        takeId: z.string().describe("A take id, from list_takes.")
      }),
      async (args) => editOp("delete_take", args)
    ),

    // Subject/object tracks (P0 AI Video, Phase 2). The async provider call
    // that fills a track's samples is the `track_object` capability, not an
    // op — these four are the structural half over it, and they carry the
    // same semantics as `applyTimelineOp`'s own cases so the two hosts cannot
    // fork (`packages/timeline/src/ops/apply.ts`).
    tool(
      "ui_timeline_list_tracks",
      "List the document's subject/object tracks — id, clipId, name, kind, " +
        "status, source window and sample count. The samples themselves are " +
        "not returned: a track carries one per frame it covers, which is a " +
        "wall of numbers no caller reads through a listing.",
      z.object({
        target: z
          .string()
          .optional()
          .describe("A clip id or name to filter by. Omit for every track.")
      }),
      async (args) => editOp("list_tracks", args)
    ),

    tool(
      "ui_timeline_delete_track_object",
      "Delete a subject/object track and unbind every clip that was " +
        "following it — a clip left pointing at a track that is gone reads " +
        "as bound while following nothing.",
      z.object({
        trackId: z.string().describe("A track id, from list_tracks.")
      }),
      async (args) => editOp("delete_track_object", args)
    ),

    tool(
      "ui_timeline_bind_to_track",
      "Make a clip follow a subject/object track, so its position moves " +
        'with the tracked subject. Only "position" and "position_scale" are ' +
        "implemented; the other modes are named by the document format for a " +
        "later phase and are refused here rather than silently doing nothing.",
      z.object({
        target: z.string().describe("Clip id or name."),
        trackId: z.string().describe("A track id, from list_tracks."),
        mode: z.string().describe('"position" or "position_scale".'),
        offset: z
          .object({ x: z.number(), y: z.number() })
          .optional()
          .describe("Canvas-pixel offset added on top of the tracked point."),
        scale: z
          .number()
          .optional()
          .describe('Scale multiplier, "position_scale" only.'),
        rotationOffset: z
          .number()
          .optional()
          .describe("Radians added to the clip's rotation."),
        smoothing: z
          .number()
          .optional()
          .describe("0..1; higher follows the track more loosely.")
      }),
      async (args) => editOp("bind_to_track", args)
    ),

    tool(
      "ui_timeline_unbind_track",
      "Stop a clip following a track. A clip that follows none is a no-op.",
      z.object({ target: z.string().describe("Clip id or name.") }),
      async (args) => editOp("unbind_track", args)
    ),

    sharedTool("ui_timeline_retarget_format", async (args) =>
      editOp("retarget_format", args)
    ),

    sharedTool("ui_timeline_set_reframe_subject", async (args) =>
      editOp("set_reframe_subject", args)
    ),

    sharedTool("ui_timeline_add_reframe_keyframe", async (args) =>
      editOp("add_reframe_keyframe", args)
    ),

    sharedTool("ui_timeline_clear_reframe", async (args) =>
      editOp("clear_reframe", args)
    )
  ];

  // Opt-in, and outside the `ui_timeline_` prefix on purpose: `edit_timeline`
  // builds this same bridge and matches its ops by that prefix, so a preview
  // tool it can never call has no business in its op catalogue. A case that
  // grades "did it look at the frame" asks for it.
  if (initial.preview) {
    tools.push(
      tool(
        "preview_timeline_frame",
        "Look at the sequence at one or more timecodes: what is on screen, layered top of the stack first, with each layer's opacity and track index. This surface has no rasterizer, so it reports the layer stack rather than pixels — enough to see a layer that is covered, missing, or drawing nothing. Call it after an edit, before you say you are done.",
        z.object({
          times_ms: z
            .array(z.number().nonnegative())
            .min(1)
            .max(8)
            .describe("Absolute timeline positions to look at, in ms.")
        }),
        async ({ times_ms }) => {
          const frames = (times_ms as number[]).map((timeMs) => ({
            time_ms: timeMs,
            layers: computeActiveLayers(tracks, clips, timeMs)
              .map((layer) => ({
                clip_id: layer.clipId,
                clip_name:
                  clips.find((c) => c.id === layer.clipId)?.name ??
                  layer.clipId,
                kind: layer.kind,
                track_index: layer.trackIndex,
                z_index: 1000 - layer.trackIndex,
                opacity: layer.opacity,
                text: layer.textStyle?.text
              }))
              // Top of the stack first, the order the skill's report describes.
              .sort((a, b) => b.z_index - a.z_index)
          }));
          previewTimesMs.push(...(times_ms as number[]));
          for (const frame of frames) {
            for (const layer of frame.layers) {
              previewedLayerKinds.add(layer.kind);
            }
          }
          return { ok: true, width, height, frames };
        }
      )
    );
  }

  // Recorded rather than counted: a predicate asks where the last edit sits
  // relative to a preview, which a tally cannot answer. The push happens
  // before the call, so a tool that throws is still in the transcript.
  let pending: Promise<unknown> = Promise.resolve();
  const recorded: TimelineBridgeTool[] = tools.map((entry) => ({
    ...entry,
    execute: (args: Record<string, unknown>) => {
      toolLog.push(entry.name);
      const parsed: unknown = parseWithTypeCoercion(entry.parameters, args);
      if (!isRecordValue(parsed)) {
        throw new Error("Timeline tool arguments must be an object.");
      }
      const result = pending.then(() => entry.execute(parsed));
      pending = result.catch(() => undefined);
      return result;
    }
  }));

  return {
    tools: recorded,
    finalState: (): TimelineBridgeFinalState => ({
      fps,
      width,
      height,
      durationMs: clips.reduce(
        (m, c) => Math.max(m, c.startMs + c.durationMs),
        0
      ),
      playheadMs,
      tracks: tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        index: t.index
      })),
      clips: clips.map((c) => ({
        id: c.id,
        name: c.name,
        trackId: c.trackId,
        mediaType: c.mediaType,
        startMs: c.startMs,
        durationMs: c.durationMs,
        prompt: c.prompt,
        animations: (c.animations ?? []).map((a) => ({
          role: a.role,
          preset: a.preset
        }))
      })),
      documentTracks: tracks.map((t) => structuredClone(t)),
      documentClips: clips.map((c) => structuredClone(c)),
      markers: markers.map((m) => structuredClone(m)),
      mediaTracks: mediaTracks.map((t) => structuredClone(t)),
      derivedSequences: derivedSequences.map((sequence) =>
        structuredClone(sequence)
      ),
      tempo: tempo ? structuredClone(tempo) : undefined,
      camera2d: structuredClone(seed?.camera2d ?? null),
      setup: setup ? structuredClone(setup) : null,
      transitionCandidates: structuredClone(transitionCandidates),
      auditionedTransitionCandidateId,
      appliedTransitionCandidates: structuredClone(appliedTransitionCandidates),
      toolLog: [...toolLog],
      previewTimesMs: [...previewTimesMs],
      previewedLayerKinds: [...previewedLayerKinds]
    })
  };
}
