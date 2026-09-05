/**
 * @nodetool-ai/protocol — Screenplay authoring rules
 *
 * What a Director asks a model for, and how its answer becomes a typed
 * {@link Screenplay}: the system prompt, the brief-to-prompt shaping, the JSON
 * schema the structured call is forced into, the parse that assigns ids and
 * clamps the shot list, and the deterministic fallback.
 *
 * Pure, and shared: the `nodetool.creative.Director` node and the storyboard's
 * own direct `generate_text` request both author through this, so a screenplay
 * does not depend on which surface asked for it.
 */

import type { CameraDirection, Scene, Screenplay, Shot } from "./creative.js";
import { isNumber, isRecord, isString } from "./predicates.js";

export const DIRECTOR_SYSTEM_PROMPT = [
  "You are a film director. Turn the user's brief into a structured screenplay.",
  "Break the piece into scenes. Give each a slugline in screenplay form",
  "(INT./EXT. LOCATION — TIME) and a lighting note that holds for every shot in",
  "it. Then write the shots, each with a concrete visual action, camera",
  "direction, and the scene_id of exactly one scene you returned. Shots of the",
  "same scene must be consecutive. Apply one consistent style across every",
  "shot. Call the screenplay tool exactly once with the result."
].join(" ");

/** The tool a structured screenplay call is forced into. */
export const SCREENPLAY_TOOL_NAME = "screenplay";
export const SCREENPLAY_TOOL_DESCRIPTION =
  "Submit the finished screenplay with exactly the requested number of shots.";

const str = (value: unknown): string => (isString(value) ? value : "");

const optionalStr = (value: unknown): string | undefined => {
  const s = str(value).trim();
  return s.length > 0 ? s : undefined;
};

const optionalNumber = (value: unknown): number | undefined => {
  const n = isNumber(value) ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
};

/** Strip a leading/trailing ```json … ``` fence, if present. */
function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : trimmed;
}

/** Coerce a parsed object, a JSON string, or a fenced JSON block to a record. */
function coerceObject(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) {
    return raw;
  }
  if (isString(raw)) {
    try {
      const parsed: unknown = JSON.parse(stripFences(raw));
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      // Not valid JSON — fall through to an empty record.
    }
  }
  return {};
}

function coerceCamera(raw: unknown): CameraDirection | undefined {
  if (!isRecord(raw)) return undefined;
  const camera: CameraDirection = {};
  const framing = optionalStr(raw.framing);
  const lens = optionalStr(raw.lens);
  const angle = optionalStr(raw.angle);
  const movement = optionalStr(raw.movement);
  const equipment = optionalStr(raw.equipment);
  if (framing) camera.framing = framing;
  if (lens) camera.lens = lens;
  if (angle) camera.angle = angle;
  if (movement) camera.movement = movement;
  if (equipment) camera.equipment = equipment;
  return Object.keys(camera).length > 0 ? camera : undefined;
}

function coerceShot(raw: unknown, index: number): Shot {
  const obj = isRecord(raw) ? raw : {};
  const shot: Shot = {
    type: "shot",
    id: `shot-${index}`,
    index,
    action: str(obj.action),
    status: "planned"
  };
  const slug = optionalStr(obj.slug);
  if (slug) shot.slug = slug;
  // The model's own scene id. parseScreenplay rewrites it to the assigned
  // `scene-N`; nothing else calls coerceShot with a foreign id.
  const sceneId = optionalStr(obj.scene_id);
  if (sceneId) shot.scene_id = sceneId;
  const camera = coerceCamera(obj.camera);
  if (camera) shot.camera = camera;
  const motion = optionalStr(obj.motion);
  if (motion) shot.motion = motion;
  const dialogue = optionalStr(obj.dialogue);
  if (dialogue) shot.dialogue = dialogue;
  const narration = optionalStr(obj.narration);
  if (narration) shot.narration = narration;
  const duration = optionalNumber(obj.duration_seconds);
  if (duration !== undefined) shot.duration_seconds = duration;
  return shot;
}

/**
 * Coerce the returned scene list, assigning `scene-N` ids the way shots get
 * `shot-N`, and report where each model-supplied id landed so the shots can be
 * remapped onto it. Model ids never reach a stored document.
 */
