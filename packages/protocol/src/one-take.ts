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
 * | `REFS`  | every shot still in shot order, numbered `[Image N]`             |
 * | `STEPS` | each shot: time range, description, motion, `End:` end state     |
 * | `AUDIO` | each shot's `sound` with its time range                          |
 *
 * The render sends the creator's prompt, then the compiled block. Duration and
 * aspect ratio travel as request parameters, so the creator's text never has
 * to repeat them.
 *
 * `[Image N]` is the provider-neutral marker the render path already uses: the
 * Dreamina provider turns each one into an inline image mention. Because the
 * numbering follows the board, the creator can refer to `[Image 3]` in their
 * own text.
 */

import type { Shot, ShotModelRef } from "./creative.js";

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
}

/**
 * One image the clip conditions on, in `[Image N]` order. Only shot stills
 * go in: the stills already carry the cast, so entity images would only
 * compete with them.
 */
export interface OneTakeReference {
  shot_id: string;
  asset_id: string;
  label: string;
}

/** What {@link compileOneTake} needs from a board. */
export interface OneTakeBoard {
  shots: readonly Shot[];
  oneTake?: OneTakeDirection | null;
}

/** A shot's place on the one-take clock. */
export interface OneTakeStep {
  shot_id: string;
  start_seconds: number;
  end_seconds: number;
}

export interface CompiledOneTake {
  /** The block compiled from the board: REFS, STEPS, AUDIO. */
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

const sentence = (text: string | undefined): string => {
  const trimmed = (text ?? "").trim();
  return trimmed.length === 0 || /[.!?…:]$/.test(trimmed)
    ? trimmed
    : `${trimmed}.`;
};

/** A shot's name in a reference label: its title, else "shot N". */
const shotName = (shot: Shot): string =>
  shot.slug?.trim() || `shot ${shot.index + 1}`;

/** The images the clip conditions on: every shot still, in shot order. */
export function oneTakeReferences(board: OneTakeBoard): OneTakeReference[] {
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

function compileRefs(references: readonly OneTakeReference[]): string {
  return references
    .map((reference, index) => `[Image ${index + 1}] is ${reference.label}.`)
    .join(" ");
}

function compileSteps(
  shots: readonly Shot[],
  steps: readonly OneTakeStep[]
): string {
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  return steps
    .map((step, index) => {
      const shot = byId.get(step.shot_id);
      const body = [sentence(shot?.action), sentence(shot?.motion)]
        .filter((part) => part.length > 0)
        .join(" ");
      const end = shot?.end_state?.trim()
        ? ` End: ${sentence(shot.end_state)}`
        : "";
      const number = String(index + 1).padStart(2, "0");
      return `STEP_${number}: ${oneTakeWindow(step.start_seconds, step.end_seconds)}. ${body}${end}`.trimEnd();
    })
    .join("\n");
}

function compileAudio(
  shots: readonly Shot[],
  steps: readonly OneTakeStep[]
): string {
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  return steps
    .map((step) => {
      const sound = byId.get(step.shot_id)?.sound?.trim();
      return sound
        ? `<${sound}> at ${oneTakeWindow(step.start_seconds, step.end_seconds)}`
        : null;
    })
    .filter((cue): cue is string => cue !== null)
    .join(" · ");
}

/**
 * Compile the board's part of the one-take prompt and join it to the
 * creator's prompt. Empty blocks drop.
 */
export function compileOneTake(board: OneTakeBoard): CompiledOneTake {
  const steps = oneTakeSteps(board.shots, board.oneTake?.duration_seconds);
  const shotTotal = shotSteps(board.shots).at(-1)?.end_seconds ?? 0;
  const references = oneTakeReferences(board);
  const refs = compileRefs(references);
  const audio = compileAudio(board.shots, steps);
  const compiled = [
    refs ? `REFS: ${refs}` : "",
    compileSteps(board.shots, steps),
    audio ? `AUDIO: ${audio}` : ""
  ]
    .filter((block) => block.length > 0)
    .join("\n\n");
  const own = board.oneTake?.prompt.trim() ?? "";
  return {
    compiled,
    prompt: [own, compiled].filter((part) => part.length > 0).join("\n\n"),
    references,
    steps,
    duration_seconds: steps.at(-1)?.end_seconds ?? 0,
    shot_total_seconds: shotTotal
  };
}
