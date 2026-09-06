/**
 * The post-check on an imported script (PRD § 7.2, D10).
 *
 * An import's words are the user's, not the model's. An FDX parse already
 * knows every line and every scene, so the Director is asked for camera,
 * motion and duration only — and this compares what came back against the
 * parse, restores the parsed dialogue and order where they differ, and names
 * the shots it corrected so the review step can say so.
 *
 * A PDF or DOCX yields plain text with no structure, so there is nothing to
 * restore: the Director builds the shots, and this flags the source lines no
 * shot's action or dialogue holds.
 *
 * Pure: no store, no DOM, no fetch.
 */

import type { Scene, Shot } from "@nodetool-ai/protocol";
import type { FdxImport } from "./parseFdx";

export interface FdxVerification {
  mode: "fdx";
  /** The parse's words and order, carrying the Director's camera work. */
  shots: Shot[];
  scenes: Scene[];
  /** Shots whose dialogue, action, scene or position was restored. */
  correctedShotIds: string[];
}

export interface TextVerification {
  mode: "text";
  /** Source lines no shot's action or dialogue contains. */
  missingLines: string[];
}

export type ImportVerification = FdxVerification | TextVerification;

export type VerifyImportedTextInput =
  | { mode: "fdx"; parsed: FdxImport; returned: readonly Shot[] }
  | { mode: "text"; source: string; shots: readonly Shot[] };

/** Whitespace-collapsed and case-folded, for a containment test on prose. */
const normalize = (text: string): string =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * The parsed shot carrying the three fields the Director was asked for
 * (D10). Everything else — the words, the scene, the order — stays the
 * parse's, which is what makes the restore a restore.
 */
function withDirection(parsed: Shot, returned: Shot | undefined): Shot {
  if (!returned) {
    return parsed;
  }
  const shot: Shot = { ...parsed };
  if (returned.camera !== undefined) {
    shot.camera = returned.camera;
  }
  if (returned.motion !== undefined) {
    shot.motion = returned.motion;
  }
  if (returned.duration_seconds !== undefined) {
    shot.duration_seconds = returned.duration_seconds;
  }
  return shot;
}

/** FDX mode: the parse wins, and the shots it had to correct are named. */
export function verifyImportedFdx(
  parsed: FdxImport,
  returned: readonly Shot[]
): FdxVerification {
  const byId = new Map(returned.map((shot) => [shot.id, shot]));
  // The two orders compared shot for shot, over the shots the answer kept: a
  // shot the answer dropped is reported as dropped, not as having moved the
  // ones behind it.
  const returnedOrder = returned
    .map((shot) => shot.id)
    .filter((id) => parsed.shots.some((shot) => shot.id === id));
  const parsedOrder = parsed.shots
    .map((shot) => shot.id)
    .filter((id) => byId.has(id));

  const corrected = new Set<string>();
  const shots = parsed.shots.map((parsedShot, position) => {
    const answer = byId.get(parsedShot.id);
    if (
      !answer ||
      (answer.dialogue ?? "") !== (parsedShot.dialogue ?? "") ||
      answer.action !== parsedShot.action ||
      (answer.scene_id ?? "") !== (parsedShot.scene_id ?? "") ||
      parsedOrder.indexOf(parsedShot.id) !==
        returnedOrder.indexOf(parsedShot.id)
    ) {
      corrected.add(parsedShot.id);
    }
    return { ...withDirection(parsedShot, answer), index: position };
  });

  return {
    mode: "fdx",
    shots,
    scenes: parsed.scenes,
    correctedShotIds: shots
      .map((shot) => shot.id)
      .filter((id) => corrected.has(id))
  };
}

/** Plain-text mode: nothing to restore, so the lost lines are reported. */
export function verifyImportedPlainText(
  source: string,
  shots: readonly Shot[]
): TextVerification {
  const covered = shots
    .map((shot) => normalize(`${shot.action} ${shot.dialogue ?? ""}`))
    .join(" ");
  const missingLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .filter((line) => !covered.includes(normalize(line)));
  return { mode: "text", missingLines };
}

/**
 * Check a Director answer against the import it was given. FDX mode restores;
 * plain-text mode only reports, because there is no parse to restore from.
 */
export function verifyImportedText(
  input: VerifyImportedTextInput
): ImportVerification {
  return input.mode === "fdx"
    ? verifyImportedFdx(input.parsed, input.returned)
    : verifyImportedPlainText(input.source, input.shots);
}

export default verifyImportedText;