function coerceScenes(raw: unknown): {
  scenes: Scene[];
  assigned: Map<string, string>;
} {
  const assigned = new Map<string, string>();
  if (!Array.isArray(raw)) return { scenes: [], assigned };
  const scenes = raw.map((entry, index) => {
    const obj = isRecord(entry) ? entry : {};
    const id = `scene-${index}`;
    const modelId = optionalStr(obj.id);
    // First writer wins, so two scenes sharing one id cannot steal each
    // other's shots.
    if (modelId && !assigned.has(modelId)) assigned.set(modelId, id);
    const scene: Scene = { type: "scene", id, slugline: str(obj.slugline) };
    const lighting = optionalStr(obj.lighting);
    if (lighting) scene.lighting = lighting;
    return scene;
  });
  return { scenes, assigned };
}

/**
 * Rewrite each shot's model-supplied `scene_id` to the assigned `scene-N`.
 *
 * A shot naming a scene that was not returned inherits the scene of the shot
 * before it (the first shot falls to the first returned scene) instead of
 * losing its id. § 7.7.3 requires the shots of a scene to be contiguous in
 * `index`: extending the run above keeps that, where an unscened shot in the
 * middle would split its scene in two. With no scenes returned at all there is
 * nothing to name, so the id is dropped and the shots read as legacy.
 */
function resolveSceneIds(
  shots: Shot[],
  scenes: Scene[],
  assigned: Map<string, string>
): void {
  let previous: string | undefined = scenes[0]?.id;
  for (const shot of shots) {
    const mapped = shot.scene_id ? assigned.get(shot.scene_id) : undefined;
    const resolved: string | undefined = mapped ?? previous;
    if (resolved) {
      shot.scene_id = resolved;
      previous = resolved;
    } else {
      delete shot.scene_id;
    }
  }
}

/** Clamp a requested shot count to what the Director accepts (1–20). */
export function clampShotCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(20, n));
}

/**
 * Coerce raw model output (a parsed object, a JSON string, or a fenced ```json
 * block) into a validated {@link Screenplay}: assign ids, default missing
 * fields, clamp the shot list to `shotCount`, and stamp every shot with
 * `status: "planned"` and a sequential `index`.
 */
export function parseScreenplay(
  raw: unknown,
  opts: {
    shotCount: number;
    title?: string;
    aspectRatio?: string;
    genre?: string;
  }
): Screenplay {
  const obj = coerceObject(raw);
  const shotCount = Math.max(0, Math.floor(opts.shotCount));
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const shots = rawShots
    .slice(0, shotCount)
    .map((rawShot, i) => coerceShot(rawShot, i));
  const { scenes, assigned } = coerceScenes(obj.scenes);
  resolveSceneIds(shots, scenes, assigned);

  const screenplay: Screenplay = {
    type: "screenplay",
    id: "screenplay-1",
    title: optionalStr(obj.title) ?? opts.title ?? "Untitled Screenplay",
    aspect_ratio: optionalStr(obj.aspect_ratio) ?? opts.aspectRatio ?? "16:9",
    shots
  };
  const logline = optionalStr(obj.logline);
  if (logline) screenplay.logline = logline;
  const styleBible = optionalStr(obj.style_bible);
  if (styleBible) screenplay.style_bible = styleBible;
  const narration = optionalStr(obj.narration);
  if (narration) screenplay.narration = narration;
  const musicPrompt = optionalStr(obj.music_prompt);
  if (musicPrompt) screenplay.music_prompt = musicPrompt;
  // Genre is an input, so the caller's value stands unless the payload already
  // carries one — which is the round-trip case (toScreenplay on a stored
  // screenplay), not a Director answer.
  const genre = optionalStr(obj.genre) ?? optionalStr(opts.genre);
  if (genre) screenplay.genre = genre;
  if (scenes.length > 0) screenplay.scenes = scenes;
  return screenplay;
}

const FALLBACK_FRAMINGS = ["establishing wide", "medium", "close-up"];
const FALLBACK_SCENE_ID = "scene-0";

/**
 * Deterministic screenplay used when the model returns no usable screenplay
 * tool call (e.g. providers without tool support and the fake e2e provider).
 * Mirrors DataGenerator's synthetic-rows fallback: the pipeline keeps flowing
 * with placeholder shots derived from the brief instead of failing the run.
 * Real provider errors still throw — this only covers an empty/unusable result.
 */
