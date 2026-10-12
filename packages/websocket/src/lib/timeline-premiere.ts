/**
 * Adobe Premiere Pro export — a zip holding a Final Cut Pro 7 XML (xmeml)
 * sequence, which Premiere imports through File > Import, plus the media its
 * clips use:
 *
 *   <name>.xml          — the sequence, written by `exportInterchange`
 *   media/<file>        — the active asset of every exported clip, deduped
 *   export-report.txt   — what was left out or needs baking, and how to import
 *
 * Every `pathurl` is relative (`media/<file>`). Premiere asks to link media
 * when it cannot resolve one; pointing it at one file in `media/` relinks the
 * rest, because the names match.
 *
 * Like the timeline bundle, the planner is storage-agnostic: the caller
 * supplies `fetchAsset` and `probe`, so the HTTP route and a test with an
 * in-memory adapter share it.
 */
import { strToU8 } from "fflate";
import { getAssetFileName } from "@nodetool-ai/protocol";
import {
  exportInterchange,
  interchangeAssetIds,
  type InterchangeAsset,
  type InterchangeReport,
  type InterchangeSequence
} from "@nodetool-ai/timeline";
import type { FetchedTimelineAsset } from "./timeline-bundle.js";
import {
  exportSourceSize,
  MAX_ZIP_ENTRY_BYTES,
  type ExportSource,
  type ZipStreamWriter
} from "./zip-stream.js";

/** What a probe could tell about one media file. Absent means unknown. */
export interface PremiereMediaInfo {
  durationMs?: number;
  hasAudio?: boolean;
}

export interface PremiereFetchedAsset extends FetchedTimelineAsset {
  /** Duration recorded on the asset row, when there is one. */
  durationMs?: number;
}

export interface PlanPremiereExportOptions {
  sequence: InterchangeSequence;
  /** Resolve one asset by id; null when its row or bytes are gone. */
  fetchAsset: (assetId: string) => Promise<PremiereFetchedAsset | null>;
  /** Read duration and audio presence from the media itself. */
  probe: (
    source: ExportSource,
    contentType: string
  ) => Promise<PremiereMediaInfo>;
}

export interface PremiereExportPlan {
  /** File name of the sequence inside the zip. */
  xmlName: string;
  xml: string;
  report: InterchangeReport;
  media: Array<{ file: string; source: ExportSource }>;
}

const MEDIA_DIR = "media/";

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^[._]+/, "") || "media";
}

/** `media/<readable name>-<id prefix>.<ext>`: unique per asset, readable in a bin. */
export function mediaFileName(
  assetId: string,
  name: string,
  contentType: string
): string {
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const typed = getAssetFileName(assetId, contentType).split(".").pop();
  const ext = typed && typed !== "bin" ? typed : dot > 0 ? name.slice(dot + 1) : "bin";
  return `${MEDIA_DIR}${safeName(stem)}-${assetId.slice(0, 8)}.${safeName(ext)}`;
}

/** Resolve every asset the sequence uses, then write the XML against them. */
export async function planPremiereExport(
  options: PlanPremiereExportOptions
): Promise<PremiereExportPlan> {
  const { sequence } = options;
  const assets = new Map<string, InterchangeAsset>();
  const media: PremiereExportPlan["media"] = [];
  for (const assetId of interchangeAssetIds(sequence, "premiere_xml")) {
    const fetched = await options.fetchAsset(assetId);
    // A file too large for a zip entry without Zip64 is reported as missing,
    // the same way the timeline bundle leaves it out.
    if (!fetched || exportSourceSize(fetched.source) > MAX_ZIP_ENTRY_BYTES) {
      continue;
    }
    const info = await options.probe(fetched.source, fetched.contentType);
    const file = mediaFileName(assetId, fetched.name, fetched.contentType);
    const asset: InterchangeAsset = { id: assetId, uri: file };
    const durationMs = fetched.durationMs ?? info.durationMs;
    if (durationMs !== undefined) asset.durationMs = durationMs;
    if (info.hasAudio !== undefined) asset.hasAudio = info.hasAudio;
    assets.set(assetId, asset);
    media.push({ file, source: fetched.source });
  }
  const { xml, report } = exportInterchange(sequence, {
    target: "premiere_xml",
    resolveAsset: (assetId) => assets.get(assetId)
  });
  return { xmlName: `${safeName(sequence.name)}.xml`, xml, report, media };
}

/** The plain-text note that travels in the zip next to the sequence. */
export function premiereReportText(
  sequenceName: string,
  plan: Pick<PremiereExportPlan, "xmlName" | "report">
): string {
  const lines = [
    `${sequenceName}: Adobe Premiere Pro export`,
    "",
    `In Premiere Pro, choose File > Import and pick ${plan.xmlName}.`,
    "Keep the media folder next to it. If Premiere asks to link media, locate",
    "one file in the media folder and Premiere relinks the others.",
    "",
    `Clips exported: ${plan.report.clipsExported}`
  ];
  if (plan.report.warnings.length > 0) {
    lines.push(
      "",
      "Needs attention (render these clips to video in NodeTool, or rebuild them in Premiere):",
      ...plan.report.warnings.map((warning) => `- ${warning.message}`)
    );
  }
  return `${lines.join("\n")}\n`;
}

/** Write the planned zip to `writer`: media first, then the XML and the report. */
export async function writePremiereExport(
  sequenceName: string,
  plan: PremiereExportPlan,
  writer: ZipStreamWriter
): Promise<void> {
  for (const { file, source } of plan.media) {
    await writer.add(file, source);
  }
  await writer.add(plan.xmlName, strToU8(plan.xml), { compress: true });
  await writer.add(
    "export-report.txt",
    strToU8(premiereReportText(sequenceName, plan)),
    { compress: true }
  );
}
