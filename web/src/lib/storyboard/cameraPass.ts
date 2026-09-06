/**
 * The Director's ask on an imported FDX (PRD § 7.2, D10).
 *
 * The words and the scene order already exist, so the model is asked for one
 * thing per shot: how it is shot. The prompt hands it the parsed screenplay as
 * context and the schema offers no place to write dialogue, action or a scene.
 *
 * `applyCameraPass` is deliberately lenient about what comes back — a provider
 * that ignores the schema, or the fake provider, can still answer with whole
 * shots. Those land here and are then handed to `verifyImportedText`, which
 * restores the parse and names what it corrected. The constrained ask keeps
 * drift rare; the post-check is what makes it harmless.
 *
 * Pure: no store, no DOM, no fetch.
 */

import type { Shot } from "@nodetool-ai/protocol";
import { isRecord } from "../../utils/typePredicates";
import {
  ANGLE_OPTIONS,
  EQUIPMENT_OPTIONS,
  FRAMING_OPTIONS,
  LENS_OPTIONS,
  MOVEMENT_OPTIONS
} from "../../components/storyboard/cameraOptions";
import type { FdxImport } from "./parseFdx";

export const CAMERA_PASS_TOOL_NAME = "shot_camera";
export const CAMERA_PASS_TOOL_DESCRIPTION =
  "Camera, motion and duration for each shot of an imported screenplay.";

/**
 * The system prompt for the pass. It names the one rule the run exists to
 * keep: the screenplay's words are the creator's.
 */
export const CAMERA_PASS_SYSTEM_PROMPT =
  "You are a director of photography. The screenplay is final: never rewrite " +
  "an action line, a line of dialogue or the order of the scenes. Answer with " +
  "camera, motion and duration for every shot you are given, by its id.";

/** The parsed screenplay as the prompt shows it: scene by scene, shot by shot. */
export function buildCameraPassPrompt(
  parsed: FdxImport,
  genre: string,
  style: string
): string {
  const lines: string[] = [];
  for (const scene of parsed.scenes) {
    lines.push(scene.slugline);
    for (const shot of parsed.shots) {
      if (shot.scene_id !== scene.id) {
        continue;
      }
      lines.push(`  [${shot.id}] ${shot.action}`);
      if (shot.dialogue) {
        lines.push(`    "${shot.dialogue.replace(/\n/g, " / ")}"`);
      }
    }
  }
  const preamble = [
    genre ? `Genre: ${genre}.` : "",
    style ? `Look: ${style}.` : ""
  ].filter((part) => part !== "");
  return [
    ...preamble,
    "Shoot this screenplay. For every shot id below, choose the framing, the",
    "angle, the camera movement, the rig, the lens and a duration in seconds.",
    "",
    ...lines
  ].join("\n");
}

/** Structured output with no field for the words or the order. */
export function buildCameraPassSchema(
  shotIds: readonly string[]
): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      shots: {
        type: "array",
        minItems: shotIds.length,
        maxItems: shotIds.length,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: [...shotIds] },
            camera: {
              type: "object",
              properties: {
                framing: { type: "string", enum: [...FRAMING_OPTIONS] },
                angle: { type: "string", enum: [...ANGLE_OPTIONS] },
                movement: { type: "string", enum: [...MOVEMENT_OPTIONS] },
                equipment: { type: "string", enum: [...EQUIPMENT_OPTIONS] },
                lens: { type: "string", enum: [...LENS_OPTIONS] }
              },
              required: ["framing", "angle", "movement"]
            },
            motion: {
              type: "string",
              description: "What moves in the shot, in one line."
            },
            duration_seconds: { type: "number", minimum: 1, maximum: 20 }
          },
          required: ["id", "camera", "motion", "duration_seconds"]
        }
      }
    },
    required: ["shots"]
  };
}

/**
 * The answer read back as shots. It takes whatever the provider sent, so only
 * entries naming a shot of the import are kept — an id the parse does not know
 * describes nothing that exists.
 */
export function applyCameraPass(parsed: FdxImport, data: unknown): Shot[] {
  const raw = isRecord(data) && Array.isArray(data.shots) ? data.shots : [];
  const known = new Map(parsed.shots.map((shot) => [shot.id, shot]));
  const answered: Shot[] = [];
  for (const entry of raw) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      continue;
    }
    const parsedShot = known.get(entry.id);
    if (!parsedShot) {
      continue;
    }
    // SAFETY: the spread carries whatever the provider sent — including
    // fields the schema did not offer, which is exactly what the post-check
    // exists to catch. `verifyImportedText` reads this, never the store.
    answered.push({ ...parsedShot, ...entry } as Shot);
  }
  return answered;
}

export default applyCameraPass;
