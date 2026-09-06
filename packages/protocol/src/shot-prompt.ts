/**
 * Shot → prompt composition.
 *
 * One pure module so the editor (`useGenerateShot`) and the headless render
 * capabilities (`render_storyboard_stills`, `render_storyboard_clips`) send the
 * same words to the same model. A prompt that differs between the two surfaces
 * makes a board impossible to reason about: the same shot would come back
 * looking different depending on who pressed render.
 *
 * The field → mode mapping is the contract (PRD § 7.7.5):
 *
 * | Field              | Still            | Clip (keyframe) | Clip (direct)   |
 * | ------------------ | ---------------- | --------------- | --------------- |
 * | `action`           | yes              | yes             | yes             |
 * | `camera.framing`   | `<framing> shot` | —               | `<framing> shot`|
 * | `camera.angle`     | yes              | —               | yes             |
 * | `camera.lens`      | `<lens> lens`    | —               | `<lens> lens`   |
 * | scene `lighting`   | yes              | —               | yes             |
 * | `motion`           | —                | yes             | yes             |
 * | `camera.movement`  | —                | yes             | yes             |
 * | `camera.equipment` | —                | yes             | yes             |
 * | board `style`      | yes              | —               | yes             |
 *
 * A keyframe-mode clip animates a still that already carries framing, lens,
 * lighting and style, so repeating them in the video prompt only fights the
 * first-frame conditioning. A direct clip has no still, so it carries
 * everything.
 *
 * `dialogue`, `notes` and `duration_seconds` never enter a prompt: the first
 * two are words for people, the third is a render parameter.
 *
 * Entity seasoning is not here — the two surfaces pass entities differently
 * (the editor appends `entity://` tokens for the server to expand, the
 * capabilities send a structured `entities` param), and both start from
 * `entitiesForShot`.
 */

import type { Scene, Shot } from "./creative.js";

/** What a prompt needs beyond the shot itself. */
export interface ShotPromptContext {
  /** The shot's scene, when it has one. Supplies `lighting`. */
  scene?: Scene | null;
  /** The board's style descriptor, applied to every shot. */
  style?: string;
}

/** Trimmed, comma-separated, empties dropped. */
const compose = (parts: (string | undefined | null)[]): string =>
  parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0)
    .join(", ");

/** `"85mm"` + `"lens"` → `"85mm lens"`, so the model reads it as direction. */
const qualified = (
  value: string | undefined,
  noun: string
): string | undefined => {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? `${trimmed} ${noun}` : undefined;
};

/**
 * The scene a shot belongs to, or null when it has none (legacy shots) or the
 * scene has been dropped. Both render surfaces need it to reach `lighting`.
 */
export function sceneForShot(
  shot: Shot,
  scenes?: readonly Scene[] | null
): Scene | null {
  if (!shot.scene_id || !scenes) {
    return null;
  }
  return scenes.find((scene) => scene.id === shot.scene_id) ?? null;
}

/** Still prompt: what is in frame, how it is shot, how it is lit, the look. */
export function keyframePrompt(
  shot: Shot,
  context: ShotPromptContext = {}
): string {
  const camera = shot.camera;
  return compose([
    shot.action,
    qualified(camera?.framing, "shot"),
    camera?.angle,
    qualified(camera?.lens, "lens"),
    context.scene?.lighting,
    context.style
  ]);
}

/**
 * Keyframe-mode clip prompt: what moves, what is in frame, and how the camera
 * moves. Framing, lighting and style come from the still being animated, so
 * they are deliberately absent — this takes no context.
 */
export function clipPrompt(shot: Shot): string {
  const camera = shot.camera;
  return compose([
    shot.motion,
    shot.action,
    camera?.movement,
    camera?.equipment
  ]);
}

/**
 * Direct-mode clip prompt: no still carries the look into the render, so the
 * prompt carries all of it — the still's fields plus the motion ones.
 */
export function directClipPrompt(
  shot: Shot,
  context: ShotPromptContext = {}
): string {
  const camera = shot.camera;
  return compose([
    shot.action,
    qualified(camera?.framing, "shot"),
    camera?.angle,
    qualified(camera?.lens, "lens"),
    context.scene?.lighting,
    shot.motion,
    camera?.movement,
    camera?.equipment,
    context.style
  ]);
}
