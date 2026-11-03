/**
 * One-take direction: a whole storyboard rendered as one continuous clip.
 *
 * The board stores one prompt the creator writes (brand, rules, light, …).
 * Everything the board already knows is compiled, never stored, so a change
 * to a shot shows up in the editor preview, the render and the agent tools at
 * once:
 *
 * | Block   | Compiled from                                                    |
 * | ------- | ---------------------------------------------------------------- |
 * | `REFS`  | the reference images, numbered `[Image N]` (see below)           |
 * | `STYLE` | the board's style descriptor, once                               |
 * | `SHOTS` | JSON, one object per shot: window, action, motion, end state,    |
 * |         | scene lighting, camera, sound, dialogue, narration               |
 *
 * The render sends the creator's prompt, then the compiled block. Duration and
 * aspect ratio travel as request parameters, so the creator's text never has
 * to repeat them.
 *
 * The references are one of two sets, chosen per board:
 *
 * - `stills` (the default): every shot still, in shot order. A still fixes
 *   the framing and pose of one instant of its shot.
 * - `entities`: the image of each cast, location and style entity the shots
 *   use, each once. They fix who and where, and the compiled
 *   block says they do not fix framing or pose. Action shots read better this
 *   way: a still of the peak of an action (a splash, an impact) makes the
 *   model hold that instant instead of playing the action.
 *
 * `[Image N]` is the provider-neutral marker the render path already uses: the
 * Dreamina provider turns each one into an inline image mention. Because the
 * numbering follows the board, the creator can refer to `[Image 3]` in their
 * own text.
 */

import { entitiesForShot } from "./creative.js";
import type { Entity, Scene, Shot, ShotModelRef } from "./creative.js";
import { sceneForShot } from "./shot-prompt.js";
import { isNonBlankString, isRecord, isString } from "./predicates.js";

/** Which images a one take sends as `[Image N]`. */
export type OneTakeReferenceSource = "stills" | "entities";

/** The reference source when a direction sets none. */
export const ONE_TAKE_DEFAULT_REFERENCE_SOURCE: OneTakeReferenceSource =
  "stills";

/**
 * A board's one-take direction, stored on the storyboard document. Every
 * render setting is optional: an absent one falls back as documented.
 */
export interface OneTakeDirection {
  /** The creator's own prompt. Sent before the compiled block. */
  prompt: string;
  /**
   * The clip's length in seconds. Absent: the sum of the shot durations. When
   * it differs from that sum, every shot's window scales to fit it.
   */
  duration_seconds?: number | null;
  /** Absent: the board's aspect ratio. */
  aspect_ratio?: string | null;
  /** Absent: 1080p when the model offers it, else the model's first. */
  resolution?: string | null;
  /** The video model. Absent: the board's video model. */
  model?: ShotModelRef | null;
  /** The images sent as `[Image N]`. Absent: `stills`. */
  reference_source?: OneTakeReferenceSource | null;
  /**
   * The shots whose stills to send, chosen one by one. Absent: the choice
   * `reference_source` implies. Only a scene clip sets this today.
   */
  reference_shot_ids?: string[] | null;
  /**
   * The entities whose images to send, chosen one by one. Absent: the choice
   * `reference_source` implies. Only a scene clip sets this today.
   */
  reference_entity_ids?: string[] | null;
}

/**
 * One image the clip conditions on, in `[Image N]` order: a shot still or an
 * entity image. The kinds compete: a still already carries the cast, and an
 * entity image sent beside it pulls the framing toward a portrait. So
 * `reference_source` never mixes them, and only a choice made image by image
 * can. Stills come first.
 */
export interface OneTakeReference {
  /** Set for a shot still. */
  shot_id?: string;
  /** Set for an entity image. */
  entity_id?: string;
  asset_id: string;
  label: string;
}

/** What {@link compileOneTake} needs from a board. */
export interface OneTakeBoard {
  shots: readonly Shot[];
  oneTake?: OneTakeDirection | null;
  /**
   * The board's cast, resolved. Read only when the direction's
   * `reference_source` is `entities`; each shot's entities come from {@link entitiesForShot}.
   */
  entities?: readonly Entity[];
  /** The board's scenes. A shot's scene supplies its `lighting`. */
  scenes?: readonly Scene[];
  /** The board's style descriptor, sent once for the whole take. */
  style?: string;
}