export function fallbackScreenplay(opts: {
  brief: string;
  style: string;
  shotCount: number;
  aspectRatio: string;
}): Screenplay {
  const brief = opts.brief.trim() || "Untitled film";
  const style = opts.style.trim();
  const shotCount = Math.max(1, Math.floor(opts.shotCount));
  const shots = Array.from({ length: shotCount }, (_, i) =>
    coerceShot(
      {
        slug: `Shot ${i + 1}`,
        action: `${brief} — beat ${i + 1} of ${shotCount}`,
        camera: { framing: FALLBACK_FRAMINGS[i % FALLBACK_FRAMINGS.length] },
        motion: "slow push in",
        scene_id: FALLBACK_SCENE_ID
      },
      i
    )
  );
  const title = brief.length > 60 ? `${brief.slice(0, 60)}…` : brief;
  const screenplay: Screenplay = {
    type: "screenplay",
    id: "screenplay-1",
    title,
    aspect_ratio: opts.aspectRatio,
    shots,
    // One scene holding every shot, so the deterministic path satisfies the
    // same contract as a parsed answer. The brief names no location, so the
    // slugline names the piece rather than inventing an INT./EXT. line.
    scenes: [{ type: "scene", id: FALLBACK_SCENE_ID, slugline: title }],
    narration: brief
  };
  if (style) {
    screenplay.style_bible = style;
    screenplay.music_prompt = `instrumental score to match: ${style}`;
  }
  return screenplay;
}

/** Coerce any screenplay-shaped input to a {@link Screenplay}, keeping its shots. */
export function toScreenplay(raw: unknown): Screenplay {
  const obj = coerceObject(raw);
  const shotCount = Array.isArray(obj.shots) ? obj.shots.length : 0;
  return parseScreenplay(obj, { shotCount });
}

/**
 * The JSON schema the screenplay tool call is validated against.
 *
 * The shot count is contracted, so `shots` is pinned to it. No scene count is,
 * so `scenes` only has to be non-empty — how many scenes a brief wants is the
 * director's call.
 *
 * One rule this cannot carry: that every `shot.scene_id` names a returned
 * scene. JSON Schema has no cross-reference between sibling arrays, and the
 * `$data` extension that would come closest is not accepted by the providers'
 * structured-output validators. {@link parseScreenplay} enforces it instead.
 */
export function buildScreenplaySchema(
  shotCount: number
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "scenes", "shots"],
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      style_bible: { type: "string" },
      aspect_ratio: { type: "string" },
      narration: { type: "string" },
      music_prompt: { type: "string" },
      scenes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "slugline"],
          properties: {
            id: { type: "string" },
            slugline: { type: "string" },
            lighting: { type: "string" }
          }
        }
      },
      shots: {
        type: "array",
        minItems: shotCount,
        maxItems: shotCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["scene_id", "action"],
          properties: {
            scene_id: { type: "string" },
            slug: { type: "string" },
            action: { type: "string" },
            motion: { type: "string" },
            dialogue: { type: "string" },
            narration: { type: "string" },
            duration_seconds: { type: "number" },
            camera: {
              type: "object",
              additionalProperties: false,
              properties: {
                framing: { type: "string" },
                lens: { type: "string" },
                angle: { type: "string" },
                movement: { type: "string" },
                equipment: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
}

/**
 * The user turn: the brief, the genre, the style, and what the shot list must
 * contain.
 *
 * `genre` is a trailing optional argument rather than an options object because
 * both call sites — the Director node and the storyboard's direct
 * `generate_text` request — pass positionally and are owned elsewhere.
 */
export function buildDirectorPrompt(
  brief: string,
  style: string,
  shotCount: number,
  aspectRatio: string,
  genre?: string
): string {
  const lines = [
    `Brief:\n${brief}`,
    genre?.trim()
      ? `Genre:\n${genre.trim()} — let its tone, pacing and framing carry the piece.`
      : "",
    style.trim() ? `Style:\n${style}` : "",
    `Produce exactly ${shotCount} shots for a ${aspectRatio} piece.`,
    "Group them into scenes. Give each scene an id, a slugline and a lighting note, and give every shot the scene_id of the one scene it belongs to.",
    "Give each shot a concrete visual action and camera direction, and set a style_bible describing the palette, light, lens, and texture applied to all shots."
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}
