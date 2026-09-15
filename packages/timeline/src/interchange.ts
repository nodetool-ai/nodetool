import { activeTakeIdOf } from "./takes.js";
import type { TimelineClip, TimelineMarker, TimelineTrack } from "./types.js";

/** The two editable project formats supported by the initial interchange pass. */
export type InterchangeTarget = "fcpxml" | "premiere_xml";

export interface InterchangeAsset {
  id: string;
  /** A local file URI or the path written into a collected export bundle. */
  uri: string;
  durationMs?: number;
  hasAudio?: boolean;
}

export interface InterchangeSequence {
  name: string;
  width: number;
  height: number;
  fps: number;
  tracks: readonly TimelineTrack[];
  clips: readonly TimelineClip[];
  markers?: readonly TimelineMarker[];
}

export interface InterchangeOptions {
  target: InterchangeTarget;
  /** Resolves only the active asset for every clip. */
  resolveAsset(assetId: string): InterchangeAsset | undefined;
}

export interface InterchangeWarning {
  clipId?: string;
  message: string;
}

export interface InterchangeReport {
  target: InterchangeTarget;
  clipsExported: number;
  clipsReferenced: number;
  missingMedia: number;
  warnings: readonly InterchangeWarning[];
}

export interface InterchangeExport {
  xml: string;
  report: InterchangeReport;
}

const XML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;"
};

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPE[character]!);
}

function frameDuration(fps: number): string {
  const rounded = Math.max(1, Math.round(fps));
  return `1/${rounded}s`;
}

function time(ms: number, fps: number): string {
  const frames = Math.round((ms / 1000) * fps);
  return `${frames}/${Math.max(1, Math.round(fps))}s`;
}

function exportableClips(sequence: InterchangeSequence): {
  track: TimelineTrack;
  clip: TimelineClip;
}[] {
  const byId = new Map(sequence.tracks.map((track) => [track.id, track]));
  return sequence.clips
    .filter((clip) => clip.mediaType === "video" || clip.mediaType === "audio")
    .flatMap((clip) => {
      const track = byId.get(clip.trackId);
      return track ? [{ track, clip }] : [];
    })
    .sort((left, right) =>
      left.track.index - right.track.index || left.clip.startMs - right.clip.startMs
    );
}

function activeAssetId(clip: TimelineClip): string | undefined {
  const takeId = activeTakeIdOf(clip);
  const take = clip.versions.find((version) => version.id === takeId);
  return take?.assetId ?? clip.currentAssetId;
}

function unsupported(clip: TimelineClip, track: TimelineTrack): string[] {
  const issues: string[] = [];
  if ((clip.effects?.length ?? 0) > 0) issues.push("effects require baking");
  if ((clip.animations?.length ?? 0) > 0) issues.push("animations require baking");
  if (clip.generatedMatte?.status === "ready") issues.push("generated matte requires baking");
  if (clip.transform || clip.crop || clip.mask || clip.matte) issues.push("advanced transforms require baking");
  if (clip.blendMode && clip.blendMode !== "normal") issues.push("blend mode requires baking");
  if (clip.opacity !== undefined && clip.opacity !== 1) issues.push("opacity requires baking");
  if (clip.transitionIn) issues.push("transitions require baking");
  if (clip.hidden || clip.muted || !track.visible || track.muted) issues.push("disabled media cannot be represented");
  return issues;
}

