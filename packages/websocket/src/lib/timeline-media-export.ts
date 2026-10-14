/**
 * Media export — a zip of every file a timeline's clips show, for use in any
 * other tool:
 *
 *   media/<file>   — the active asset of every video, image and audio clip,
 *                    deduped, named like the Premiere export's media folder
 *   clips.csv      — one row per clip: where it sits and which file it uses
 *
 * Files are the stored originals, untrimmed. `clips.csv` carries each clip's
 * timeline position and source in-point so the cut can be rebuilt by hand.
 */
import { strToU8 } from "fflate";
import {
  clipActiveAssetId,
  interchangeAssetIds,
  type InterchangeSequence
} from "@nodetool-ai/timeline";
import type { FetchedTimelineAsset } from "./timeline-bundle.js";
import { mediaFileName } from "./timeline-premiere.js";
import {
  exportSourceSize,
  MAX_ZIP_ENTRY_BYTES,
  type ExportSource,
  type ZipStreamWriter
} from "./zip-stream.js";

export interface MediaExportPlan {
  media: Array<{ file: string; source: ExportSource }>;
  csv: string;
  /** Asset ids a clip names whose bytes could not be read or packed. */
  missing: string[];
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function seconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

export async function planMediaExport(options: {
  sequence: InterchangeSequence;
  fetchAsset: (assetId: string) => Promise<FetchedTimelineAsset | null>;
}): Promise<MediaExportPlan> {
  const { sequence } = options;
  const files = new Map<string, string>();
  const media: MediaExportPlan["media"] = [];
  const missing: string[] = [];
  for (const assetId of interchangeAssetIds(sequence, "premiere_xml")) {
    const fetched = await options.fetchAsset(assetId);
    if (!fetched || exportSourceSize(fetched.source) > MAX_ZIP_ENTRY_BYTES) {
      missing.push(assetId);
      continue;
    }
    const file = mediaFileName(assetId, fetched.name, fetched.contentType);
    files.set(assetId, file);
    media.push({ file, source: fetched.source });
  }

  const tracks = new Map(sequence.tracks.map((track) => [track.id, track]));
  const rows = [["clip", "track", "media_type", "start_s", "end_s", "in_s", "file"]];
  const clips = [...sequence.clips].sort(
    (left, right) =>
      (tracks.get(left.trackId)?.index ?? 0) - (tracks.get(right.trackId)?.index ?? 0) ||
      left.startMs - right.startMs
  );
  for (const clip of clips) {
    const assetId = clipActiveAssetId(clip);
    const file = assetId ? files.get(assetId) : undefined;
    if (!file) continue;
    rows.push([
      clip.name,
      tracks.get(clip.trackId)?.name ?? "",
      clip.mediaType,
      seconds(clip.startMs),
      seconds(clip.startMs + clip.durationMs),
      seconds(clip.inPointMs ?? 0),
      file
    ]);
  }
  const csv = `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
  return { media, csv, missing };
}

export async function writeMediaExport(
  plan: MediaExportPlan,
  writer: ZipStreamWriter
): Promise<void> {
  for (const { file, source } of plan.media) {
    await writer.add(file, source);
  }
  await writer.add("clips.csv", strToU8(plan.csv), { compress: true });
}
