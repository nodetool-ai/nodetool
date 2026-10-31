/**
 * Premiere Pro import — a zip holding a Final Cut Pro 7 XML (xmeml) sequence
 * and the media it uses, in any folder layout. The Premiere export writes
 * this shape; a sequence exported from Premiere imports once its XML is
 * zipped with its media.
 *
 * Media is matched by relative path first, then by an unambiguous file name
 * when `pathurl` names the exporting machine. Only used files are stored. A clip whose
 * file is not in the zip is left out and counted.
 */
import { strFromU8 } from "fflate";
import { mimeTypeForPath } from "@nodetool-ai/protocol";
import {
  MAX_PREMIERE_XML_BYTES,
  premiereToTimeline,
  readPremiereXml,
  type PremiereImport
} from "@nodetool-ai/timeline";

/**
 * `audio/x-m4a` and `audio/x-flac` instead of the registered types: they are
 * the spellings `getAssetFileName` maps to a stored `.m4a` / `.flac` name, so
 * imported clips keep their extension instead of landing as `.bin`.
 */
export const PREMIERE_MIME_OVERRIDES: Readonly<Record<string, string>> = {
  ".m4a": "audio/x-m4a",
  ".flac": "audio/x-flac"
};

function contentTypeOf(name: string): string {
  return mimeTypeForPath(name, PREMIERE_MIME_OVERRIDES);
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
    if (bytes.byteLength > MAX_PREMIERE_XML_BYTES) { throw new Error("Premiere XML exceeds the 8 MiB limit"); }
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
  const paths = Object.keys(entries).filter((path) => !path.startsWith("__MACOSX/") && !path.endsWith("/"));
  const normalized = (value: string): string => {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch { /* Keep malformed escapes literal. */ }
    return decoded.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
  };
  // An ambiguous key needs no candidate array. Resolve each XML file in constant time.
  const byPath = new Map<string, string | null>();
  const byName = new Map<string, string | null>();
  const add = (map: Map<string, string | null>, key: string, path: string): void => {
    const existing = map.get(key);
    map.set(key, existing === undefined ? path : existing === path ? path : null);
  };
  for (const path of paths) {
    add(byPath, normalized(path), path);
    add(byName, baseName(normalized(path)).toLowerCase(), path);
  }

  const stored = new Map<string, string>();
  const imported: ImportPremiereResult["imported"] = [];
  for (const file of sequence.files) {
    const filePath = normalized(file.pathurl);
    let path = byPath.get(filePath);
    if (path === undefined) {
      const named = byName.get(file.name.toLowerCase());
      const located = byName.get(baseName(filePath).toLowerCase());
      path = named === null || located === null || (named && located && named !== located)
        ? undefined : named ?? located;
    }
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
