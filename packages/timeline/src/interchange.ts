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

interface FrameRate {
  numerator: number;
  denominator: number;
  timebase: number;
  ntsc: boolean;
}

function frameRate(fps: number): FrameRate {
  const ntscRates = [
    [23.976, 24_000, 1_001, 24],
    [29.97, 30_000, 1_001, 30],
    [59.94, 60_000, 1_001, 60]
  ] as const;
  const matchingRate = ntscRates.find(([value]) => Math.abs(fps - value) < 0.01);
  if (matchingRate) {
    return { numerator: matchingRate[1], denominator: matchingRate[2], timebase: matchingRate[3], ntsc: true };
  }
  const timebase = Math.max(1, Math.round(fps));
  return { numerator: timebase, denominator: 1, timebase, ntsc: false };
}

function frames(ms: number, rate: FrameRate): number {
  return Math.round((ms * rate.numerator) / (1000 * rate.denominator));
}

function frameDuration(rate: FrameRate): string {
  return `${rate.denominator}/${rate.numerator}s`;
}

function time(ms: number, rate: FrameRate): string {
  return `${frames(ms, rate) * rate.denominator}/${rate.numerator}s`;
}

function sequencedClips(sequence: InterchangeSequence): {
  track?: TimelineTrack;
  clip: TimelineClip;
}[] {
  const byId = new Map(sequence.tracks.map((track) => [track.id, track]));
  return sequence.clips
    .map((clip) => ({ track: byId.get(clip.trackId), clip }))
    .sort((left, right) =>
      (left.track?.index ?? Number.MAX_SAFE_INTEGER) - (right.track?.index ?? Number.MAX_SAFE_INTEGER) || left.clip.startMs - right.clip.startMs
    );
}

function activeAssetId(clip: TimelineClip): string | undefined {
  if (clip.currentAssetId !== undefined) return clip.currentAssetId;
  const takeId = activeTakeIdOf({ ...clip, currentAssetId: undefined });
  const take = clip.versions.find((version) => version.id === takeId);
  return take?.assetId;
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
  if (clip.speedMultiplier !== undefined && clip.speedMultiplier !== 1 && !clip.speedBaked) issues.push("playback speed requires baking");
  if (clip.timeRemap) issues.push("time remap requires baking");
  if (clip.volumeDb !== undefined && clip.volumeDb !== 0) issues.push("audio volume requires baking");
  if (clip.fadeInMs || clip.fadeOutMs) issues.push("audio fades require baking");
  if (clip.caption) issues.push("captions require baking");
  return issues;
}

function renderFcpXml(sequence: InterchangeSequence, items: readonly {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
}[]): string {
  const rate = frameRate(sequence.fps);
  const assetLines = items
    .map(({ clip, asset, ref }) =>
      `      <asset id="${ref}" name="${escapeXml(asset.id)}" duration="${time(asset.durationMs ?? (clip.inPointMs ?? 0) + clip.durationMs, rate)}" hasVideo="${clip.mediaType === "video" ? "1" : "0"}" hasAudio="${clip.mediaType === "audio" || asset.hasAudio ? "1" : "0"}"><media-rep kind="original-media" src="${escapeXml(asset.uri)}"/></asset>`
    )
    .join("\n");
  const spine = items
    .filter(({ clip }) => clip.mediaType === "video")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, rate)}" duration="${time(clip.durationMs, rate)}" start="${time(clip.inPointMs ?? 0, rate)}" lane="${track.index + 1}"/>`
    )
    .join("\n");
  const audio = items
    .filter(({ clip }) => clip.mediaType === "audio")
    .map(({ track, clip, ref }) =>
      `        <asset-clip ref="${ref}" name="${escapeXml(clip.name)}" offset="${time(clip.startMs, rate)}" duration="${time(clip.durationMs, rate)}" start="${time(clip.inPointMs ?? 0, rate)}" lane="-${track.index + 1}"/>`
    )
    .join("\n");
  const markers = (sequence.markers ?? [])
    .map((marker) => `        <gap name="Marker" offset="${time(marker.timeMs, rate)}" duration="0s"><marker start="0s" duration="0s" value="${escapeXml(marker.label)}"/></gap>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.10">\n  <resources>\n    <format id="r1" name="FFVideoFormat" frameDuration="${frameDuration(rate)}" width="${sequence.width}" height="${sequence.height}"/>\n${assetLines}\n  </resources>\n  <library><event name="NodeTool"><project name="${escapeXml(sequence.name)}"><sequence format="r1"><spine>\n${spine}\n${audio}\n${markers}\n      </spine></sequence></project></event></library>\n</fcpxml>\n`;
}

function renderPremiereXml(sequence: InterchangeSequence, items: readonly {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
}[]): string {
  const rate = frameRate(sequence.fps);
  const tracks = (mediaType: "video" | "audio") => sequence.tracks
    .filter((track) => items.some((item) => item.track.id === track.id && item.clip.mediaType === mediaType))
    .sort((left, right) => left.index - right.index)
    .map((track) => {
      const clips = items.filter((item) => item.track.id === track.id).map(({ clip, asset, ref }) => {
        const start = frames(clip.startMs, rate);
        const end = frames(clip.startMs + clip.durationMs, rate);
        const inPoint = frames(clip.inPointMs ?? 0, rate);
        return `        <clipitem id="${ref}"><name>${escapeXml(clip.name)}</name><start>${start}</start><end>${end}</end><in>${inPoint}</in><out>${inPoint + end - start}</out><file id="file-${ref}"><name>${escapeXml(asset.id)}</name><pathurl>${escapeXml(asset.uri)}</pathurl></file></clipitem>`;
      }).join("\n");
      return `      <track><name>${escapeXml(track.name)}</name>\n${clips}\n      </track>`;
    })
    .join("\n");
  const markers = (sequence.markers ?? [])
    .map((marker) => `    <marker><name>${escapeXml(marker.label)}</name><in>${frames(marker.timeMs, rate)}</in><out>${frames(marker.timeMs, rate)}</out></marker>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xmeml version="5"><sequence><name>${escapeXml(sequence.name)}</name><rate><timebase>${rate.timebase}</timebase><ntsc>${rate.ntsc ? "TRUE" : "FALSE"}</ntsc></rate>\n${markers}\n  <media><video><format><samplecharacteristics><width>${sequence.width}</width><height>${sequence.height}</height></samplecharacteristics></format>\n${tracks("video")}\n    </video><audio>\n${tracks("audio")}\n    </audio></media></sequence></xmeml>\n`;
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
  for (const { track, clip } of sequencedClips(sequence)) {
    if (!track) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: timeline track is missing.` });
      continue;
    }
    if (clip.mediaType !== "video" && clip.mediaType !== "audio") {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${clip.mediaType} media requires baking.` });
      continue;
    }
    for (const issue of unsupported(clip, track)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${issue}.` });
    }
    const assetId = activeAssetId(clip);
    const asset = assetId ? options.resolveAsset(assetId) : undefined;
    if (!asset) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: active media is missing.` });
      continue;
    }
    if (options.target === "premiere_xml" && clip.mediaType === "video" && asset.hasAudio) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: embedded audio requires baking or a separate audio clip.` });
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
