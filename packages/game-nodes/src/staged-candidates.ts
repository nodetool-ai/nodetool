/**
 * Staged game asset candidates: the content-addressed files under
 * `<source_root>/assets/` plus an optional record of what produced each one.
 *
 * Staging writes bytes named by digest, which says nothing about the slot or
 * the prompt. The record at `<source_root>/candidates/<digest>.json` keeps
 * both, so a browser can offer a candidate for its slot and seed a
 * regeneration with the prompt that made the current asset. A file without a
 * record is still a candidate; it is listed with only what its name and
 * extension say.
 */

import sharp from "sharp";
import type { Workspace } from "@nodetool-ai/runtime";
import { stagedGameCandidateRecord, stagedGameCandidateRecordPath, type GameAssetBinding, type StagedGameCandidateRecord } from "@nodetool-ai/protocol";
import { gameFontFormat } from "./font-preparation.js";

export type StagedGameCandidateKind = "image" | "audio" | "font" | "model" | "collider";

const EXTENSION_KIND = new Map<string, StagedGameCandidateKind>([
  ["png", "image"], ["jpg", "image"], ["webp", "image"],
  ["wav", "audio"], ["mp3", "audio"], ["ogg", "audio"],
  ["ttf", "font"], ["otf", "font"],
  ["glb", "model"], ["json", "collider"]
]);

export interface StagedGameCandidate {
  readonly digest: string;
  readonly extension: string;
  readonly mediaKind: StagedGameCandidateKind;
  /** Workspace-relative path of the staged bytes. */
  readonly path: string;
  readonly size: number;
  readonly modifiedAt: number;
  readonly record: StagedGameCandidateRecord | null;
}

const FILE = /^([a-f0-9]{64})\.([a-z0-9]+)$/;

export async function recordStagedGameCandidate(workspace: Workspace, sourceRoot: string,
  record: Omit<StagedGameCandidateRecord, "version" | "stagedAt"> & { stagedAt?: string }): Promise<StagedGameCandidateRecord> {
  const parsed = stagedGameCandidateRecord.parse({ version: 1, stagedAt: new Date().toISOString(), ...record });
  await workspace.write(stagedGameCandidateRecordPath(sourceRoot, parsed.digest), JSON.stringify(parsed), "application/json");
  return parsed;
}

async function readRecord(workspace: Workspace, sourceRoot: string, digest: string): Promise<StagedGameCandidateRecord | null> {
  const text = await workspace.readText(stagedGameCandidateRecordPath(sourceRoot, digest)).catch(() => null);
  if (!text) { return null; }
  try {
    const parsed = stagedGameCandidateRecord.safeParse(JSON.parse(text));
    return parsed.success && parsed.data.digest === digest ? parsed.data : null;
  } catch {
    // A malformed record leaves the file listed as an unrecorded candidate.
    return null;
  }
}

/** Every staged or installed file under `<sourceRoot>/assets/`, newest first. */
export async function listStagedGameCandidates(workspace: Workspace, sourceRoot: string): Promise<StagedGameCandidate[]> {
  const entries = await workspace.list(`${sourceRoot}/assets`).catch(() => []);
  const candidates: StagedGameCandidate[] = [];
  for (const entry of entries) {
    const match = FILE.exec(entry.name);
    const kind = match ? EXTENSION_KIND.get(match[2] ?? "") : undefined;
    if (entry.isDirectory || !match || !kind) { continue; }
    candidates.push({ digest: match[1], extension: match[2], mediaKind: kind, path: `${sourceRoot}/assets/${entry.name}`,
      size: entry.size, modifiedAt: entry.modifiedAt, record: await readRecord(workspace, sourceRoot, match[1]) });
  }
  return candidates.sort((left, right) => right.modifiedAt - left.modifiedAt || left.digest.localeCompare(right.digest));
}

/**
 * A 2D binding for staged image, audio or font bytes that have no record.
 * Pivot and sampling carry over from the slot's current binding so a
 * replacement draws where the old asset did. Models and colliders need 3D
 * preparation and are not handled here.
 */
export async function derivedStagedBinding2D(bytes: Uint8Array, candidate: Pick<StagedGameCandidate, "digest" | "extension" | "mediaKind">,
  previous?: Pick<GameAssetBinding, "pivot" | "sampling">): Promise<GameAssetBinding> {
  const base = { assetId: `staged:${candidate.digest}`, digest: candidate.digest,
    pivot: previous?.pivot ?? { x: 0.5, y: 0.5 }, sampling: previous?.sampling ?? "nearest" as const };
  if (candidate.mediaKind === "image") {
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height) { throw new Error("Staged image dimensions are unavailable"); }
    return { ...base, mediaKind: "image", width: metadata.width, height: metadata.height };
  }
  if (candidate.mediaKind === "audio") { return { ...base, mediaKind: "audio", width: 1, height: 1 }; }
  if (candidate.mediaKind === "font") {
    const format = gameFontFormat(bytes);
    if (!format) { throw new Error("Staged font is not TrueType or OpenType"); }
    return { ...base, mediaKind: "font", fontFormat: format, width: 1, height: 1, required: true };
  }
  throw new Error(`Staged ${candidate.mediaKind} candidates need 3D preparation`);
}
