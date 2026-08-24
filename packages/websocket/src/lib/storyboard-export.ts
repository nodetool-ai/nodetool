/**
 * Storyboard zip export — a board as a Markdown document plus the media it
 * references, packed into one archive a person can read outside NodeTool.
 *
 * Layout (a zip):
 *   storyboard.md        — the board, shot by shot, linking its media
 *   stills/<n>-<slug>.<ext>  — the selected keyframe per shot
 *   clips/<n>-<slug>.<ext>   — the selected clip per shot
 *
 * Unlike the `.nodetool` workflow bundle this is not a re-importable format:
 * nothing rewrites refs, and a shot whose media cannot be resolved simply
 * loses its link (the file list reports it). Rendering the Markdown is pure
 * and separately testable; only packing needs asset bytes.
 */
import { strToU8, zipSync } from "fflate";
import type { Shot } from "@nodetool-ai/protocol";
import { mediaExtension } from "./package-asset-export.js";
import { isString } from "./wire-values.js";

/** The board fields the export reads, as `Storyboard.toDocument()` holds them. */
export interface StoryboardExportInput {
  name: string;
  title?: string;
  logline?: string;
  brief?: string;
  style?: string;
  aspectRatio?: string;
  narration?: string;
  musicPrompt?: string;
  shots: Shot[];
}

/** What the archive holds for one shot: a packed path, or why it holds none. */
interface ShotMedia {
  still?: string;
  clip?: string;
  /** Refs the shot named that the export could not turn into bytes. */
  unresolved?: Array<{ kind: "still" | "clip"; source: string }>;
}

interface MediaRefLike {
  type?: unknown;
  uri?: unknown;
  asset_id?: unknown;
}

/** A locator the server can resolve on its own, without the browser's help. */
function isResolvableSource(uri: string): boolean {
  return (
    uri.startsWith("asset://") ||
    uri.includes("/api/storage/") ||
    /^https?:\/\//.test(uri) ||
    uri.startsWith("data:")
  );
}

/**
 * The locator to resolve bytes from, or null when the ref carries none.
 *
 * A stored `asset_id` beats the ref's own `uri` when that uri is not something
 * the server can fetch — a `blob:` or `file://` source is the browser's
 * handle on the bytes, not the server's, and the asset id names the same
 * media in terms the storage adapter understands.
 */
export function mediaRefSource(ref: unknown): string | null {
  if (!ref || typeof ref !== "object") return null;
  const { uri, asset_id: assetId } = ref as MediaRefLike;
  const id = isString(assetId) && assetId !== "" ? `asset://${assetId}` : null;
  if (isString(uri) && uri !== "") {
    if (isResolvableSource(uri)) return uri;
    return id ?? uri;
  }
  return id;
}

function shotNumber(shot: Shot, index: number): string {
  const position = Number.isFinite(shot.index) ? shot.index + 1 : index + 1;
  return String(position).padStart(2, "0");
}

function slugPart(shot: Shot): string {
  const raw = (shot.slug || shot.action || "").trim().toLowerCase();
  const cleaned = raw
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return cleaned ? `-${cleaned}` : "";
}

function heading(shot: Shot, index: number): string {
  const number = shotNumber(shot, index);
  const label = shot.slug?.trim() || shot.action.trim().split("\n")[0];
  return `## ${number}. ${label}`;
}

function field(label: string, value: unknown): string | null {
  if (!isString(value) || value.trim() === "") return null;
  return `- **${label}:** ${value.trim()}`;
}

function cameraLine(shot: Shot): string | null {
  const parts = [
    shot.camera?.framing,
    shot.camera?.lens,
    shot.camera?.angle,
    shot.camera?.movement
  ].filter((part): part is string => isString(part) && part.trim() !== "");
  return parts.length > 0 ? `- **Camera:** ${parts.join(", ")}` : null;
}

/**
 * Render the board as Markdown. `media` maps a shot id to the archive-relative
 * paths packed for it; a shot missing from it renders without media links.
 */