/** A shot's place on the one-take clock. */
export interface OneTakeStep {
  shot_id: string;
  start_seconds: number;
  end_seconds: number;
}

export interface CompiledOneTake {
  /** Which images {@link references} holds. */
  reference_source: OneTakeReferenceSource;
  /** The block compiled from the board: REFS, STYLE, then SHOTS as JSON. */
  compiled: string;
  /** What the render sends: the creator's prompt, then the compiled block. */
  prompt: string;
  /** The images in `[Image N]` order; index 0 is `[Image 1]`. */
  references: OneTakeReference[];
  /** Each shot's window on the clip, in order, scaled to its duration. */
  steps: OneTakeStep[];
  /** The clip's length: the direction's duration, else the shot total. */
  duration_seconds: number;
  /** The sum of the shot durations, before any scaling. */
  shot_total_seconds: number;
}

/** A shot without a duration counts as this long. */
export const ONE_TAKE_DEFAULT_SHOT_SECONDS = 5;

/** Rounds a window edge to a tenth of a second. */
const tenth = (value: number): number => Math.round(value * 10) / 10;

/** `5` → `"5"`, `2.5` → `"2.5"`. */
const seconds = (value: number): string =>
  Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);

/** `0-5s`, as the compiled blocks print a window. */
export const oneTakeWindow = (start: number, end: number): string =>
  `${seconds(start)}-${seconds(end)}s`;

const byIndex = (shots: readonly Shot[]): Shot[] =>
  [...shots].sort((a, b) => a.index - b.index);

/**
 * The shots in board order, each with its window on the clip. With
 * `durationSeconds`, the windows scale so the last one ends there.
 */
export function oneTakeSteps(
  shots: readonly Shot[],
  durationSeconds?: number | null
): OneTakeStep[] {
  const steps = shotSteps(shots);
  const total = steps.at(-1)?.end_seconds ?? 0;
  if (!durationSeconds || durationSeconds <= 0 || total <= 0 || durationSeconds === total) {
    return steps;
  }
  const scale = durationSeconds / total;
  return steps.map((step) => ({
    shot_id: step.shot_id,
    start_seconds: tenth(step.start_seconds * scale),
    end_seconds: tenth(step.end_seconds * scale)
  }));
}

/** Each shot's window at its own duration. */
function shotSteps(shots: readonly Shot[]): OneTakeStep[] {
  let clock = 0;
  return byIndex(shots).map((shot) => {
    const length =
      shot.duration_seconds && shot.duration_seconds > 0
        ? shot.duration_seconds
        : ONE_TAKE_DEFAULT_SHOT_SECONDS;
    const step = {
      shot_id: shot.id,
      start_seconds: clock,
      end_seconds: clock + length
    };
    clock += length;
    return step;
  });
}

/** A shot's name in a reference label: its title, else "shot N". */
const shotName = (shot: Shot): string =>
  shot.slug?.trim() || `shot ${shot.index + 1}`;

/** The reference source a direction selects. */
export const oneTakeReferenceSource = (
  direction: OneTakeDirection | null | undefined
): OneTakeReferenceSource =>
  direction?.reference_source ?? ONE_TAKE_DEFAULT_REFERENCE_SOURCE;

/** The images the clip conditions on, from the direction's source. */
export function oneTakeReferences(board: OneTakeBoard): OneTakeReference[] {
  const source = oneTakeReferenceSource(board.oneTake);
  const shotIds = board.oneTake?.reference_shot_ids;
  const entityIds = board.oneTake?.reference_entity_ids;
  const stills = shotIds
    ? stillReferences(board).filter((reference) =>
        shotIds.includes(reference.shot_id as string)
      )
    : source === "stills"
      ? stillReferences(board)
      : [];
  const entities = entityIds
    ? chosenEntityReferences(board, entityIds)
    : source === "entities"
      ? entityReferences(board)
      : [];
  return [...stills, ...entities];
}

const entityReference = (entity: Entity): OneTakeReference[] => {
  const assetId = entity.reference_images?.[0]?.asset_id;
  return assetId
    ? [
        {
          entity_id: entity.id,
          asset_id: assetId,
          label: `the ${entity.kind} ${entity.name.trim()}`
        }
      ]
    : [];
};

/** The image of each chosen entity, in cast order, used by a shot or not. */
function chosenEntityReferences(
  board: OneTakeBoard,
  entityIds: readonly string[]
): OneTakeReference[] {
  return (board.entities ?? [])
    .filter((entity) => entityIds.includes(entity.id))
    .flatMap(entityReference);
}