function renderFcpXml(sequence: InterchangeSequence, items: readonly {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
}[]): string {
  const assetLines = items
    .map(({ clip, asset, ref }) =>
      `      <asset id="${ref}" name="${escapeXml(asset.id)}" src="${escapeXml(asset.uri)}" duration="${time(asset.durationMs ?? 0, sequence.fps)}" hasVideo="${clip.mediaType === "video" ? "1" : "0"}" hasAudio="${clip.mediaType === "audio" || asset.hasAudio ? "1" : "0"}"/>`
    )
    .join("\n");
  const spine = items
    .filter(({ clip }) => clip.mediaType === "video")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, sequence.fps)}" duration="${time(clip.durationMs, sequence.fps)}" start="${time(clip.inPointMs ?? 0, sequence.fps)}" lane="${track.index + 1}"/>`
    )
    .join("\n");
  const audio = items
    .filter(({ clip }) => clip.mediaType === "audio")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, sequence.fps)}" duration="${time(clip.durationMs, sequence.fps)}" start="${time(clip.inPointMs ?? 0, sequence.fps)}" lane="${track.index + 1}"/>`
    )
    .join("\n");
  const markers = (sequence.markers ?? [])
    .map((marker) => `        <marker start="${time(marker.timeMs, sequence.fps)}" value="${escapeXml(marker.label)}"/>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.10">\n  <resources>\n    <format id="r1" name="FFVideoFormat" frameDuration="${frameDuration(sequence.fps)}" width="${sequence.width}" height="${sequence.height}"/>\n${assetLines}\n  </resources>\n  <library><event name="NodeTool"><project name="${escapeXml(sequence.name)}"><sequence format="r1"><spine>\n${spine}\n${audio}\n${markers}\n      </spine></sequence></project></event></library>\n</fcpxml>\n`;
}

function renderPremiereXml(sequence: InterchangeSequence, items: readonly {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
}[]): string {
  const tracks = (mediaType: "video" | "audio") => sequence.tracks
    .filter((track) => items.some((item) => item.track.id === track.id && item.clip.mediaType === mediaType))
    .sort((left, right) => left.index - right.index)
    .map((track) => {
      const clips = items.filter((item) => item.track.id === track.id).map(({ clip, asset, ref }) => {
      const start = Math.round((clip.startMs / 1000) * sequence.fps);
      const end = Math.round(((clip.startMs + clip.durationMs) / 1000) * sequence.fps);
      const inPoint = Math.round(((clip.inPointMs ?? 0) / 1000) * sequence.fps);
      return `        <clipitem id="${ref}"><name>${escapeXml(clip.name)}</name><start>${start}</start><end>${end}</end><in>${inPoint}</in><out>${inPoint + end - start}</out><file id="file-${ref}"><name>${escapeXml(asset.id)}</name><pathurl>${escapeXml(asset.uri)}</pathurl></file></clipitem>`;
      }).join("\n");
      return `      <track><name>${escapeXml(track.name)}</name>\n${clips}\n      </track>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xmeml version="5"><sequence><name>${escapeXml(sequence.name)}</name><rate><timebase>${Math.round(sequence.fps)}</timebase><ntsc>FALSE</ntsc></rate><media><video><format><samplecharacteristics><width>${sequence.width}</width><height>${sequence.height}</height></samplecharacteristics></format>\n${tracks("video")}\n    </video><audio>\n${tracks("audio")}\n    </audio></media></sequence></xmeml>\n`;
}

/**
 * Produces a self-contained editable project document. Unsupported visual
 * operations are never silently represented: callers use the report to bake
 * those clips before writing the final bundle.
 */
export function exportInterchange(
  sequence: InterchangeSequence,
  options: InterchangeOptions
): InterchangeExport {
  const warnings: InterchangeWarning[] = [];
  const items: { track: TimelineTrack; clip: TimelineClip; asset: InterchangeAsset; ref: string }[] = [];
  for (const { track, clip } of exportableClips(sequence)) {
    for (const issue of unsupported(clip, track)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${issue}.` });
    }
    const assetId = activeAssetId(clip);
    const asset = assetId ? options.resolveAsset(assetId) : undefined;
    if (!asset) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: active media is missing.` });
      continue;
    }
    items.push({ track, clip, asset, ref: `r${items.length + 2}` });
  }
  const report: InterchangeReport = {
    target: options.target,
    clipsExported: items.length,
    clipsReferenced: items.length,
    missingMedia: warnings.filter((warning) => warning.message.endsWith("active media is missing.")).length,
    warnings
  };
  return {
    xml: options.target === "fcpxml" ? renderFcpXml(sequence, items) : renderPremiereXml(sequence, items),
    report
  };
}