export function renderStoryboardMarkdown(
  board: StoryboardExportInput,
  media: ReadonlyMap<string, ShotMedia>
): string {
  const lines: string[] = [];
  lines.push(`# ${board.title?.trim() || board.name || "Untitled storyboard"}`);

  const summary = [
    field("Logline", board.logline),
    field("Brief", board.brief),
    field("Style", board.style),
    field("Aspect ratio", board.aspectRatio),
    field("Music", board.musicPrompt),
    `- **Shots:** ${board.shots.length}`
  ].filter((line): line is string => line !== null);
  lines.push("", ...summary);

  if (isString(board.narration) && board.narration.trim() !== "") {
    lines.push("", "## Narration", "", board.narration.trim());
  }

  board.shots.forEach((shot, index) => {
    const files = media.get(shot.id);
    lines.push("", heading(shot, index), "");
    if (files?.still) {
      lines.push(`![Still for shot ${shotNumber(shot, index)}](${files.still})`, "");
    }
    lines.push(shot.action.trim() || "_No action written._");
    const details = [
      cameraLine(shot),
      field("Motion", shot.motion),
      field("Dialogue", shot.dialogue),
      field("Narration", shot.narration),
      typeof shot.duration_seconds === "number"
        ? `- **Duration:** ${shot.duration_seconds}s`
        : null,
      field("Status", shot.status),
      field("Notes", shot.notes),
      files?.clip ? `- **Clip:** [${files.clip}](${files.clip})` : null,
      ...(files?.unresolved ?? []).map(
        ({ kind, source }) =>
          `- **Missing ${kind}:** \`${source}\` could not be read, so it is not in this archive.`
      )
    ].filter((line): line is string => line !== null);
    if (details.length > 0) {
      lines.push("", ...details);
    }
  });

  return `${lines.join("\n")}\n`;
}

export interface PackStoryboardZipOptions {
  board: StoryboardExportInput;
  /** Resolve bytes for a media ref uri (`asset://…`, `/api/storage/…`). */
  fetchAssetBytes: (ref: string) => Promise<Uint8Array | null>;
}

export interface PackStoryboardZipResult {
  bytes: Uint8Array;
  /** Archive-relative paths written, `storyboard.md` first. */
  files: string[];
  /** Refs that named media the export could not resolve. */
  missing: string[];
}

/** Build the zip: the Markdown document plus every resolvable shot asset. */
export async function packStoryboardZip(
  options: PackStoryboardZipOptions
): Promise<PackStoryboardZipResult> {
  const { board, fetchAssetBytes } = options;
  const files: Record<string, Uint8Array> = {};
  const media = new Map<string, ShotMedia>();
  const missing: string[] = [];

  const addMedia = async (
    shot: Shot,
    index: number,
    ref: unknown,
    dir: "stills" | "clips",
    refType: "image" | "video",
    unresolved: NonNullable<ShotMedia["unresolved"]>
  ): Promise<string | undefined> => {
    const source = mediaRefSource(ref);
    if (!source) return undefined;
    const bytes = await fetchAssetBytes(source).catch(() => null);
    if (!bytes || bytes.byteLength === 0) {
      missing.push(source);
      unresolved.push({ kind: dir === "stills" ? "still" : "clip", source });
      return undefined;
    }
    const name = `${shotNumber(shot, index)}${slugPart(shot)}${mediaExtension(source, refType)}`;
    const path = `${dir}/${name}`;
    files[path] = bytes;
    return path;
  };

  let index = 0;
  for (const shot of board.shots) {
    const unresolved: NonNullable<ShotMedia["unresolved"]> = [];
    const still = await addMedia(
      shot,
      index,
      shot.keyframe,
      "stills",
      "image",
      unresolved
    );
    const clip = await addMedia(
      shot,
      index,
      shot.clip,
      "clips",
      "video",
      unresolved
    );
    if (still || clip || unresolved.length > 0) {
      const entry: ShotMedia = {};
      if (still) entry.still = still;
      if (clip) entry.clip = clip;
      if (unresolved.length > 0) entry.unresolved = unresolved;
      media.set(shot.id, entry);
    }
    index += 1;
  }

  const markdown = renderStoryboardMarkdown(board, media);
  files["storyboard.md"] = strToU8(markdown);

  return {
    bytes: zipSync(files),
    files: ["storyboard.md", ...Object.keys(files).filter((f) => f !== "storyboard.md")],
    missing
  };
}