/**
 * The image of each entity the shots use, once: shots in board order, each
 * shot's entities in cast order. An entity without an image sends nothing.
 */
function entityReferences(board: OneTakeBoard): OneTakeReference[] {
  const cast = [...(board.entities ?? [])];
  const seen = new Set<string>();
  const references: OneTakeReference[] = [];
  for (const shot of byIndex(board.shots)) {
    for (const entity of entitiesForShot(shot, cast)) {
      if (seen.has(entity.id)) {
        continue;
      }
      seen.add(entity.id);
      references.push(...entityReference(entity));
    }
  }
  return references;
}

/** Every shot still, in shot order. */
function stillReferences(board: OneTakeBoard): OneTakeReference[] {
  const steps = new Map(
    oneTakeSteps(board.shots, board.oneTake?.duration_seconds).map((step) => [
      step.shot_id,
      step
    ])
  );
  return byIndex(board.shots).flatMap((shot): OneTakeReference[] => {
    const assetId = shot.keyframe?.asset_id;
    const step = steps.get(shot.id);
    if (!assetId || !step) {
      return [];
    }
    return [
      {
        shot_id: shot.id,
        asset_id: assetId,
        label: `the still of ${shotName(shot)} at ${oneTakeWindow(step.start_seconds, step.end_seconds)}`
      }
    ];
  });
}

/** Leads the REFS block when the references are entity images. */
export const ONE_TAKE_ENTITY_REFS_NOTE =
  "These images show who and where only. Take the framing, pose and motion from the steps, not from the images.";

/** Follows the list when the references hold stills and entity images. */
export const ONE_TAKE_MIXED_REFS_NOTE =
  "The entity images show who and where only. Take the framing and pose from the stills, and the motion from the steps.";

function compileRefs(references: readonly OneTakeReference[]): string {
  if (references.length === 0) {
    return "";
  }
  const list = references
    .map((reference, index) => `[Image ${index + 1}] is ${reference.label}.`)
    .join(" ");
  if (!references.some((reference) => reference.entity_id)) {
    return list;
  }
  return `${list} ${
    references.some((reference) => reference.shot_id)
      ? ONE_TAKE_MIXED_REFS_NOTE
      : ONE_TAKE_ENTITY_REFS_NOTE
  }`;
}

/** Drops empty values so the JSON carries only what the shot sets. */
function present(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => {
      if (isString(value)) {
        return isNonBlankString(value);
      }
      if (isRecord(value)) {
        return Object.keys(value).length > 0;
      }
      return value !== undefined && value !== null;
    })
  );
}

const trimmed = (text: string | undefined): string | undefined => {
  const value = text?.trim();
  return value ? value : undefined;
};

/**
 * One JSON object per shot, in clip order: its window and every field a video
 * model can act on. Overlay graphics, notes and asset ids stay out. The
 * stills carry the picture, and overlay copy in a prompt gets drawn into it.
 */
function compileShots(
  shots: readonly Shot[],
  steps: readonly OneTakeStep[],
  scenes?: readonly Scene[]
): string {
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  const entries = steps.map((step, index) => {
    const shot = byId.get(step.shot_id);
    const camera = shot?.camera;
    return present({
      shot: index + 1,
      window: oneTakeWindow(step.start_seconds, step.end_seconds),
      action: trimmed(shot?.action),
      motion: trimmed(shot?.motion),
      end_state: trimmed(shot?.end_state),
      lighting: trimmed(sceneForShot(shot as Shot, scenes)?.lighting),
      camera: present({
        framing: trimmed(camera?.framing),
        angle: trimmed(camera?.angle),
        lens: trimmed(camera?.lens),
        movement: trimmed(camera?.movement),
        equipment: trimmed(camera?.equipment)
      }),
      sound: trimmed(shot?.sound),
      dialogue: trimmed(shot?.dialogue),
      narration: trimmed(shot?.narration)
    });
  });
  return JSON.stringify(entries, null, 2);
}

/**
 * Compile the board's part of the one-take prompt and join it to the
 * creator's prompt. Empty blocks drop.
 */
