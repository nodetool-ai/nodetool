import { extractedAudioLinkIds } from "./clipAudio.js";
import { sourceRate } from "./sourceRate.js";
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

/** The asset a clip shows: `currentAssetId`, else its active take. */
export function clipActiveAssetId(clip: TimelineClip): string | undefined {
  if (clip.currentAssetId !== undefined) return clip.currentAssetId;
  const takeId = activeTakeIdOf({ ...clip, currentAssetId: undefined });
  const take = clip.versions.find((version) => version.id === takeId);
  return take?.assetId;
}

function unsupported(clip: TimelineClip, track: TimelineTrack, target: InterchangeTarget): string[] {
  // Premiere XML carries enable flags, opacity, constant speed and clip
  // volume, so only FCPXML reports those as needing a bake.
  const premiere = target === "premiere_xml";
  const issues: string[] = [];
  if ((clip.effects?.length ?? 0) > 0) issues.push("effects require baking");
  if ((clip.animations?.length ?? 0) > 0) issues.push("animations require baking");
  if (clip.generatedMatte?.status === "ready") issues.push("generated matte requires baking");
  if (clip.transform || clip.crop || clip.mask || clip.matte) issues.push("advanced transforms require baking");
  if (clip.blendMode && clip.blendMode !== "normal") issues.push("blend mode requires baking");
  if (!premiere && clip.opacity !== undefined && clip.opacity !== 1) issues.push("opacity requires baking");
  if (clip.transitionIn) issues.push("transitions require baking");
  if (!premiere && (clip.hidden || clip.muted || !track.visible || track.muted)) issues.push("disabled media cannot be represented");
  if (!premiere && clip.speedMultiplier !== undefined && clip.speedMultiplier !== 1 && !clip.speedBaked) issues.push("playback speed requires baking");
  if (clip.timeRemap) issues.push("time remap requires baking");
  if (!premiere && clip.volumeDb !== undefined && clip.volumeDb !== 0) issues.push("audio volume requires baking");
  if (clip.fadeInMs || clip.fadeOutMs) issues.push("audio fades require baking");
  if (clip.caption) issues.push("captions require baking");
  return issues;
}

function exportsMediaType(clip: TimelineClip, target: InterchangeTarget): boolean {
  if (clip.mediaType === "video" || clip.mediaType === "audio") return true;
  return target === "premiere_xml" && clip.mediaType === "image";
}

/**
 * The active asset ids of every clip `target` can carry, deduped in document
 * order. A host resolves these (bytes, duration, audio presence) before it
 * calls {@link exportInterchange}, whose resolver is synchronous.
 */
