import { createHash } from "node:crypto";
import { loadImage } from "@napi-rs/canvas";
import { z } from "zod";
import type { StoryboardDocument, TimelineSequence } from "@nodetool-ai/models";
import {
  zodToJsonSchema,
  budgetFromContext,
  isProviderStop,
  type Message,
  type MessageContent,
  type ProviderTool,
  type BaseProvider,
  type TurnBudget,
  type RunBudget
} from "@nodetool-ai/runtime";
import {
  isRecord,
  resolveEffectiveProductionRequirement
} from "@nodetool-ai/protocol";
import { buildTimelineToolContracts } from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { validateTimelineSequence } from "@nodetool-ai/execution/timeline-debug";
import {
  activeStoryboardGraphics,
  ANIMATED_PROPERTIES,
  STAGGER_UNITS,
  DEFAULT_BEAT_TOLERANCE_MS,
  buildStoryboardDesignFrame,
  makeClip,
  makeTrack,
  getAnimationPreset,
  resolvePresetParams,
  validateProducedTimeline,
  stampStoryboardMaterializationBaseline,
  type FinishStoryboardInput,
  type FinishedStoryboardDocument,
  type TimelineClip
} from "@nodetool-ai/timeline";
import type { CapabilityRun } from "./types.js";
import { applyOps, parseOps } from "./timelines.js";
import { editTimelineSpec } from "./timelines.specs.js";
import { storyboardReviewTimes } from "./storyboard-review-times.js";
import { findLayoutDefects, shotHoldTimes } from "./storyboard-layout-check.js";
import { renderTimelineFrames } from "../timeline-preview/frames.js";
import { agentActivityReporter } from "./agent-activity.js";

const frameReviewSchema = z.object({
  timeMs: z.number().finite(),
  passed: z.boolean(),
  findings: z.array(z.string().min(1))
});
const reviewSchema = z.object({
  passed: z.boolean(),
  findings: z.array(z.string().min(1)),
  summary: z.string().min(1),
  frameReviews: z.array(frameReviewSchema).min(1)
});
export interface FinishedCutRuntime {
  readonly provider: BaseProvider;
  readonly model: string;
  readonly budget?: TurnBudget | RunBudget;
}

/**
 * What one agentic pass authors. "layout" composes the static frame of every
 * shot and may generate decoration; "finish" authors the motion.
 */
export interface FinishedCutOptions {
  readonly phase?: "layout" | "finish";
  /** The image model a layout pass generates backgrounds and decoration with. */
  readonly imageModel?: { readonly provider: string; readonly id: string };
}

/** A generated image the layout pass added to a shot as a decorative element. */
export interface StoryboardDecoration {
  readonly shotId: string;
  readonly element: {
    id: string;
    kind: "asset";
    role: "decorative";
    asset_id: string;
    direction: string;
    origin: "layout_agent";
  };
}

/** The words of a review finding that name the defect, without numbers or short words. */
const defectWords = (finding: string): Set<string> =>
  new Set(finding.toLowerCase().match(/[a-z]{4,}/g) ?? []);

/**
 * Whether two rounds report the same defects. A reviewer rewords a finding
 * each round, so findings match when they share at least half their words.
 */
function sameDefects(previous: readonly string[], current: readonly string[]): boolean {
  const before = previous.map(defectWords);
  return current.length === previous.length && current.map(defectWords).every((words) =>
    before.some((other) => {
      const shared = [...words].filter((word) => other.has(word)).length;
      const union = new Set([...words, ...other]).size;
      return union > 0 && shared / union >= 0.5;
    })
  );
}

/** Generated decorations one layout pass may add, across the whole cut. */
const MAX_DECORATIONS = 8;

export interface FinishedCutReview {
  readonly round: number;
  readonly passed: boolean;
  readonly findings: readonly string[];
  readonly summary: string;
  readonly frameReviews?: readonly {
    readonly timeMs: number;
    readonly passed: boolean;
    readonly findings: readonly string[];
  }[];
  readonly referenceFrames: readonly {
    shotId: string;
    fingerprint: string;
    sha256: string;
    timeMs: number;
  }[];
  readonly frames: readonly {
    timeMs: number;
    sha256: string;
    width: number;
    height: number;
  }[];
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * JSON with object keys sorted, the form a materialization baseline is stored
 * in. A saved clip keeps its own key order, so comparing it with a baseline
 * value through plain JSON reports every finished layer as manually edited.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    isRecord(entry)
      ? Object.fromEntries(
          Object.keys(entry)
            .sort()
            .map((key) => [key, entry[key]])
        )
      : entry
  );
}

/** Placement fields a person may own on a finished layer. */
const MANUAL_FIELDS = [
  "transform",
  "startMs",
  "durationMs",
  "layout",
  "flexItem",
  "mask",
  "transitionIn"
] as const;

/** The placement fields a person changed after the last accepted finish. */
function manualFields(clip: TimelineClip): (typeof MANUAL_FIELDS)[number][] {
  if (!clip.storyboardMaterializationBaseline) {
    return [];
  }
  const baseline: unknown = JSON.parse(clip.storyboardMaterializationBaseline);
  if (!isRecord(baseline)) {
    return [];
  }
  return MANUAL_FIELDS.filter(
    (field) => canonical(clip[field]) !== canonical(baseline[field])
  );
}

