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

import type { CameraDirection, Screenplay, Shot } from "./creative.js";
import { isNumber, isRecord, isString } from "./predicates.js";

export const DIRECTOR_SYSTEM_PROMPT = [
  "You are a film director. Turn the user's brief into a structured screenplay.",
  "Produce a coherent visual story broken into distinct shots, each with a",
  "concrete visual action and camera direction. Apply one consistent style",
  "across every shot. Call the screenplay tool exactly once with the result."
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
  if (framing) camera.framing = framing;
  if (lens) camera.lens = lens;
  if (angle) camera.angle = angle;
  if (movement) camera.movement = movement;
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
  opts: { shotCount: number; title?: string; aspectRatio?: string }
): Screenplay {
  const obj = coerceObject(raw);
  const shotCount = Math.max(0, Math.floor(opts.shotCount));
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const shots = rawShots
    .slice(0, shotCount)
    .map((rawShot, i) => coerceShot(rawShot, i));

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
  return screenplay;
}

const FALLBACK_FRAMINGS = ["establishing wide", "medium", "close-up"];

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
        motion: "slow push in"
      },
      i
    )
  );
  const screenplay: Screenplay = {
    type: "screenplay",
    id: "screenplay-1",
    title: brief.length > 60 ? `${brief.slice(0, 60)}…` : brief,
    aspect_ratio: opts.aspectRatio,
    shots,
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

/** The JSON schema the screenplay tool call is validated against. */
export function buildScreenplaySchema(
  shotCount: number
): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["title", "shots"],
    properties: {
      title: { type: "string" },
      logline: { type: "string" },
      style_bible: { type: "string" },
      aspect_ratio: { type: "string" },
      narration: { type: "string" },
      music_prompt: { type: "string" },
      shots: {
        type: "array",
        minItems: shotCount,
        maxItems: shotCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["action"],
          properties: {
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
                movement: { type: "string" }
              }
            }
          }
        }
      }
    }
  };
}

/** The user turn: the brief, the style, and what the shot list must contain. */
export function buildDirectorPrompt(
  brief: string,
  style: string,
  shotCount: number,
  aspectRatio: string
): string {
  const lines = [
    `Brief:\n${brief}`,
    style.trim() ? `Style:\n${style}` : "",
    `Produce exactly ${shotCount} shots for a ${aspectRatio} piece.`,
    "Give each shot a concrete visual action and camera direction, and set a",
    "style_bible describing the palette, light, lens, and texture applied to all shots."
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}
