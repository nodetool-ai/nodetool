/**
 * Premiere Pro import — a zip holding a Final Cut Pro 7 XML (xmeml) sequence
 * and the media it uses, in any folder layout. The Premiere export writes
 * this shape; a sequence exported from Premiere imports once its XML is
 * zipped with its media.
 *
 * Media is matched by file name, because the XML's `pathurl`s name paths on
 * the machine that wrote it. Only files a clip uses are stored. A clip whose
 * file is not in the zip is left out and counted.
 */
import { strFromU8 } from "fflate";
import {
  premiereToTimeline,
  readPremiereXml,
  type PremiereImport
} from "@nodetool-ai/timeline";

/** Content types for the media extensions Premiere sequences carry. */
const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  avi: "video/x-msvideo",
  mpg: "video/mpeg",
  mpeg: "video/mpeg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  aac: "audio/aac",
  m4a: "audio/x-m4a",
  ogg: "audio/ogg",
  flac: "audio/x-flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  tif: "image/tiff",
  tiff: "image/tiff",
  bmp: "image/bmp"
};

function contentTypeOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/** The xmeml document in a zip, or null when the zip carries none. */
export function findPremiereXml(
  entries: Record<string, Uint8Array>
): string | null {
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.startsWith("__MACOSX/") || !path.toLowerCase().endsWith(".xml")) {
      continue;
    }
    const xml = strFromU8(bytes);
    if (xml.includes("<xmeml")) return xml;
  }
  return null;
}

export interface ImportPremiereOptions {
  /** Store one media file and return the new asset's id. */
  storeAsset: (file: {
    bytes: Uint8Array;
    name: string;
    contentType: string;
  }) => Promise<{ assetId: string }>;
}

export interface ImportPremiereResult {
  timeline: PremiereImport;
  /** One row per stored file. */
  imported: Array<{ file: string; asset_id: string }>;
}

/** Build a timeline from an xmeml document and the zip entries beside it. */
export async function importPremiereArchive(
  xml: string,
  entries: Record<string, Uint8Array>,
  options: ImportPremiereOptions
): Promise<ImportPremiereResult> {
  const sequence = readPremiereXml(xml);
  const byName = new Map<string, string>();
  const byLowerName = new Map<string, string>();
  for (const path of Object.keys(entries)) {
    if (path.startsWith("__MACOSX/") || path.endsWith("/")) continue;
    const name = baseName(path);
    if (!byName.has(name)) byName.set(name, path);
    if (!byLowerName.has(name.toLowerCase())) {
      byLowerName.set(name.toLowerCase(), path);
    }
  }

  const stored = new Map<string, string>();
  const imported: ImportPremiereResult["imported"] = [];
  for (const file of sequence.files) {
    const candidates = [file.name, baseName(file.pathurl)];
    try {
      candidates.push(decodeURIComponent(baseName(file.pathurl)));
    } catch {
      // A malformed escape leaves the raw name as the only candidate.
    }
    const path =
      candidates.map((name) => byName.get(name)).find(Boolean) ??
      candidates.map((name) => byLowerName.get(name.toLowerCase())).find(Boolean);
    if (!path) continue;
    if (!stored.has(path)) {
      const name = baseName(path);
      const { assetId } = await options.storeAsset({
        bytes: entries[path]!,
        name,
        contentType: contentTypeOf(name)
      });
      stored.set(path, assetId);
      imported.push({ file: path, asset_id: assetId });
    }
    stored.set(`file:${file.id}`, stored.get(path)!);
  }

  const timeline = premiereToTimeline(sequence, {
    resolveFile: (file) => stored.get(`file:${file.id}`)
  });
  return { timeline, imported };
}