/** Compare authored composition, excluding ownership baseline and animation IDs. */
function composition(document: FinishedStoryboardDocument): string {
  const trackIndices = new Map(
    document.tracks.map((track) => [track.id, track.index])
  );
  return json(
    document.clips
      .map((clip) => ({
        id: clip.id,
        trackIndex: trackIndices.get(clip.trackId),
        mediaType: clip.mediaType,
        transform: clip.transform,
        layout: clip.layout,
        flexItem: clip.flexItem,
        mask: clip.mask,
        transitionIn: clip.transitionIn,
        textStyle: clip.textStyle,
        shapeStyle: clip.shapeStyle,
        opacity: clip.opacity ?? 1,
        hidden: clip.hidden ?? false,
        blendMode: clip.blendMode ?? "normal",
        parentId: clip.parentId,
        matte: clip.matte,
        crop: clip.crop,
        effects: clip.effects,
        animations: (clip.animations ?? []).map(
          ({ id: _id, ...animation }) => animation
        )
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

function sourceWindowConflict(
  before: TimelineClip | undefined,
  after: TimelineClip,
  boardId: string
): string | undefined {
  if (
    before?.storyboardBoardId === boardId &&
    (before.startMs !== after.startMs || before.durationMs !== after.durationMs)
  ) {
    return `Finishing must preserve the deterministic shot window on ${before.id}. Keep startMs=${before.startMs} and durationMs=${before.durationMs}; use animation delay/duration for motion within that window.`;
  }
  return undefined;
}

/**
 * The authored placement fields of a storyboard graphic element. The element
 * schema passes unknown keys through, so they are read through this local shape.
 */
interface AuthoredPlacement {
  readonly frame?: unknown;
  readonly typography?: unknown;
  readonly lock: readonly string[];
  readonly limits: { x?: number; y?: number; scale?: number };
}

function authoredPlacement(element: unknown): AuthoredPlacement | undefined {
  if (!isRecord(element)) {
    return undefined;
  }
  const lock = Array.isArray(element["lock"])
    ? element["lock"].filter((value): value is string => typeof value === "string")
    : [];
  const limits: { x?: number; y?: number; scale?: number } = {};
  const rawLimits = element["limits"];
  if (isRecord(rawLimits)) {
    for (const key of ["x", "y", "scale"] as const) {
      const value = rawLimits[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        limits[key] = value;
      }
    }
  }
  const { frame, typography } = element;
  if (
    frame === undefined &&
    typography === undefined &&
    !lock.length &&
    !Object.keys(limits).length
  ) {
    return undefined;
  }
  return { frame, typography, lock, limits };
}

function frameBox(placement: AuthoredPlacement): number[] | undefined {
  const frame = placement.frame;
  const box = isRecord(frame) ? frame["box"] : undefined;
  return Array.isArray(box) && box.every((value) => typeof value === "number")
    ? (box as number[])
    : undefined;
}

/** Properties a moving animation drives, by the placement property it breaks. */
const POSITION_PROPERTIES = new Set(["offsetX", "offsetY", "positionX", "positionY", "anchorX", "anchorY"]);
const SCALE_PROPERTIES = new Set(["scale", "scaleX", "scaleY"]);

/** The properties one animation drives, or undefined when they cannot be known. */
function animatedProperties(
  animation: NonNullable<TimelineClip["animations"]>[number],
  canvas: { width: number; height: number }
): Set<string> | undefined {
  const properties = new Set<string>();
  for (const track of animation.styleTracks ?? []) {
    properties.add(track.target);
  }
  if (animation.preset === "custom") {
    const curves = animation.custom?.curves;
    if (!Array.isArray(curves)) {
      return undefined;
    }
    for (const curve of curves) {
      properties.add(curve.property);
    }
    return properties;
  }
  const preset = getAnimationPreset(animation.preset);
  if (!preset) {
    return undefined;
  }
  try {
    for (const curve of preset.curves(
      resolvePresetParams(preset, animation.params),
      canvas,
      animation.role,
      animation.durationMs
    )) {
      properties.add(curve.property);
    }
  } catch {
    return undefined;
  }
  return properties;
}

const POSITION_EPSILON_PX = 0.5;
const RATIO_EPSILON = 0.001;

/**
 * A clip's position and scale in frame space: the parent chain composed into
 * its own transform. Rotation and anchor of a parent are not applied.
 */
function worldTransform(
  clips: ReadonlyMap<string, TimelineClip>,
  clip: TimelineClip
): { x: number; y: number; sx: number; sy: number } {
  const own = clip.transform;
  const local = {
    x: own?.position.x ?? 0,
    y: own?.position.y ?? 0,
    sx: own?.scale.x ?? 1,
    sy: own?.scale.y ?? 1
  };
  const seen = new Set<string>([clip.id]);
  let parent = clip.parentId ? clips.get(clip.parentId) : undefined;
  while (parent && !seen.has(parent.id)) {
    seen.add(parent.id);
    const group = parent.transform;
    const gsx = group?.scale.x ?? 1;
    const gsy = group?.scale.y ?? 1;
    local.x = (group?.position.x ?? 0) + gsx * local.x;
    local.y = (group?.position.y ?? 0) + gsy * local.y;
    local.sx *= gsx;
    local.sy *= gsy;
    parent = parent.parentId ? clips.get(parent.parentId) : undefined;
  }
  return local;
}

const cropInsets = (clip: TimelineClip): [number, number, number, number] => [
  clip.crop?.left ?? 0,
  clip.crop?.top ?? 0,
  clip.crop?.right ?? 0,
  clip.crop?.bottom ?? 0
];

/** Existing authored presentation survives while semantic source truth is refreshed. */
function reuseAcceptedPresentation(
  input: FinishStoryboardInput,
  scaffold: FinishedStoryboardDocument
): FinishedStoryboardDocument {
  const document = structuredClone(scaffold);
  const accepted = new Map(input.current?.clips.map((clip) => [clip.id, clip]));
  const protectedColors = new Set<string>();
  for (const shot of input.shots) {
    const protections = new Map(
      (
        resolveEffectiveProductionRequirement(input.production, shot.production)
          ?.protected_inputs ?? []
      ).map((protection) => [protection.id, protection])
    );
    for (const element of activeStoryboardGraphics(shot)) {
      if (
        element.protected_input_id &&
        protections.get(element.protected_input_id)?.kind === "brand_color"
      ) {
        protectedColors.add(`${shot.id}/${element.id}`);
      }
    }
  }
  for (const clip of document.clips) {
    const prior = accepted.get(clip.id);
    if (
      !prior ||
      clip.storyboardBoardId !== input.boardId ||
      prior.mediaType !== clip.mediaType ||
      prior.storyboardShotId !== clip.storyboardShotId ||
      prior.storyboardElementId !== clip.storyboardElementId
    ) {
      continue;
    }
    const protectedColor = protectedColors.has(
      `${clip.storyboardShotId}/${clip.storyboardElementId}`
    );
    Object.assign(
      clip,
      structuredClone({
        name: prior.name,
        transform: prior.transform,
        layout: prior.layout,
        flexItem: prior.flexItem,
        opacity: prior.opacity,
        hidden: prior.hidden,
        blendMode: prior.blendMode,
        parentId: prior.parentId,
        mask: prior.mask,
        matte: prior.matte,
        crop: prior.crop,
        effects: prior.effects,
        animations: prior.animations,
        transitionIn: prior.transitionIn
      })
    );
    if (clip.textStyle && prior.textStyle) {
      clip.textStyle = {
        ...prior.textStyle,
        text: clip.textStyle.text,
        ...(protectedColor && {
          color: clip.textStyle.color
        })
      };
    }
    if (clip.shapeStyle && prior.shapeStyle) {
      clip.shapeStyle = {
        ...prior.shapeStyle,
        kind: clip.shapeStyle.kind,
        ...(protectedColor && {
          fill: clip.shapeStyle.fill
        })
      };
    }
  }
  return document;
}

/** A child authors only an in-memory draft. Existing CAS is the sole write. */
export async function finishStoryboardAgentically(
  run: CapabilityRun,
  input: FinishStoryboardInput,
  board: StoryboardDocument,
  sequence: TimelineSequence,
  scaffold: FinishedStoryboardDocument,
  runtime: FinishedCutRuntime,
  options: FinishedCutOptions = {}
): Promise<{
  document: FinishedStoryboardDocument;
  reviews: FinishedCutReview[];
  costUsd: number;
  decorations: StoryboardDecoration[];
  /** Layout only: every hard check passed, the visual review still has findings. */
  needsReview?: boolean;
  findings?: string[];
}> {
  const initialCost = runtime.provider.getTotalCost();
  const layoutPhase = options.phase === "layout";
  const priorStage = input.current?.storyboardMaterializations?.find(
    (entry) => entry.boardId === input.boardId
  )?.stage;
  // A cut that holds only the planned layout still needs its motion, so the
  // finish must author it rather than accept the cut as it is.
  const motionPending = !layoutPhase && priorStage === "layout";
  const needsInitialAuthoring = !input.current || motionPending;
  const manualEdits = (input.current?.clips ?? [])
    .map((clip) => ({ clipId: clip.id, name: clip.name, fields: manualFields(clip) }))
    .filter((edit) => edit.fields.length > 0);
  if (input.shots.length === 0 || input.shots.length > 24) {
    throw new Error(
      "Agentic finishing supports 1–24 shots per reviewed cut. Split a larger board before finishing."
    );
  }
  const signal = run.signal ?? run.context.signal;
  let document = reuseAcceptedPresentation(input, scaffold);
  // What the agent starts from: the scaffold, or the accepted layout it keeps.
  const startComposition = composition(document);
  const preflightPolicy = validateProducedTimeline(input, document);
  const preflightStructure = validateTimelineSequence(document, {
    fps: sequence.fps,
    width: input.width,
    height: input.height
  });
  if (preflightPolicy.length || !preflightStructure.ok) {
    throw new Error(
      `Accepted presentation cannot honor the current production requirements: ${json({ policy: preflightPolicy, structural: preflightStructure })}`
    );
  }
  const reviews: FinishedCutReview[] = [];
  let feedback: unknown = [];
  const initial = new Map(scaffold.clips.map((clip) => [clip.id, clip]));
  // Image layers this pass generated, by clip id. They are new source media,
  // so the board gains a matching decorative element when the cut is saved.
  const generated = new Map<string, StoryboardDecoration>();
  const windows = input.shots.map((shot) => {
    const clips = scaffold.clips.filter((clip) => clip.storyboardShotId === shot.id);
    const start = Math.min(...clips.map((clip) => clip.startMs));
    const end = Math.max(...clips.map((clip) => clip.startMs + clip.durationMs));
    return { shotId: shot.id, start, duration: end - start };
  });
  // Authored placements by `shot/element`. The scaffold is the baseline for
  // every lock and limit, never the previous candidate.
  const placements = new Map<string, AuthoredPlacement>();
  for (const shot of input.shots) {
    for (const element of activeStoryboardGraphics(shot)) {
      const placement = authoredPlacement(element);
      if (placement && (placement.lock.length || Object.keys(placement.limits).length)) {
        placements.set(`${shot.id}/${element.id}`, placement);
      }
    }
  }
  const startAnimations = new Map(
    document.clips.map((clip) => [
      clip.id,
      new Set((clip.animations ?? []).map(({ id: _id, ...animation }) => json(animation)))
    ])
  );
  const assertAuthoredPlacements = (
    candidate: FinishedStoryboardDocument
  ): void => {
    if (!placements.size) {
      return;
    }
    const baseline = new Map(scaffold.clips.map((clip) => [clip.id, clip]));
    const after = new Map(candidate.clips.map((clip) => [clip.id, clip]));
    const fixed = (value: number): string => String(Math.round(value * 1000) / 1000);
    for (const clip of candidate.clips) {
      const placement = placements.get(`${clip.storyboardShotId}/${clip.storyboardElementId}`);
      const base = baseline.get(clip.id);
      if (!placement || !base) {
        continue;
      }
      const name = `${clip.storyboardShotId}/${clip.storyboardElementId}`;
      const was = worldTransform(baseline, base);
      const now = worldTransform(after, clip);
      const dx = now.x - was.x;
      const dy = now.y - was.y;
      const ratioX = was.sx ? now.sx / was.sx : 1;
      const ratioY = was.sy ? now.sy / was.sy : 1;
      const locked = new Set(placement.lock);
      const fail = (property: string, detail: string): never => {
        throw new Error(
          `Authored placement violated on ${name}: ${property} ${detail} Restore the authored value and edit only what the placement allows.`
        );
      };
      if (locked.has("position")) {
        for (const [axis, delta, authored] of [["x", dx, was.x], ["y", dy, was.y]] as const) {
          if (Math.abs(delta) > POSITION_EPSILON_PX) {
            fail(
              `position.${axis}`,
              `is locked at the authored value ${fixed(authored)}px, but the candidate has ${fixed(authored + delta)}px (limit: no change).`
            );
          }
        }
      }
      if (locked.has("scale")) {
        for (const [axis, ratio, authored] of [["x", ratioX, was.sx], ["y", ratioY, was.sy]] as const) {
          if (Math.abs(ratio - 1) > RATIO_EPSILON) {
            fail(
              `scale.${axis}`,
              `is locked at the authored value ${fixed(authored)}, but the candidate has ${fixed(authored * ratio)} (limit: no change).`
            );
          }
        }
      }
      if (locked.has("crop")) {
        const authored = cropInsets(base);
        const value = cropInsets(clip);
        const names = ["left", "top", "right", "bottom"];
        value.forEach((inset, index) => {
          if (Math.abs(inset - authored[index]) > RATIO_EPSILON) {
            fail(
              `crop.${names[index]}`,
              `is locked at the authored value ${fixed(authored[index])}, but the candidate has ${fixed(inset)} (limit: no change).`
            );
          }
        });
      }
      const { x: limitX, y: limitY, scale: limitScale } = placement.limits;
      if (limitX !== undefined && Math.abs(dx) / input.width > limitX + 1e-6) {
        fail(
          "position.x",
          `moved ${fixed(dx)}px from the authored ${fixed(was.x)}px, which is ${fixed(Math.abs(dx) / input.width)} of the frame width. The limit is ${limitX}.`
        );
      }
      if (limitY !== undefined && Math.abs(dy) / input.height > limitY + 1e-6) {
        fail(
          "position.y",
          `moved ${fixed(dy)}px from the authored ${fixed(was.y)}px, which is ${fixed(Math.abs(dy) / input.height)} of the frame height. The limit is ${limitY}.`
        );
      }
      if (limitScale !== undefined) {
        for (const [axis, ratio, authored] of [["x", ratioX, was.sx], ["y", ratioY, was.sy]] as const) {
          if (Math.abs(ratio - 1) > limitScale + 1e-6) {
            fail(
              `scale.${axis}`,
              `changed from the authored ${fixed(authored)} to ${fixed(authored * ratio)}, a ratio change of ${fixed(Math.abs(ratio - 1))}. The limit is ${limitScale}.`
            );
          }
        }
      }
      if (!layoutPhase && (locked.has("position") || locked.has("scale"))) {
        for (const animation of clip.animations ?? []) {
          const { id: _id, ...rest } = animation;
          if (startAnimations.get(clip.id)?.has(json(rest))) {
            continue;
          }
          const properties = animatedProperties(animation, { width: input.width, height: input.height });
          const moves = properties
            ? [...properties].filter(
                (property) =>
                  (locked.has("position") && POSITION_PROPERTIES.has(property)) ||
                  (locked.has("scale") && SCALE_PROPERTIES.has(property))
              )
            : undefined;
          if (!moves || moves.length) {
            fail(
              `animation ${animation.preset}`,
              `would ${moves ? `drive ${moves.join(", ")}` : "drive properties that cannot be determined"}, but this placement is locked. A locked layer takes only opacity animations such as fade.`
            );
          }
        }
      }
    }
  };
  const assertCandidateOwnership = (
    candidate: FinishedStoryboardDocument
  ): void => {
    for (const clip of candidate.clips) {
      const before = initial.get(clip.id);
      if (before) {
        if (
          clip.storyboardBoardId !== before.storyboardBoardId ||
          clip.storyboardShotId !== before.storyboardShotId ||
          clip.storyboardElementId !== before.storyboardElementId
        ) {
          throw new Error(
            `Finishing cannot replace semantic ownership on ${clip.id}.`
          );
        }
      } else {
        const window = windows.find(
          (value) =>
            clip.startMs >= value.start &&
            clip.startMs + clip.durationMs <= value.start + value.duration
        );
        const decoration = generated.get(clip.id);
        if (decoration) {
          if (
            window?.shotId !== decoration.shotId ||
            clip.storyboardElementId !== decoration.element.id ||
            clip.currentAssetId !== decoration.element.asset_id
          ) {
            throw new Error(
              `Finishing cannot move or replace the generated decoration ${clip.id}.`
            );
          }
          continue;
        }
        if (!window || !["text", "shape", "group"].includes(clip.mediaType)) {
          throw new Error(
            "New finishing layers must be editable text/shapes/groups inside an existing shot window. Add source media to the Storyboard first."
          );
        }
        if (clip.mediaType === "text") {
          const shot = input.shots.find((value) => value.id === window.shotId);
          const allowedCopy = (shot ? activeStoryboardGraphics(shot) : [])
            .filter(
              (element) =>
                element.kind === "text" && !element.protected_input_id
            )
            .map((element) => element.text);
          if (!allowedCopy.includes(clip.textStyle?.text)) {
            throw new Error(
              "Additional text must use approved unprotected Storyboard copy. Protected copy already has its exact semantic layer."
            );
          }
        }
      }
      const current = input.current?.clips.find(
        (value) => value.id === clip.id
      );
      if (current && clip.name !== current.name) {
        throw new Error(
          `Finishing cannot rename existing Timeline layer ${clip.id}. Preserve its current user-owned name.`
        );
      }
      if (current) {
        for (const field of manualFields(current)) {
          if (canonical(clip[field]) !== canonical(current[field])) {
            throw new Error(
              `Manual ${field} edit on ${clip.id} conflicts with finishing. Keep the manual value or use a separate Timeline.`
            );
          }
        }
      }
    }
    if (json(candidate.markers) !== json(scaffold.markers)) {
      throw new Error(
        "Finishing cannot modify manually owned Timeline markers."
      );
    }
    for (const track of scaffold.tracks) {
      if (
        input.current?.tracks.some((value) => value.id === track.id) &&
        json(candidate.tracks.find((value) => value.id === track.id)) !==
          json(track)
      ) {
        throw new Error(
          `Finishing cannot change an existing track's manually owned configuration: ${track.id}.`
        );
      }
    }
    for (const before of scaffold.clips) {
      const after = candidate.clips.find((value) => value.id === before.id);
      if (!after) {
        throw new Error(`Finishing cannot delete source layer ${before.id}.`);
      }
      if (
        before.storyboardBoardId !== input.boardId &&
        json(before) !== json(after)
      ) {
        throw new Error(
          `Finishing cannot change manually owned layer ${before.id}.`
        );
      }
      if (
        before.storyboardBoardId === input.boardId &&
        (before.mediaType !== after.mediaType ||
          before.currentAssetId !== after.currentAssetId ||
          before.sourceType !== after.sourceType ||
          json(before.versions) !== json(after.versions))
      ) {
        throw new Error(
          `Finishing cannot replace accepted source media on ${before.id}.`
        );
      }
      const windowError = sourceWindowConflict(before, after, input.boardId);
      if (windowError) {
        throw new Error(windowError);
      }
    }
    assertAuthoredPlacements(candidate);
  };
  const permittedOpNames = [
    "get_state",
    "list_animation_presets",
    "add_track",
    "move_track",
    "delete_track",
    "add_text_clip",
    "add_shape_clip",
    "set_clip_params",
    "animate_clip",
    "clear_animations",
    "set_transition",
    "set_parent",
    "set_matte",
    "add_group"
  ] as const;
  // A layout pass composes still frames. Motion is the finish pass's work.
  const MOTION_OPS = new Set(["list_animation_presets", "animate_clip", "clear_animations", "set_transition"]);
  const phaseOpNames = permittedOpNames.filter(
    (op) => !layoutPhase || !MOTION_OPS.has(op)
  );
  const permittedOps = new Set<string>(phaseOpNames);
  const contracts = buildTimelineToolContracts({
    staggerUnits: STAGGER_UNITS,
    animatedProperties: ANIMATED_PROPERTIES,
    beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
  });
  const operationContracts = Object.fromEntries(
    phaseOpNames.map((op) => {
      const contract = contracts[`ui_timeline_${op}`];
      return [
        op,
        {
          description: contract.description,
          parameters: zodToJsonSchema(uiToolParams(contract))
        }
      ];
    })
  );
  const scopeInstructions =
    (layoutPhase
      ? "This is the layout pass: compose the settled frame of every shot and author no motion. The finish pass adds motion later and keeps your placement. "
      : "") +
    "Only these operations are available: " +
    [...permittedOps].join(", ") +
    ". Each op is {op, ...flat arguments} from operationContracts. There is no saved timeline_id requirement for this isolated draft. " +
    "A layer with an authored placement in authoredPlacements keeps it: edit it only within its limits, never change a locked property (position, scale or crop), and expect a rejected edit otherwise. " +
    (layoutPhase ? "" : "A locked layer takes only opacity animations such as fade, never a preset that moves or scales it. ") +
    "Keep existing source layer startMs/durationMs, assets, exact protected text/colors and semantic ownership unchanged. " +
    "set_clip_params uses fontSizePx (not fontSize), textStyle and transform.position.x/y in sequence pixels relative to frame center. " +
    "Protected layers may use only fade (requires allowed opacity), slide (opacity+position) or pop (opacity+scale), each with role in or out. No emphasis or loop animation is available on a protected layer; express emphasis through size, weight, color, spacing or entrance timing. " +
    "Copy must keep clear space from images, other copy and the frame edge at every shot's hold frame. A mechanical layout check measures this before visual review; fix every layoutDefects entry by moving or resizing the named clips. " +
    "Other protected presets/custom curves, group inheritance, masks/effects fail policy validation. set_transition is forbidden on every protected layer, including crossfade; use permitted fade animations instead. Unprotected decorative layers can use existing animation presets/custom curves. " +
    "New editable decorative layers require stable name/startMs/durationMs inside one shot window. New text may only use approved unprotected Storyboard copy; protected copy already has its exact semantic layer, so use set_clip_params on that existing clip to author its presentation. Read every edit result and fix failures before submitting.";
  let previousCandidateImages: MessageContent[] = [];
  const inspect: ProviderTool = {
    name: "get_timeline",
    description:
      "Read the entire current isolated editable draft, with source and semantic provenance.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const submit: ProviderTool = {
    name: "submit_finished_cut",
    description:
      "Submit an authored draft for mandatory policy, structure, render and visual review. A new cut requires actual editable composition or motion changes from its deterministic scaffold. Existing reviewed cuts may remain unchanged. No document is saved yet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  };
  const edit: ProviderTool = {
    ...editTimelineSpec,
    inputSchema: {
      type: "object",
      properties: {
        ops: {
          type: "array",
          items: { type: "object" },
          description: scopeInstructions
        }
      },
      required: ["ops"],
      additionalProperties: false
    },
    description:
      "Apply existing Timeline operations to this isolated draft. No save, generation or external write is available. Use exact clip IDs from get_timeline. " +
      scopeInstructions
  };
  const review: ProviderTool = {
    name: "review_finished_cut",
    description:
      "Inspect EVERY actual candidate frame and report one frameReviews entry per supplied candidate timeMs. References are separate, never candidate frames. findings contain only current unresolved material defects, never positive observations, withdrawn suspicions or resolved issues. Each frame passed must equal whether its findings are empty. Overall passed must equal every frame passed; overall findings is the unique union of frame findings. Submit an internally consistent explicit verdict and visual summary. Cannot waive source/policy/structure validation.",
    inputSchema: zodToJsonSchema(reviewSchema)
  };

  const decorate: ProviderTool | undefined =
    layoutPhase && options.imageModel
      ? {
          name: "generate_decoration",
          description:
            `Generate one image with the selected image model and add it to one shot as an editable decorative layer. Use it for a background that fills the frame or for a decorative object, never for a product, logo, person, text or a replacement of a source image. layer "background" sits directly above the shot's color background and is scaled to cover the frame. layer "overlay" sits above every layer at half size, centered; place and size it with set_clip_params. Describe the image completely in prompt, with no text, letters or logos. At most ${MAX_DECORATIONS} per cut. Reuse a name to read back the layer it already made.`,
          inputSchema: {
            type: "object",
            properties: {
              shotId: { type: "string", description: "The shot the layer belongs to." },
              name: { type: "string", description: "A short stable name, such as warm-gradient." },
              prompt: { type: "string", description: "The complete image description." },
              layer: { type: "string", enum: ["background", "overlay"] }
            },
            required: ["shotId", "name", "prompt", "layer"],
            additionalProperties: false
          }
        }
      : undefined;

  const drive = async (
    label: string,
    messages: Message[],
    tools: ProviderTool[],
    execute: NonNullable<
      Parameters<typeof runtime.provider.generateLoop>[0]["executeTool"]
    >
  ): Promise<void> => {
    signal?.throwIfAborted();
    // The loop runs for minutes. Its text and tool calls go on the run's
    // context, so a host streaming it (a mini app) shows the work.
    const reporter = agentActivityReporter(run.context, label);
    // SDK-native loops can issue parallel MCP callbacks despite sequentialTools.
    // Serialize access to this one isolated draft, including reads and submission.
    let executionTail: Promise<void> = Promise.resolve();
    for await (const event of runtime.provider.generateLoop({
      messages,
      model: runtime.model,
      effort: "medium",
      thinking: { type: "disabled" },
      tools,
      providedToolsOnly: true,
      executeTool: (call) => {
        const pending = executionTail.then(async () => {
          signal?.throwIfAborted();
          try {
            const result = await execute(call);
            reporter.toolResult(call, result, false);
            return result;
          } catch (error) {
            reporter.toolResult(
              call,
              error instanceof Error ? error.message : String(error),
              true
            );
            throw error;
          }
        });
        executionTail = pending.then(
          () => undefined,
          () => undefined
        );
        return pending;
      },
      maxIterations: 12,
      sequentialTools: true,
      signal,
      turnBudget: run.budget ?? runtime.budget ?? budgetFromContext(run.context)
    })) {
      signal?.throwIfAborted();
      if (isProviderStop(event)) {
        throw new Error(`Finishing stopped: ${event.reason}`);
      }
      reporter.event(event);
    }
    await executionTail;
  };

  const { current: _current, ...referenceInput } = input;
  const references = input.shots.map((shot) => ({
    shotId: shot.id,
    ...buildStoryboardDesignFrame(referenceInput, shot.id, {
      style: board.style,
      context: board.creative_context
    })
  }));
  if (references.some((reference) => reference.validation.length)) {
    throw new Error(
      "The semantic Storyboard cannot produce faithful design reference frames."
    );
  }
  const { loadMediaRefBytes } = await import("@nodetool-ai/runtime");
  signal?.throwIfAborted();
  const referenceRender = await renderTimelineFrames({
    sequence: { ...sequence.toTimelineSequence(), ...references[0].document },
    timesMs: references.map((reference) => reference.timeMs),
    width: 540,
    loadAsset: (assetId) => {
      signal?.throwIfAborted();
      return loadMediaRefBytes({ asset_id: assetId }, run.context);
    }
  });
  signal?.throwIfAborted();
  if (
    !referenceRender.complete ||
    referenceRender.effectsNotApplied.length ||
    referenceRender.fontsUnavailable.length
  ) {
    const failures = [
      ...referenceRender.fontsUnavailable.map((font) => `Unavailable font: ${font}`),
      ...referenceRender.effectsNotApplied.map((effect) => `Unsupported effect: ${effect}`),
      ...referenceRender.frames.flatMap((frame) => frame.failures.map((failure) => `${failure.clip_name ?? failure.clip_id ?? "Layer"}: ${failure.reason}`))
    ];
    throw new Error(
      `Derived Storyboard design references could not render completely. ${[...new Set(failures)].join(" ")}`
    );
  }
  const referenceEvidence = references.map((reference, index) => ({
    shotId: reference.shotId,
    fingerprint: createHash("sha256")
      .update(reference.fingerprint)
      .digest("hex"),
    timeMs: reference.timeMs,
    sha256: createHash("sha256")
      .update(referenceRender.frames[index].png)
      .digest("hex")
  }));
  const loadAsset = (assetId: string): Promise<Uint8Array | null> => {
    signal?.throwIfAborted();
    return loadMediaRefBytes({ asset_id: assetId }, run.context);
  };
  // The reference is derived from the same materializer, so it can carry the
  // same layout defect. Name it so neither agent copies it as approved.
  const referenceLayoutDefects = await findLayoutDefects({
    sequence: { ...sequence.toTimelineSequence(), ...references[0].document },
    windows,
    holds: shotHoldTimes(references[0].document.clips, windows, input.width, input.height),
    loadAsset,
    signal
  });
  const referenceImages: MessageContent[] = referenceRender.frames.flatMap(
    (frame, index) => [
      {
        type: "text",
        text: `Derived design reference for shot ${references[index].shotId} at ${frame.time_ms}ms, from the expected Storyboard revision's semantic intent. Fingerprint ${referenceEvidence[index].fingerprint}. This is not a separate historical pixel approval.`
      },
      {
        type: "image_url",
        image: {
          uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
        }
      }
    ]
  );

  const authoringPrompt = layoutPhase
    ? "Lay out the approved WHOLE CUT as still frames: one settled frame per shot, consistent across the cut. The deterministic scaffold stacks every layer in fixed slots by role. Treat it only as the list of what each shot shows, never as a layout to keep. Inspect the design references and the semantic graphic direction, then position and scale every image and copy layer with set_clip_params so each hold frame reads as one deliberate composition: one clear focal image, a readable type hierarchy, balanced empty space, and a grid and margins that repeat from shot to shot. Set copy size, weight, alignment and line width. Scale each image to its role. An image may bleed off a frame edge. authoredPlacements lists the elements that have an authored placement: an element with a frame keeps that placement, you adjust it only within its limits, you never change a property listed in its lock, and you compose freely only the elements without a frame. A placement that breaks a lock or a limit is rejected. You may add editable shapes for panels, rules or frames that hold copy. " +
      (decorate
        ? "An image model is selected, so you may use generate_decoration for a background or a decorative object when the direction of a shot calls for one. A generated background carries the theme of its shot with texture, light or a scene, not a flat gradient, and keeps a calm area behind the copy. Keep every product and source image the subject, and keep copy readable on what you generate. "
        : "") +
      "Author no motion: entrances, exits and transitions belong to the finish pass, which keeps your placement. Use the supplied scaffold and operationContracts directly; do not request get_timeline when its data is already present. Preserve all source assets, exact copy/colors, semantic IDs, shot windows and manual edits. manualEdits lists the layer fields a person changed: never edit those fields, and compose around them. On a cut that already has a layout, keep what works and change only what the review or the new content needs. referenceLayoutDefects lists collisions the scaffold itself contains, and the layout must not repeat them. Read every edit result, correct rejected edits, then submit_finished_cut when ready. At a revision, fix every reported defect, including every previousReview.layoutDefects entry."
    : (motionPending
        ? "The current cut carries the approved static layout from planning. Keep every layer's position, scale, crop and type style, and author the motion: entrances, emphasis, exits and transitions that follow the motion direction and the shot timing. "
        : "") +
      "Finish the approved WHOLE CUT, not an isolated shot. The deterministic scaffold establishes faithful source layers and timing; it is your starting point, not evidence of agentic finishing. Inspect all derived design references and semantic graphic/motion direction, then deliberately author an editable composition: readable type hierarchy, balanced product/copy layout, graphic rhythm and continuity across the cut. Use the supplied full scaffold and operationContracts directly; do not request get_timeline or list_animation_presets redundantly when their data is already present. Author a focused batch of deliberate edits rather than redesigning every layer. Use existing Timeline operations and their exact operationContracts. Make meaningful layout, typography, decorative or animation choices that serve this board. Do not make arbitrary nudges, metadata changes or add empty layers merely to satisfy authoring. On a new cut, author actual layout or motion before submitting; on an existing finished cut, preserve good prior work and submit unchanged if no revision is needed. Preserve all source assets, exact copy/colors, semantic IDs, shot windows and manual edits. manualEdits lists the layer fields a person changed: never edit those fields, and compose around them. Do not invent or generate replacement media. The design references show content, hierarchy and intent, not approved pixel layout: referenceLayoutDefects lists collisions the references themselves contain, and the cut must not repeat them. Read every edit result, correct rejected edits, then submit_finished_cut when ready. At a revision, fix every reported defect, including every previousReview.layoutDefects entry. Storyboard contains semantic intent, never an animation implementation. The Timeline is execution truth.";
  const decorations: StoryboardDecoration[] = [];
  const authoredPlacements = input.shots.flatMap((shot) =>
    activeStoryboardGraphics(shot).flatMap((element) => {
      const placement = authoredPlacement(element);
      return placement
        ? [{ shotId: shot.id, elementId: element.id, frame: placement.frame, typography: placement.typography, lock: placement.lock, limits: placement.limits }]
        : [];
    })
  );
  const shotReviewRules = input.shots.flatMap((shot) => {
    const rules: unknown = isRecord(shot.graphics) ? shot.graphics["review_rules"] : undefined;
    const list = Array.isArray(rules) ? rules.filter((rule): rule is string => typeof rule === "string" && !!rule.trim()) : [];
    return list.length ? [{ shotId: shot.id, rules: list }] : [];
  });
  // What the reviewer must not call a defect: placements a template locked.
  const lockedSummary = input.shots.flatMap((shot) =>
    activeStoryboardGraphics(shot).flatMap((element) => {
      const placement = authoredPlacement(element);
      if (!placement?.lock.length) {
        return [];
      }
      const box = frameBox(placement);
      return [`${shot.id}/${element.id}${box ? ` box [${box.join(", ")}]` : ""} locked: ${placement.lock.join(", ")}`];
    })
  );
  const lockedPlacementNote = lockedSummary.length
    ? `These placements are authored and locked: ${lockedSummary.join("; ")}. Do not report their position or size as a defect.`
    : undefined;
  const addDecoration = async (args: Record<string, unknown>): Promise<string> => {
    const imageModel = options.imageModel;
    const { shotId, name, prompt, layer } = args;
    if (!imageModel) {
      return json({ ok: false, error: "No image model is selected for this cut." });
    }
    if (
      typeof shotId !== "string" ||
      typeof name !== "string" ||
      typeof prompt !== "string" ||
      !prompt.trim() ||
      (layer !== "background" && layer !== "overlay")
    ) {
      return json({ ok: false, error: "Give shotId, name, prompt and layer (background or overlay)." });
    }
    const window = windows.find((value) => value.shotId === shotId);
    const shot = input.shots.find((value) => value.id === shotId);
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (!window || !shot || !slug) {
      return json({ ok: false, error: `Use a shot id from the storyboard and a name with letters or digits.` });
    }
    const elementId = `decor-${slug}`;
    const existing = document.clips.find(
      (clip) => clip.storyboardShotId === shotId && clip.storyboardElementId === elementId
    );
    if (existing) {
      return json({ ok: true, alreadyExists: true, clipId: existing.id });
    }
    if (decorations.length >= MAX_DECORATIONS) {
      return json({ ok: false, error: `This cut already has ${MAX_DECORATIONS} generated decorations. Place or restyle those.` });
    }
    // Ask for the frame's own shape, so a background covers it with little crop.
    const portrait = input.height >= input.width;
    const shortSide = Math.max(512, Math.round((1536 * Math.min(input.width, input.height)) / Math.max(input.width, input.height) / 64) * 64);
    const requested =
      layer === "overlay"
        ? { width: 1024, height: 1024 }
        : portrait
          ? { width: shortSide, height: 1536 }
          : { width: 1536, height: shortSide };
    let result: unknown;
    try {
      result = await run.invoke("generate_image", {
        model: { provider: imageModel.provider, id: imageModel.id },
        prompt: prompt.trim(),
        ...requested
      });
    } catch (error) {
      result = { error: error instanceof Error ? error.message : String(error) };
    }
    signal?.throwIfAborted();
    const assetId = isRecord(result) && typeof result["asset_id"] === "string" ? result["asset_id"] : undefined;
    if (!assetId) {
      const reason = isRecord(result) && typeof result["error"] === "string" ? result["error"] : "The image model returned no image.";
      return json({ ok: false, error: reason });
    }
    let size = requested;
    const bytes = await loadAsset(assetId);
    if (bytes) {
      try {
        const image = await loadImage(Buffer.from(bytes));
        size = { width: image.width, height: image.height };
      } catch {
        // Keep the requested size. Only the cover scale depends on it.
      }
    }
    // A layer draws contained in the frame at scale 1. Covering the frame takes
    // the ratio of the two fits.
    const fitX = input.width / size.width;
    const fitY = input.height / size.height;
    const scale = layer === "background" ? Math.max(fitX, fitY) / Math.min(fitX, fitY) : 0.5;
    const tracks = document.tracks.map((track) => ({ ...track }));
    let index = Math.max(-1, ...tracks.map((track) => track.index)) + 1;
    if (layer === "background") {
      const backdrop = document.clips.find(
        (clip) => clip.storyboardShotId === shotId && clip.storyboardElementId === "background"
      );
      const above = tracks.find((track) => track.id === backdrop?.trackId)?.index;
      index = above === undefined ? Math.min(0, ...tracks.map((track) => track.index)) : above + 1;
      for (const track of tracks) {
        if (track.index >= index) {
          track.index += 1;
        }
      }
    }
    const track = makeTrack({ type: "overlay", name: `${shot.slug ?? shot.id}: ${elementId}`, index });
    const clip = makeClip({
      trackId: track.id,
      name: elementId,
      startMs: window.start,
      durationMs: window.duration,
      mediaType: "image",
      sourceType: "imported",
      status: "generated",
      versions: [],
      storyboardBoardId: input.boardId,
      storyboardShotId: shotId,
      storyboardElementId: elementId,
      storyboardElementRole: "decorative",
      currentAssetId: assetId,
      transform: { position: { x: 0, y: 0 }, scale: { x: scale, y: scale }, rotation: 0, anchor: { x: 0.5, y: 0.5 } },
      animations: []
    });
    const decoration: StoryboardDecoration = {
      shotId,
      element: { id: elementId, kind: "asset", role: "decorative", asset_id: assetId, direction: prompt.trim(), origin: "layout_agent" }
    };
    const candidate = { ...document, tracks: [...tracks, track], clips: [...document.clips, clip] };
    const graphics = (shot.graphics ??= { mode: "graphics_first", elements: [] });
    const elements = (graphics.elements ??= []);
    elements.push(decoration.element);
    generated.set(clip.id, decoration);
    try {
      assertCandidateOwnership(candidate);
      const policy = validateProducedTimeline(input, candidate);
      if (policy.length) {
        throw new Error(json(policy));
      }
    } catch (error) {
      elements.pop();
      generated.delete(clip.id);
      return json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    document = candidate;
    decorations.push(decoration);
    return json({ ok: true, clipId: clip.id, trackId: track.id, assetId, imageSize: size, scale });
  };

  const commit = (document: FinishedStoryboardDocument): void => {
    for (const clip of document.clips) {
      if (clip.storyboardBoardId !== input.boardId) {
        continue;
      }
      stampStoryboardMaterializationBaseline(clip);
      const previous = input.current?.clips.find(
        (value) => value.id === clip.id
      );
      if (
        previous?.storyboardMaterializationBaseline &&
        !clip.storyboardElementId?.startsWith("$agent:")
      ) {
        const prior: unknown = JSON.parse(
          previous.storyboardMaterializationBaseline
        );
        const accepted: unknown = JSON.parse(
          clip.storyboardMaterializationBaseline ?? "null"
        );
        if (isRecord(prior) && isRecord(accepted)) {
          for (const field of ["transform", "startMs", "durationMs"] as const) {
            if (canonical(previous[field]) !== canonical(prior[field])) {
              accepted[field] = prior[field];
            }
          }
          clip.storyboardMaterializationBaseline = canonical(accepted);
        }
      }
    }
    document.storyboardMaterializations = [
      ...(document.storyboardMaterializations ?? []).filter(
        (entry) => entry.boardId !== input.boardId
      ),
      {
        boardId: input.boardId,
        elementKeys: document.clips
          .filter((clip) => clip.storyboardBoardId === input.boardId)
          .map((clip) => `${clip.storyboardShotId}/${clip.storyboardElementId}`),
        // A new layout waits for its motion. A finished cut laid out again
        // keeps its motion, so it stays finished.
        stage: layoutPhase && priorStage !== "finished" ? "layout" : "finished"
      }
    ];
  };

  // The best reviewed candidate so far, and the failing frame times (as JSON)
  // and findings of each reviewed round, for the early stop on a repeated failure.
  let best:
    | {
        document: FinishedStoryboardDocument;
        decorations: StoryboardDecoration[];
        failing: number;
        findings: string[];
      }
    | undefined;
  const failingByRound = new Map<number, { frames: string; findings: string[] }>();
  for (let round = 0; round < 3; round += 1) {
    const beforeRevision = json(document);
    let submitted = false;
    let rejectedEdit: string | undefined;
    const editResults: string[] = [];
    const recordEditResult = (result: string): string => {
      editResults.push(result.slice(0, 1600));
      return result;
    };
    const diagnostics = (): string =>
      json({
        previousReview: feedback,
        lastEditResults: editResults.slice(-4)
      }).slice(0, 8000);
    const authoringMessages: Message[] = [
        {
          role: "system",
          content: authoringPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: json({
                storyboard: board,
                resolvedProduction: input,
                scaffold: document,
                target: {
                  width: input.width,
                  height: input.height,
                  fps: sequence.fps
                },
                previousReview: feedback,
                referenceLayoutDefects,
                needsInitialAuthoring,
                manualEdits,
                authoredPlacements,
                ...(shotReviewRules.length && { reviewRules: shotReviewRules }),
                operationContracts,
                finishingConstraints: scopeInstructions
              })
            },
            ...referenceImages,
            ...previousCandidateImages
          ]
        }
      ];
    const authoringTools = decorate ? [inspect, edit, decorate, submit] : [inspect, edit, submit];
    const author: Parameters<typeof drive>[3] = async (call) => {
        signal?.throwIfAborted();
        if (submitted) {
          return "The candidate is submitted. End this authoring turn.";
        }
        if (call.name === inspect.name) {
          return json(document);
        }
        if (decorate && call.name === decorate.name) {
          return recordEditResult(await addDecoration(call.args));
        }
        if (call.name === submit.name) {
          if (rejectedEdit) {
            return recordEditResult(
              `Correct the rejected edit before submitting: ${rejectedEdit}`
            );
          }
          if (
            needsInitialAuthoring &&
            composition(document) === startComposition
          ) {
            return recordEditResult(
              motionPending
                ? "This cut still holds only the planned static layout. Author its motion with animate_clip and set_transition from the motion direction, read the results, then submit again. Keep the planned placement and sizes."
                : "This new cut is still the unchanged deterministic scaffold. Author meaningful editable layout or motion from the full-board direction with edit_timeline, read its result, then submit again. Read-only, no-op and metadata-only edits do not finish a new agentic cut."
            );
          }
          submitted = true;
          return "Candidate submitted for mandatory review.";
        }
        if (call.name !== edit.name) {
          return "Only isolated Timeline editing is available.";
        }
        const ops = parseOps(call.args["ops"]);
        if (!Array.isArray(ops)) {
          return recordEditResult(json(ops));
        }
        if (
          ops.some(
            (operation) =>
              !permittedOps.has(operation.op.replace("ui_timeline_", ""))
          )
        ) {
          return recordEditResult(
            "This finishing operation is unavailable. " + scopeInstructions
          );
        }
        const pending = [];
        const existingResults = [];
        const identities = new Set<string>();
        for (const operation of ops) {
          const kind =
            operation.op === "ui_timeline_add_shape_clip"
              ? "shape"
              : operation.op === "ui_timeline_add_text_clip"
                ? "text"
                : operation.op === "ui_timeline_add_group"
                  ? "group"
                  : undefined;
          if (!kind) {
            pending.push(operation);
            continue;
          }
          const name = operation.input["name"];
          const start = operation.input["startMs"];
          const duration = operation.input["durationMs"];
          const window = windows.find(
            (value) =>
              typeof start === "number" &&
              typeof duration === "number" &&
              start >= value.start &&
              start + duration <= value.start + value.duration
          );
          if (typeof name !== "string" || !name.trim() || !window) {
            return recordEditResult(
              "New layers require an explicit stable semantic name, startMs and durationMs inside one shot window. Reuse that name on reruns; edit an existing layer with set_clip_params."
            );
          }
          const key = `${window.shotId}/$agent:${kind}:${encodeURIComponent(name.trim())}`;
          if (identities.has(key)) {
            return recordEditResult(
              `Duplicate semantic addition ${key} in one batch.`
            );
          }
          identities.add(key);
          const existing = document.clips.find(
            (clip) =>
              clip.storyboardBoardId === input.boardId &&
              clip.storyboardShotId === window.shotId &&
              clip.storyboardElementId === key.slice(window.shotId.length + 1)
          );
          if (existing) {
            existingResults.push({
              op: operation.op,
              ok: true,
              result: {
                alreadyExists: true,
                clipId: existing.id,
                semanticIdentity: key
              }
            });
          } else {
            pending.push(operation);
          }
        }
        if (!pending.length) {
          return recordEditResult(json(existingResults));
        }
        // Hermetic mode removes generation, Blender rendering and DB-writing hooks.
        const outcome = await applyOps(run, sequence, document, pending, {
          hermetic: true
        });
        if (
          !outcome.records.some(
            (record) =>
              record.ok &&
              !["get_state", "list_animation_presets"].includes(
                record.op.replace("ui_timeline_", "")
              )
          )
        ) {
          return recordEditResult(
            json([...existingResults, ...outcome.records])
          );
        }
        const candidate = {
          ...document,
          tracks: outcome.state.documentTracks,
          clips: outcome.state.documentClips,
          markers: outcome.state.markers,
          camera2d: outcome.state.camera2d,
          mediaTracks: outcome.state.mediaTracks,
          tempo: outcome.state.tempo
        };
        for (const clip of candidate.clips) {
          if (initial.has(clip.id) || clip.storyboardBoardId) {
            continue;
          }
          const window = windows.find(
            (value) =>
              clip.startMs >= value.start &&
              clip.startMs + clip.durationMs <= value.start + value.duration
          );
          if (window && ["text", "shape", "group"].includes(clip.mediaType)) {
            clip.storyboardBoardId = input.boardId;
            clip.storyboardShotId = window.shotId;
            clip.storyboardElementId = `$agent:${clip.mediaType}:${encodeURIComponent(clip.name.trim())}`;
          }
        }
        try {
          assertCandidateOwnership(candidate);
          const policy = validateProducedTimeline(input, candidate);
          if (policy.length) {
            throw new Error(
              `Produced Timeline violates production requirements: ${json(policy)}`
            );
          }
        } catch (error) {
          rejectedEdit = error instanceof Error ? error.message : String(error);
          return recordEditResult(
            json({
              ok: false,
              rolledBack: true,
              error: rejectedEdit,
              resolution:
                "No changes from this batch were applied. Preserve source timing, ownership and manual edits. Edit existing protected copy with set_clip_params for presentation only. New text must use approved unprotected Storyboard copy. Retry the corrected batch."
            })
          );
        }
        document = candidate;
        rejectedEdit = undefined;
        return recordEditResult(json([...existingResults, ...outcome.records]));
      };
    const phaseLabel = layoutPhase ? "layout" : "finish";
    await drive(phaseLabel, authoringMessages, authoringTools, author);
    // A model that ends its turn after accepted edits has authored a
    // candidate. The checks and the visual review below still gate it.
    const authored = (): boolean =>
      !rejectedEdit &&
      beforeRevision !== json(document) &&
      (!needsInitialAuthoring || composition(document) !== startComposition);
    if (!submitted && !authored()) {
      // A model sometimes ends its turn after it reads a failed review. One
      // reminder turn names the work that is still due.
      await drive(phaseLabel, [
        ...authoringMessages,
        {
          role: "user",
          content: `Your turn ended without ${rejectedEdit ? "a corrected edit" : "an edit"} or a submission. ${round > 0 ? "Fix every finding in previousReview" : "Author the composition"} with edit_timeline, read each result, then call submit_finished_cut.`
        }
      ], authoringTools, author);
    }
    if (!submitted && !authored()) {
      throw new Error(
        `Finished-cut agent did not submit a candidate: ${diagnostics()}`
      );
    }
    if (round > 0 && beforeRevision === json(document)) {
      throw new Error(
        `Finishing did not revise the draft after reported defects: ${diagnostics()}`
      );
    }
    assertCandidateOwnership(document);
    const policy = validateProducedTimeline(input, document);
    const structural = validateTimelineSequence(document, {
      fps: sequence.fps,
      width: input.width,
      height: input.height
    });
    if (policy.length || !structural.ok) {
      feedback = { policy, structural };
      continue;
    }
    const candidateSequence = { ...sequence.toTimelineSequence(), ...document };
    const holds = shotHoldTimes(document.clips, windows, input.width, input.height);
    signal?.throwIfAborted();
    const layoutDefects = await findLayoutDefects({
      sequence: candidateSequence,
      windows,
      holds,
      loadAsset,
      signal
    });
    if (layoutDefects.length) {
      feedback = {
        layoutDefects,
        resolution:
          "A pixel measurement of each layer at its shot's hold frame found these collisions. Move or resize the named clips with set_clip_params, then submit again."
      };
      continue;
    }
    // The hold frame is where a viewer reads each shot, so the review always sees it.
    const holdShots = new Map([...holds].map(([shotId, timeMs]) => [timeMs, shotId]));
    const timesMs = [
      ...new Set([
        // A layout has no motion to judge, so its review sees the hold frames.
        ...(layoutPhase ? [] : storyboardReviewTimes(document.clips, input.width, input.height, sequence.fps)),
        ...holdShots.keys()
      ])
    ].sort((left, right) => left - right);
    signal?.throwIfAborted();
    const frames = await renderTimelineFrames({
      sequence: candidateSequence,
      timesMs,
      width: 540,
      loadAsset
    });
    signal?.throwIfAborted();
    if (
      !frames.complete ||
      !frames.frames.length ||
      frames.effectsNotApplied.length ||
      frames.fontsUnavailable.length
    ) {
      feedback = {
        renderDefects: frames.frames.map((frame) => ({
          timeMs: frame.time_ms,
          dropped: frame.dropped,
          degraded: frame.degraded,
          failures: frame.failures
        })),
        effectsNotApplied: frames.effectsNotApplied,
        fontsUnavailable: frames.fontsUnavailable
      };
      continue;
    }
    previousCandidateImages = frames.frames.flatMap(
      (frame): MessageContent[] => [
        {
          type: "text",
          text: `Previous candidate cut frame at ${frame.time_ms}ms. Revise defects identified in previousReview. This is the candidate, not the derived design reference.`
        },
        {
          type: "image_url",
          image: {
            uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
          }
        }
      ]
    );
    let verdict: z.infer<typeof reviewSchema> | undefined;
    const content: MessageContent[] = [
      {
        type: "text",
        text: json({
          storyboard: board,
          resolvedProduction: input,
          timeline: document,
          frameTimesMs: frames.frames.map((frame) => frame.time_ms),
          candidateFrameCount: frames.frames.length,
          designReferenceFrameCount: referenceEvidence.length,
          instruction: layoutPhase
            ? "Visually review the settled HOLD frame of every shot as a still layout against the approved semantic graphics and the full-cut direction. The first images are labeled design references derived from the expected Storyboard revision; they show content and intent, not an approved layout. The subsequent images are the actual candidate frames. Exact identity and copy clearance were checked mechanically before this review. In each frame, check every pair of neighbouring elements: copy that touches or crosses an image edge, copy crowded against other copy, copy near the frame edge, an image too small or too large for its role, an asset drawn as an opaque box where the design wants a cut-out, a generated background that fights the copy or the product, unbalanced empty areas, a grid or margins that change from shot to shot, and wrong hierarchy or contrast are all material defects. Motion is not part of this review. Fail on any material defect."
            : "Visually review all rendered frames against approved semantic graphics and full-cut direction. The first images are labeled design references derived from the expected Storyboard revision. The subsequent images are the actual candidate cut. Use the references for content, hierarchy and intent only. They are not approved pixel layout and can contain the same defects: referenceLayoutDefects lists collisions measured in them, and a candidate that repeats a reference defect fails. Exact identity and copy clearance at hold frames are checked mechanically before this review. At each HOLD frame, check every pair of neighbouring elements: copy that touches or crosses an image edge, copy crowded against other copy, copy near the frame edge, an asset drawn as an opaque box where the design wants a cut-out, unbalanced empty areas and wrong hierarchy or contrast are all material defects. Across motion frames, find awkward motion endpoints and continuity failures. Fail on any material defect.",
          referenceLayoutDefects,
          ...(shotReviewRules.length && { reviewRules: shotReviewRules }),
          ...(lockedPlacementNote && { lockedPlacements: lockedPlacementNote })
        })
      },
      ...referenceImages,
      ...frames.frames.flatMap(
        (frame): MessageContent[] => [
          {
            type: "text",
            text: holdShots.has(frame.time_ms)
              ? `Actual candidate HOLD frame for shot ${holdShots.get(frame.time_ms)} at ${frame.time_ms}ms: every entrance has finished and no exit has started. Judge the settled composition, spacing and hierarchy here. Include exactly one frameReviews entry for this timeMs. This is not a derived design reference.`
              : `Actual candidate motion frame at ${frame.time_ms}ms. Include exactly one frameReviews entry for this timeMs. This is not a derived design reference.`
          },
          {
            type: "image_url",
            image: {
              uri: `data:image/png;base64,${Buffer.from(frame.png).toString("base64")}`
            }
          }
        ]
      )
    ];
    await drive(
      "review",
      [
        {
          role: "system",
          content:
            "You are the visual finishing reviewer. Inspect the actual supplied composited frame pixels. Design references and actual candidate frames are labeled separately. Review each actual candidate timeMs exactly once. The schedule deliberately includes entrance and exit boundaries where intended fades can be transparent. Judge layout, spacing and legibility at the labeled HOLD frames, and motion continuity across neighboring motion frames, not constant visibility at intentionally transparent boundaries. A design reference never excuses a defect: if the candidate shares a collision or crowding with its reference, report it. Call review_finished_cut with an internally consistent overall and per-frame verdict. Findings are ONLY current unresolved actionable material defects. Put positive observations and withdrawn suspicions in summary, not findings. If no material defect remains, explicitly set passed true with empty findings for every frame and overall. If any frame has a material defect, set that frame and overall passed false with the exact defect in both findings lists. When the payload lists reviewRules, judge each shot against its rules as material defects. When it lists lockedPlacements, never report the position or size of those layers as a defect. Never approve without inspecting the whole cut. Never reject merely to report positive observations or previously resolved issues."
        },
        { role: "user", content }
      ],
      [review],
      async (call) => {
        if (call.name !== review.name) {
          return "Call review_finished_cut.";
        }
        if (verdict) {
          return "Review already recorded. End this review turn.";
        }
        const parsed = reviewSchema.safeParse(call.args);
        if (!parsed.success) {
          return json(parsed.error.issues);
        }
        const expectedTimes = frames.frames.map((frame) => frame.time_ms);
        const reportedTimes = parsed.data.frameReviews.map(
          (frame) => frame.timeMs
        );
        const frameFindings = [
          ...new Set(parsed.data.frameReviews.flatMap((frame) => frame.findings))
        ].sort();
        const consistent =
          reportedTimes.length === expectedTimes.length &&
          new Set(reportedTimes).size === expectedTimes.length &&
          reportedTimes.every((time) => expectedTimes.includes(time)) &&
          parsed.data.frameReviews.every(
            (frame) => frame.passed === (frame.findings.length === 0)
          ) &&
          parsed.data.passed ===
            parsed.data.frameReviews.every((frame) => frame.passed) &&
          json([...parsed.data.findings].sort()) === json(frameFindings);
        if (!consistent) {
          return json({
            ok: false,
            error: "Review not recorded. Submit consistent overall and per-frame verdicts.",
            expectedFrameTimesMs: expectedTimes,
            resolution: "Review each actual candidate timeMs exactly once, without reference frames. Each frame passed must equal whether its unresolved defect findings are empty. Overall passed must equal every frame passed. Overall findings must be the unique union of frame findings. Correct the explicit report and call review_finished_cut again. No verdict will be inferred from summary."
          });
        }
        verdict = parsed.data;
        return "Review recorded.";
      }
    );
    if (!verdict) {
      throw new Error("Finished cut has no explicit visual review.");
    }
    const evidence: FinishedCutReview = {
      round,
      ...verdict,
      referenceFrames: referenceEvidence,
      frames: frames.frames.map((frame) => ({
        timeMs: frame.time_ms,
        sha256: createHash("sha256").update(frame.png).digest("hex"),
        width: frame.width,
        height: frame.height
      }))
    };
    reviews.push(evidence);
    if (!verdict.passed) {
      feedback = evidence;
      const failing = verdict.frameReviews
        .filter((frame) => !frame.passed)
        .map((frame) => frame.timeMs)
        .sort((left, right) => left - right);
      failingByRound.set(round, { frames: json(failing), findings: verdict.findings });
      // Every reviewed candidate passed the hard checks. The best has the
      // fewest failing frames, and a later candidate wins a tie.
      if (!best || failing.length <= best.failing) {
        best = {
          document: structuredClone(document),
          decorations: [...decorations],
          failing: failing.length,
          findings: [...verdict.findings]
        };
      }
      // A round repeats the last one when the same frames fail for the same
      // defects. New defects on the same frames still earn the next round.
      const previous = failingByRound.get(round - 1);
      const current = failingByRound.get(round)!;
      const repeated =
        previous !== undefined &&
        previous.frames === current.frames &&
        sameDefects(previous.findings, current.findings);
      if (repeated || round === 2) {
        break;
      }
      continue;
    }
    commit(document);
    return {
      document,
      reviews,
      costUsd: Math.max(0, runtime.provider.getTotalCost() - initialCost),
      decorations
    };
  }
  if (layoutPhase && best) {
    commit(best.document);
    return {
      document: best.document,
      reviews,
      costUsd: Math.max(0, runtime.provider.getTotalCost() - initialCost),
      decorations: best.decorations,
      needsReview: true,
      findings: best.findings
    };
  }
  throw new Error(
    `Finished cut still has unresolved defects after three candidates: ${json(feedback)}`
  );
}