export function compileOneTake(board: OneTakeBoard): CompiledOneTake {
  const steps = oneTakeSteps(board.shots, board.oneTake?.duration_seconds);
  const shotTotal = shotSteps(board.shots).at(-1)?.end_seconds ?? 0;
  const referenceSource = oneTakeReferenceSource(board.oneTake);
  const references = oneTakeReferences(board);
  const refs = compileRefs(references);
  const compiled = [
    refs ? `REFS: ${refs}` : "",
    trimmed(board.style) ? `STYLE: ${trimmed(board.style)}` : "",
    steps.length > 0
      ? `SHOTS:\n${compileShots(board.shots, steps, board.scenes)}`
      : ""
  ]
    .filter((block) => block.length > 0)
    .join("\n\n");
  const own = board.oneTake?.prompt.trim() ?? "";
  return {
    reference_source: referenceSource,
    compiled,
    prompt: [own, compiled].filter((part) => part.length > 0).join("\n\n"),
    references,
    steps,
    duration_seconds: steps.at(-1)?.end_seconds ?? 0,
    shot_total_seconds: shotTotal
  };
}

// ── Scene clips ─────────────────────────────────────────────────────────────

/** The fewest shots one scene clip covers. One shot renders its own clip. */
export const SCENE_CLIP_MIN_SHOTS = 2;
/** The most shots one scene clip covers. */
export const SCENE_CLIP_MAX_SHOTS = 5;

/**
 * A run of consecutive shots rendered as one clip: a one take over part of
 * the board. It is stored on the board, so the run, its reference images and
 * its settings survive a reload and a re-render. An absent setting falls back
 * to the board's one-take direction, then as {@link OneTakeDirection} documents.
 *
 * A scene clip sends no prompt of its own: the request is compiled from the
 * shots, so a re-render of the same board sends the same text. `prompt` stays
 * on the type for directions saved before this rule, and is never sent.
 *
 * The clip lands on the run's first shot and every other shot in the run is
 * covered by its window of it (`Shot.covered_by`), exactly as a one take.
 */
export interface SceneClipDirection extends OneTakeDirection {
  id: string;
  /** The run's shot ids in board order. */
  shot_ids: string[];
}

/** A scene clip's shots, or why they no longer form a run. */
export type SceneClipRun =
  | { shots: Shot[]; issue: null }
  | { shots: Shot[]; issue: string };

/**
 * Resolve a scene clip's shots on the board. The run must name between
 * {@link SCENE_CLIP_MIN_SHOTS} and {@link SCENE_CLIP_MAX_SHOTS} existing
 * shots that sit next to each other in board order and share one scene.
 * A deleted or moved shot breaks the run rather than silently changing what
 * the clip covers.
 */
export function sceneClipRun(
  shots: readonly Shot[],
  shotIds: readonly string[]
): SceneClipRun {
  const ordered = byIndex(shots);
  const positions = shotIds.map((id) =>
    ordered.findIndex((shot) => shot.id === id)
  );
  const found = positions
    .filter((position) => position >= 0)
    .sort((a, b) => a - b);
  const run = found.map((position) => ordered[position]);
  if (found.length < shotIds.length) {
    return { shots: run, issue: "A shot in this scene clip was deleted." };
  }
  if (run.length < SCENE_CLIP_MIN_SHOTS || run.length > SCENE_CLIP_MAX_SHOTS) {
    return {
      shots: run,
      issue: `A scene clip covers ${SCENE_CLIP_MIN_SHOTS} to ${SCENE_CLIP_MAX_SHOTS} shots.`
    };
  }
  if (found.some((position, i) => i > 0 && position !== found[i - 1] + 1)) {
    return {
      shots: run,
      issue: "The shots in this scene clip are no longer next to each other."
    };
  }
  if (run.some((shot) => (shot.scene_id ?? null) !== (run[0].scene_id ?? null))) {
    return {
      shots: run,
      issue: "The shots in this scene clip are no longer in one scene."
    };
  }
  return { shots: run, issue: null };
}

/**
 * Compile a scene clip: {@link compileOneTake} over the run's shots alone, so
 * `[Image N]` numbers and the step windows start at the run's first shot.
 */
export function compileSceneClip(
  shots: readonly Shot[],
  clip: SceneClipDirection,
  entities?: readonly Entity[],
  look?: { scenes?: readonly Scene[]; style?: string }
): CompiledOneTake {
  return compileOneTake({
    shots: sceneClipRun(shots, clip.shot_ids).shots,
    oneTake: { ...clip, prompt: "" },
    entities,
    scenes: look?.scenes,
    style: look?.style
  });
}