export function interchangeAssetIds(
  sequence: Pick<InterchangeSequence, "tracks" | "clips">,
  target: InterchangeTarget
): string[] {
  const trackIds = new Set(sequence.tracks.map((track) => track.id));
  const ids = new Set<string>();
  for (const clip of sequence.clips) {
    if (!trackIds.has(clip.trackId) || !exportsMediaType(clip, target)) continue;
    const assetId = clipActiveAssetId(clip);
    if (assetId) ids.add(assetId);
  }
  return [...ids];
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

interface ExportItem {
  track: TimelineTrack;
  clip: TimelineClip;
  asset: InterchangeAsset;
  ref: string;
  /** Premiere only: also place the video file's own sound on an audio track. */
  embeddedAudio?: boolean;
}

/** One clipitem in a Premiere XML sequence. */
interface PremiereEntry {
  id: string;
  kind: "video" | "audio";
  item: ExportItem;
  /** Entries sharing a key are linked (move and trim together in Premiere). */
  linkKey: string;
  start: number;
  end: number;
}

interface PremiereLane {
  enabled: boolean;
  locked: boolean;
  entries: PremiereEntry[];
}

function xmlNumber(value: number): string {
  return String(Number(value.toFixed(4)));
}

function bool(value: boolean): string {
  return value ? "TRUE" : "FALSE";
}

/**
 * A NodeTool track may hold overlapping clips (a transition, a free drop);
 * a Premiere track may not. Overlaps stack onto extra lanes, the later clip
 * above, which is also the clip that draws on top here.
 */
function packLanes(entries: readonly PremiereEntry[], enabled: boolean, locked: boolean): PremiereLane[] {
  const lanes: PremiereLane[] = [];
  let highestActiveLane = -1;
  for (const entry of [...entries].sort((left, right) => left.start - right.start)) {
    // Place it above every overlapping predecessor, even if a lower lane is free.
    while (highestActiveLane >= 0 && (lanes[highestActiveLane]?.entries.at(-1)?.end ?? 0) <= entry.start) {
      highestActiveLane -= 1;
    }
    highestActiveLane += 1;
    const lane = lanes[highestActiveLane];
    if (lane) { lane.entries.push(entry); }
    else { lanes.push({ enabled, locked, entries: [entry] }); }
  }
  return lanes;
}

function premiereEffect(name: string, effectId: string, category: string, mediaType: "video" | "audio", parameters: string): string {
  return `<filter><effect><name>${name}</name><effectid>${effectId}</effectid><effectcategory>${category}</effectcategory><effecttype>${category}</effecttype><mediatype>${mediaType}</mediatype>${parameters}</effect></filter>`;
}

function premiereParameter(id: string, value: string, range?: [number, number]): string {
  const bounds = range ? `<valuemin>${range[0]}</valuemin><valuemax>${range[1]}</valuemax>` : "";
  return `<parameter authoringApp="PremierePro"><parameterid>${id}</parameterid><name>${id}</name>${bounds}<value>${value}</value></parameter>`;
}

/** Premiere's Audio Levels gain is linear, capped at +12 dB. */
const MAX_AUDIO_LEVEL = 3.98109;

function premiereFilters(entry: PremiereEntry): string {
  const { clip } = entry.item;
  const filters: string[] = [];
  if (entry.kind === "video" && clip.opacity !== undefined && clip.opacity !== 1) {
    const opacity = Math.min(100, Math.max(0, clip.opacity * 100));
    filters.push(premiereEffect("Opacity", "opacity", "motion", "video", premiereParameter("opacity", xmlNumber(opacity), [0, 100])));
  }
  const rate = sourceRate(clip);
  if (clip.mediaType !== "image" && !clip.timeRemap && rate !== 1) {
    filters.push(premiereEffect("Time Remap", "timeremap", "motion", entry.kind, [
      premiereParameter("variablespeed", "0", [0, 1]),
      premiereParameter("speed", xmlNumber(rate * 100), [-100_000, 100_000]),
      premiereParameter("reverse", "FALSE"),
      premiereParameter("frameblending", "FALSE")
    ].join("")));
  }
  if (entry.kind === "audio" && clip.volumeDb !== undefined && clip.volumeDb !== 0) {
    const level = Math.min(MAX_AUDIO_LEVEL, 10 ** (clip.volumeDb / 20));
    filters.push(premiereEffect("Audio Levels", "audiolevels", "audiolevels", "audio", premiereParameter("level", xmlNumber(level), [0, MAX_AUDIO_LEVEL])));
  }
  return filters.join("");
}

function fileName(uri: string): string {
  return uri.split(/[\\/]/).pop() || uri;
}

function renderPremiereXml(sequence: InterchangeSequence, items: readonly ExportItem[]): string {
  const rate = frameRate(sequence.fps);
  const rateXml = `<rate><timebase>${rate.timebase}</timebase><ntsc>${bool(rate.ntsc)}</ntsc></rate>`;
  let clipCount = 0;
  const entry = (item: ExportItem, kind: "video" | "audio"): PremiereEntry => ({
    id: `clipitem-${++clipCount}`,
    kind,
    item,
    linkKey: item.clip.linkId ? `link:${item.clip.linkId}` : `clip:${item.clip.id}`,
    start: frames(item.clip.startMs, rate),
    end: frames(item.clip.startMs + item.clip.durationMs, rate)
  });
  const visual = items.filter(({ clip }) => clip.mediaType === "video" || clip.mediaType === "image").map((item) => entry(item, "video"));
  const embedded = items.filter((item) => item.embeddedAudio).map((item) => entry(item, "audio"));
  const sound = items.filter(({ clip }) => clip.mediaType === "audio").map((item) => entry(item, "audio"));

  // Index 0 draws on top here; Premiere's V1 is the bottom track.
  const bottomUp = [...sequence.tracks].sort((left, right) => right.index - left.index);
  const topDown = [...sequence.tracks].sort((left, right) => left.index - right.index);
  const lanesFor = (entries: readonly PremiereEntry[], order: readonly TimelineTrack[], kind: "video" | "audio") =>
    order.flatMap((track) => {
      const own = entries.filter((candidate) => candidate.item.track.id === track.id);
      if (own.length === 0) return [];
      return packLanes(own, kind === "video" ? track.visible : track.muted !== true, track.locked);
    });
  const videoLanes = lanesFor(visual, bottomUp, "video");
  const audioLanes = [...lanesFor(embedded, bottomUp, "audio"), ...lanesFor(sound, topDown, "audio")];

  const placement = new Map<string, { trackIndex: number; clipIndex: number }>();
  for (const lanes of [videoLanes, audioLanes]) {
    lanes.forEach((lane, laneIndex) => lane.entries.forEach((placed, clipIndex) => {
      placement.set(placed.id, { trackIndex: laneIndex + 1, clipIndex: clipIndex + 1 });
    }));
  }
  const groups = new Map<string, PremiereEntry[]>();
  for (const placed of [...visual, ...embedded, ...sound]) {
    groups.set(placed.linkKey, [...(groups.get(placed.linkKey) ?? []), placed]);
  }
  const links = (placed: PremiereEntry): string => {
    const group = groups.get(placed.linkKey) ?? [];
    // Premiere links one picture to its sound; anything else stays unlinked.
    if (group.length < 2 || group.filter((member) => member.kind === "video").length > 1) return "";
    let audioGroup = 0;
    return group.map((member) => {
      const at = placement.get(member.id)!;
      const groupIndex = member.kind === "audio" ? `<groupindex>${++audioGroup}</groupindex>` : "";
      return `<link><linkclipref>${member.id}</linkclipref><mediatype>${member.kind}</mediatype><trackindex>${at.trackIndex}</trackindex><clipindex>${at.clipIndex}</clipindex>${groupIndex}</link>`;
    }).join("");
  };

  // One <file> per asset: written in full where it first appears, then by id.
  const allEntries = [...visual, ...embedded, ...sound];
  const fileIds = new Map<string, string>();
  const fileDurations = new Map<string, number>();
  const sourceSpan = (placed: PremiereEntry): { in: number; out: number } => {
    const { clip } = placed.item;
    if (clip.mediaType === "image") return { in: 0, out: placed.end - placed.start };
    const inPoint = frames(clip.inPointMs ?? 0, rate);
    const length = clip.timeRemap ? placed.end - placed.start : frames(clip.durationMs * sourceRate(clip), rate);
    return { in: inPoint, out: inPoint + length };
  };
  for (const placed of allEntries) {
    const { asset } = placed.item;
    if (!fileIds.has(asset.id)) fileIds.set(asset.id, `file-${fileIds.size + 1}`);
    const known = asset.durationMs !== undefined ? frames(asset.durationMs, rate) : 0;
    fileDurations.set(asset.id, Math.max(fileDurations.get(asset.id) ?? 0, known, sourceSpan(placed).out));
  }
  const fileHasVideo = new Set(visual.map((placed) => placed.item.asset.id));
  const fileHasAudio = new Set([...embedded, ...sound].map((placed) => placed.item.asset.id));
  const written = new Set<string>();
  const fileXml = (asset: InterchangeAsset): string => {
    const id = fileIds.get(asset.id)!;
    if (written.has(asset.id)) return `<file id="${id}"/>`;
    written.add(asset.id);
    const video = fileHasVideo.has(asset.id) ? `<video><samplecharacteristics>${rateXml}</samplecharacteristics></video>` : "";
    const audio = fileHasAudio.has(asset.id)
      ? "<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio>"
      : "";
    return `<file id="${id}"><name>${escapeXml(fileName(asset.uri))}</name><pathurl>${escapeXml(asset.uri)}</pathurl>${rateXml}<duration>${fileDurations.get(asset.id)}</duration><media>${video}${audio}</media></file>`;
  };

  const clipXml = (placed: PremiereEntry): string => {
    const { clip, asset } = placed.item;
    const span = sourceSpan(placed);
    const enabled = placed.kind === "video" ? clip.hidden !== true : clip.muted !== true;
    const sourceTrack = `<sourcetrack><mediatype>${placed.kind}</mediatype><trackindex>1</trackindex></sourcetrack>`;
    return `<clipitem id="${placed.id}"><name>${escapeXml(clip.name)}</name><enabled>${bool(enabled)}</enabled><duration>${fileDurations.get(asset.id)}</duration>${rateXml}<start>${placed.start}</start><end>${placed.end}</end><in>${span.in}</in><out>${span.out}</out>${fileXml(asset)}${sourceTrack}${premiereFilters(placed)}${links(placed)}</clipitem>`;
  };
  const tracksXml = (lanes: readonly PremiereLane[]): string =>
    lanes.map((lane) => `        <track><enabled>${bool(lane.enabled)}</enabled><locked>${bool(lane.locked)}</locked>\n${lane.entries.map((placed) => `          ${clipXml(placed)}`).join("\n")}\n        </track>`).join("\n");

  const duration = Math.max(0, ...allEntries.map((placed) => placed.end));
  const markers = (sequence.markers ?? [])
    .map((marker) => `    <marker><comment></comment><name>${escapeXml(marker.label)}</name><in>${frames(marker.timeMs, rate)}</in><out>-1</out></marker>`)
    .join("\n");
  // Drop-frame timecode exists only for 29.97 and 59.94.
  const dropFrame = rate.ntsc && rate.timebase !== 24;
  const timecode = `<timecode>${rateXml}<string>${dropFrame ? "00;00;00;00" : "00:00:00:00"}</string><frame>0</frame><displayformat>${dropFrame ? "DF" : "NDF"}</displayformat></timecode>`;
  const format = `<format><samplecharacteristics>${rateXml}<width>${sequence.width}</width><height>${sequence.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<!DOCTYPE xmeml>",
    '<xmeml version="4">',
    '  <sequence id="sequence-1">',
    `    <name>${escapeXml(sequence.name)}</name><duration>${duration}</duration>${rateXml}${timecode}`,
    "    <media>",
    `      <video>${format}`,
    tracksXml(videoLanes),
    "      </video>",
    '      <audio><numOutputChannels>2</numOutputChannels><format><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics></format>',
    tracksXml(audioLanes),
    "      </audio>",
    "    </media>",
    markers,
    "  </sequence>",
    "</xmeml>",
    ""
  ].filter((line) => line !== "").join("\n");
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
  const items: ExportItem[] = [];
  // A video whose sound was detached onto an audio clip plays only that clip.
  const extractedAudio = extractedAudioLinkIds(sequence.clips, sequence.tracks);
  for (const { track, clip } of sequencedClips(sequence)) {
    if (!track) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: timeline track is missing.` });
      continue;
    }
    if (!exportsMediaType(clip, options.target)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${clip.mediaType} media requires baking.` });
      continue;
    }
    for (const issue of unsupported(clip, track, options.target)) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: ${issue}.` });
    }
    const assetId = clipActiveAssetId(clip);
    const asset = assetId ? options.resolveAsset(assetId) : undefined;
    if (!asset) {
      warnings.push({ clipId: clip.id, message: `${clip.name}: active media is missing.` });
      continue;
    }
    const item: ExportItem = { track, clip, asset, ref: `r${items.length + 2}` };
    const soundsHere =
      clip.mediaType === "video" && (track.type === "video" || track.type === "overlay") &&
      !(clip.linkId && extractedAudio.has(clip.linkId));
    if (options.target === "premiere_xml" && soundsHere) {
      if (asset.hasAudio === true) item.embeddedAudio = true;
      else if (asset.hasAudio === undefined) {
        warnings.push({ clipId: clip.id, message: `${clip.name}: embedded audio could not be checked and was left out.` });
      }
    }
    items.push(item);
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
