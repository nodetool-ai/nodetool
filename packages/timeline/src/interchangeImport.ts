/**
 * Reads a Final Cut Pro 7 XML (xmeml) sequence, the format Adobe Premiere Pro
 * exports through File > Export > Final Cut Pro XML, into a timeline document.
 *
 * Two steps, so a host can store media between them: `readPremiereXml` parses
 * the sequence and lists the files it uses, and `premiereToTimeline` builds
 * tracks, clips and markers once the host says which asset holds each file.
 * What has no NodeTool counterpart (transitions, nested sequences, generators,
 * effects other than opacity, speed and level) is reported, never guessed.
 */
import { makeClip, makeTrack } from "./defaults.js";
import type { TimelineClip, TimelineMarker, TimelineTrack } from "./types.js";

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITIES[entity] ?? match;
  });
}

/**
 * A minimal XML reader: elements, attributes, text and CDATA. Declarations,
 * comments, processing instructions and the DOCTYPE are skipped, and only the
 * predefined and numeric entities are expanded, so a DTD cannot inflate it.
 */
export const MAX_PREMIERE_XML_BYTES = 8 * 1024 * 1024;

export function parseXml(source: string): XmlElement {
  if (source.length > MAX_PREMIERE_XML_BYTES || new TextEncoder().encode(source).byteLength > MAX_PREMIERE_XML_BYTES) {
    throw new Error("XML exceeds the 8 MiB limit");
  }
  let nodes = 0;
  const root: XmlElement = { name: "#document", attrs: {}, children: [], text: "" };
  const stack: XmlElement[] = [root];
  let index = 0;
  const skipTo = (marker: string): void => {
    const end = source.indexOf(marker, index);
    if (end < 0) throw new Error(`Unterminated XML: missing "${marker}"`);
    index = end + marker.length;
  };
  while (index < source.length) {
    const open = source.indexOf("<", index);
    const textEnd = open < 0 ? source.length : open;
    if (textEnd > index) stack.at(-1)!.text += decodeEntities(source.slice(index, textEnd));
    if (open < 0) break;
    index = open;
    if (source.startsWith("<!--", index)) skipTo("-->");
    else if (source.startsWith("<![CDATA[", index)) {
      const end = source.indexOf("]]>", index);
      if (end < 0) throw new Error("Unterminated XML: missing \"]]>\"");
      stack.at(-1)!.text += source.slice(index + 9, end);
      index = end + 3;
    } else if (source.startsWith("<?", index)) skipTo("?>");
    else if (source.startsWith("<!", index)) {
      const bracket = source.indexOf("[", index);
      const close = source.indexOf(">", index);
      if (bracket >= 0 && bracket < close) skipTo("]>");
      else skipTo(">");
    } else if (source.startsWith("</", index)) {
      const end = source.indexOf(">", index);
      if (end < 0) throw new Error("Unterminated XML closing tag");
      const name = source.slice(index + 2, end).trim();
      const element = stack.pop();
      if (!element || element === root || element.name !== name) {
        throw new Error(`Malformed XML: unexpected </${name}>`);
      }
      index = end + 1;
    } else {
      let end = index + 1;
      let quote = "";
      for (; end < source.length; end += 1) {
        if (end - index > 64 * 1024) { throw new Error("XML tag exceeds the token limit"); }
        const character = source[end];
        if (quote) {
          if (character === quote) { quote = ""; }
        } else if (character === '"' || character === "'") { quote = character; }
        else if (character === ">") { break; }
      }
      if (end === source.length) { throw new Error("Unterminated XML tag"); }
      let body = source.slice(index + 1, end);
      const selfClosing = body.endsWith("/");
      if (selfClosing) body = body.slice(0, -1);
      const name = body.match(/^[^\s/>]+/)?.[0];
      if (!name) throw new Error("Malformed XML tag");
      const attrs: Record<string, string> = {};
      let cursor = name.length;
      const whitespace = (): void => { while (cursor < body.length && /\s/.test(body[cursor] ?? "")) { cursor += 1; } };
      while (cursor < body.length) {
        if (!/\s/.test(body[cursor] ?? "")) { throw new Error("Malformed XML attribute separator"); }
        whitespace();
        if (cursor === body.length) { break; }
        const start = cursor;
        while (cursor < body.length && !/[\s=]/.test(body[cursor] ?? "")) { cursor += 1; }
        const key = body.slice(start, cursor);
        whitespace();
        if (!key || body[cursor] !== "=") { throw new Error("Malformed XML attribute"); }
        cursor += 1;
        whitespace();
        const delimiter = body[cursor];
        if (delimiter !== '"' && delimiter !== "'") { throw new Error("Malformed XML attribute value"); }
        cursor += 1;
        const valueStart = cursor;
        while (cursor < body.length && body[cursor] !== delimiter) { cursor += 1; }
        if (cursor === body.length) { throw new Error("Unterminated XML attribute value"); }
        if (Object.hasOwn(attrs, key)) { throw new Error("Duplicate XML attribute"); }
        Object.defineProperty(attrs, key, { value: decodeEntities(body.slice(valueStart, cursor)), enumerable: true });
        cursor += 1;
      }
      nodes += 1;
      if (nodes > 200_000) { throw new Error("XML exceeds the node limit"); }
      if (stack.length >= 128) { throw new Error("XML exceeds the depth limit"); }
      const element: XmlElement = { name, attrs, children: [], text: "" };
      stack.at(-1)!.children.push(element);
      if (!selfClosing) stack.push(element);
      index = end + 1;
    }
  }
  if (stack.length > 1) throw new Error(`Unterminated XML: <${stack.at(-1)!.name}> is never closed`);
  return root;
}

function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((candidate) => candidate.name === name);
}

function path(element: XmlElement | undefined, ...names: string[]): XmlElement | undefined {
  return names.reduce<XmlElement | undefined>((current, name) => child(current, name), element);
}

function textOf(element: XmlElement | undefined, ...names: string[]): string | undefined {
  const found = path(element, ...names);
  return found ? found.text.trim() : undefined;
}

function numberOf(element: XmlElement | undefined, ...names: string[]): number | undefined {
  const value = Number(textOf(element, ...names));
  return textOf(element, ...names) !== undefined && Number.isFinite(value) ? value : undefined;
}

function isTrue(value: string | undefined, fallback: boolean): boolean {
  return value === undefined ? fallback : value.toUpperCase() === "TRUE";
}

function* descendants(element: XmlElement): Generator<XmlElement> {
  for (const nested of element.children) {
    yield nested;
    yield* descendants(nested);
  }
}

/** A media file the sequence names, as Premiere described it. */
export interface PremiereFile {
  id: string;
  /** The file's name, from `<name>` or the last segment of `pathurl`. */
  name: string;
  pathurl: string;
  hasVideo: boolean;
  hasAudio: boolean;
  /** No duration of its own: an image held for the clip's length. */
  still: boolean;
}

interface PremiereClip {
  id: string;
  kind: "video" | "audio";
  /** 0-based within its kind; video 0 is Premiere's V1, the bottom track. */
  trackIndex: number;
  name: string;
  enabled: boolean;
  start: number;
  end: number;
  in: number;
  fileId: string;
  speed?: number;
  opacity?: number;
  level?: number;
  links: string[];
}

export interface PremiereSequence {
  name: string;
  fps: number;
  width: number;
  height: number;
  videoTracks: Array<{ enabled: boolean; locked: boolean }>;
  audioTracks: Array<{ enabled: boolean; locked: boolean }>;
  clips: PremiereClip[];
  files: PremiereFile[];
  markers: Array<{ name: string; frame: number }>;
  /** Milliseconds per frame at the sequence rate. */
  frameMs: number;
  warnings: string[];
}

const STILL_EXTENSIONS = /\.(png|jpe?g|gif|webp|tiff?|bmp|psd)$/i;

function fileNameOf(pathurl: string, name: string | undefined): string {
  if (name) return name;
  const last = pathurl.split(/[\\/]/).pop() ?? pathurl;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

function effectParameter(clipitem: XmlElement, effectId: string, parameterId: string): string | undefined {
  for (const filter of clipitem.children.filter((candidate) => candidate.name === "filter")) {
    const effect = child(filter, "effect");
    if (textOf(effect, "effectid") !== effectId) continue;
    const parameter = effect?.children.find(
      (candidate) => candidate.name === "parameter" && textOf(candidate, "parameterid") === parameterId
    );
    if (parameter) return textOf(parameter, "value");
  }
  return undefined;
}

/** Parse the first sequence in an xmeml document. Throws when there is none. */
export function readPremiereXml(xml: string): PremiereSequence {
  const document = parseXml(xml);
  const xmeml = child(document, "xmeml");
  if (!xmeml) throw new Error("Not a Final Cut Pro XML (xmeml) document.");
  const sequence = [...descendants(xmeml)].find((element) => element.name === "sequence" && child(element, "media"));
  if (!sequence) throw new Error("The XML holds no sequence.");

  const timebase = numberOf(sequence, "rate", "timebase") ?? 30;
  const ntsc = isTrue(textOf(sequence, "rate", "ntsc"), false);
  const fps = ntsc ? Number(((timebase * 1000) / 1001).toFixed(3)) : timebase;
  const frameMs = (1000 * (ntsc ? 1001 : 1000)) / (timebase * 1000);
  const format = path(sequence, "media", "video", "format", "samplecharacteristics");
  const warnings: string[] = [];

  const files = new Map<string, PremiereFile>();
  for (const element of descendants(sequence)) {
    if (element.name !== "file" || !element.attrs.id || files.has(element.attrs.id)) continue;
    const pathurl = textOf(element, "pathurl");
    if (pathurl === undefined) continue;
    const name = fileNameOf(pathurl, textOf(element, "name"));
    const hasVideo = !!path(element, "media", "video");
    files.set(element.attrs.id, {
      id: element.attrs.id,
      name,
      pathurl,
      hasVideo,
      hasAudio: !!path(element, "media", "audio"),
      still: STILL_EXTENSIONS.test(name) || (hasVideo && !path(element, "media", "audio") && numberOf(element, "duration") === undefined)
    });
  }

  const clips: PremiereClip[] = [];
  let transitions = 0;
  let skipped = 0;
  const readTracks = (kind: "video" | "audio") =>
    (path(sequence, "media", kind)?.children ?? [])
      .filter((element) => element.name === "track")
      .map((track, trackIndex) => {
        const items = track.children;
        const followingTransitionEnd: number[] = new Array(items.length);
        let nextEnd = -1;
        for (let position = items.length - 1; position >= 0; position -= 1) {
          followingTransitionEnd[position] = nextEnd;
          const item = items[position];
          if (item?.name === "transitionitem") { nextEnd = numberOf(item, "end") ?? -1; }
        }
        let previousTransitionStart = -1;
        items.forEach((item, position) => {
          if (item.name === "transitionitem") {
            transitions += 1;
            previousTransitionStart = numberOf(item, "start") ?? -1;
          }
          if (item.name === "generatoritem") skipped += 1;
          if (item.name !== "clipitem") return;
          const fileId = child(item, "file")?.attrs.id;
          if (!fileId || !files.has(fileId)) {
            skipped += 1;
            return;
          }
          // A clip under a transition reports -1; the transition holds the edge.
          let start = numberOf(item, "start") ?? -1;
          let end = numberOf(item, "end") ?? -1;
          if (start < 0) { start = previousTransitionStart; }
          if (end < 0) { end = followingTransitionEnd[position] ?? -1; }
          if (start < 0 || end <= start) {
            skipped += 1;
            return;
          }
          const clip: PremiereClip = {
            id: item.attrs.id ?? `${kind}-${trackIndex}-${position}`,
            kind,
            trackIndex,
            name: textOf(item, "name") || files.get(fileId)!.name,
            enabled: isTrue(textOf(item, "enabled"), true),
            start,
            end,
            in: Math.max(0, numberOf(item, "in") ?? 0),
            fileId,
            links: item.children.filter((link) => link.name === "link").map((link) => textOf(link, "linkclipref") ?? "").filter(Boolean)
          };
          if (effectParameter(item, "timeremap", "variablespeed") === "1") {
            warnings.push(`${clip.name}: variable speed was imported at constant speed.`);
          }
          const speed = Number(effectParameter(item, "timeremap", "speed"));
          if (Number.isFinite(speed) && speed !== 100) {
            if (speed <= 0) warnings.push(`${clip.name}: reverse playback was imported forward.`);
            else clip.speed = speed / 100;
          }
          const opacity = Number(effectParameter(item, "opacity", "opacity"));
          if (Number.isFinite(opacity) && opacity !== 100) clip.opacity = Math.min(100, Math.max(0, opacity)) / 100;
          const level = Number(effectParameter(item, "audiolevels", "level"));
          if (Number.isFinite(level) && level !== 1) clip.level = level;
          clips.push(clip);
        });
        return {
          enabled: isTrue(textOf(track, "enabled"), true),
          locked: isTrue(textOf(track, "locked"), false)
        };
      });
  const videoTracks = readTracks("video");
  const audioTracks = readTracks("audio");
  if (transitions > 0) warnings.push(`${transitions} transition(s) were imported as overlapping cuts.`);
  if (skipped > 0) warnings.push(`${skipped} item(s) without media (nested sequences, generators, titles) were left out.`);

  const markers = sequence.children
    .filter((element) => element.name === "marker")
    .map((marker) => ({ name: textOf(marker, "name") || textOf(marker, "comment") || "Marker", frame: numberOf(marker, "in") ?? 0 }));

  const usedFileIds = new Set(clips.map((clip) => clip.fileId));
  return {
    name: textOf(sequence, "name") || "Imported sequence",
    fps,
    width: numberOf(format, "width") ?? 1920,
    height: numberOf(format, "height") ?? 1080,
    videoTracks,
    audioTracks,
    clips,
    files: [...files.values()].filter((file) => usedFileIds.has(file.id)),
    markers,
    frameMs,
    warnings
  };
}

export interface PremiereImport {
  name: string;
  fps: number;
  width: number;
  height: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  /** Clips left out because their file was not supplied. */
  missingClips: number;
  warnings: string[];
}

export interface PremiereToTimelineOptions {
  /** The asset holding `file`, or undefined when its media was not supplied. */
  resolveFile(file: PremiereFile): string | undefined;
  /** Id factory; defaults to `makeClip`/`makeTrack`'s own. */
  newId?: (kind: "track" | "clip" | "marker" | "link") => string;
}

/** Build a timeline document from a read sequence and the stored media. */
export function premiereToTimeline(
  sequence: PremiereSequence,
  options: PremiereToTimelineOptions
): PremiereImport {
  const warnings = [...sequence.warnings];
  const newId = options.newId;
  const ms = (frames: number): number => Math.round(frames * sequence.frameMs);
  const files = new Map(sequence.files.map((file) => [file.id, file]));
  const byId = new Map(sequence.clips.map((clip) => [clip.id, clip]));

  // A Premiere video clip's own sound arrives as a linked audio clip of the
  // same file. NodeTool plays a video's sound from the video clip, so that
  // audio clip folds into it rather than playing twice.
  const folded = new Map<string, PremiereClip>();
  for (const clip of sequence.clips) {
    if (clip.kind !== "audio") continue;
    const picture = clip.links
      .map((id) => byId.get(id))
      .find((other) => other?.kind === "video" && other.fileId === clip.fileId && other.start === clip.start
        && other.end === clip.end && other.in === clip.in && (other.speed ?? 1) === (clip.speed ?? 1));
    if (picture && !folded.has(picture.id)) folded.set(picture.id, clip);
  }
  const foldedAudio = new Set([...folded.values()].map((clip) => clip.id));

  const usedTracks = new Set<string>();
  for (const clip of sequence.clips) {
    if (!foldedAudio.has(clip.id)) { usedTracks.add(`${clip.kind}:${clip.trackIndex}`); }
  }
  const trackIds = new Map<string, string>();
  const tracks: TimelineTrack[] = [];
  const addTrack = (kind: "video" | "audio", index: number) => {
    const source = (kind === "video" ? sequence.videoTracks : sequence.audioTracks)[index]!;
    const track = makeTrack({
      name: `${kind === "video" ? "V" : "A"}${index + 1}`,
      type: kind,
      index: tracks.length,
      visible: kind === "audio" || source.enabled,
      locked: source.locked
    });
    if (newId) track.id = newId("track");
    if (kind === "audio" && !source.enabled) track.muted = true;
    trackIds.set(`${kind}:${index}`, track.id);
    tracks.push(track);
  };
  // Premiere's highest video track draws on top, and index 0 is the top here.
  for (let index = sequence.videoTracks.length - 1; index >= 0; index -= 1) {
    if (usedTracks.has(`video:${index}`)) addTrack("video", index);
  }
  sequence.audioTracks.forEach((_, index) => {
    if (usedTracks.has(`audio:${index}`)) addTrack("audio", index);
  });

  const clips: TimelineClip[] = [];
  const importedBySource = new Map<string, TimelineClip>();
  let missingClips = 0;
  const missingFiles = new Set<string>();
  for (const source of sequence.clips) {
    if (foldedAudio.has(source.id)) continue;
    const file = files.get(source.fileId)!;
    const assetId = options.resolveFile(file);
    if (!assetId) {
      missingClips += 1;
      missingFiles.add(file.name);
      continue;
    }
    const mediaType = source.kind === "audio" ? "audio" : file.still ? "image" : "video";
    const clip = makeClip({
      trackId: trackIds.get(`${source.kind}:${source.trackIndex}`)!,
      name: source.name,
      startMs: ms(source.start),
      durationMs: ms(source.end - source.start),
      mediaType,
      sourceType: "imported",
      status: "generated",
      currentAssetId: assetId
    });
    if (newId) clip.id = newId("clip");
    if (mediaType !== "image" && source.in > 0) clip.inPointMs = ms(source.in);
    if (mediaType !== "image" && source.speed !== undefined) clip.speedMultiplier = source.speed;
    if (source.opacity !== undefined && source.kind === "video") clip.opacity = source.opacity;
    const sound = source.kind === "audio" ? source : folded.get(source.id);
    if (sound?.level !== undefined) {
      clip.volumeDb = sound.level > 0 ? Number((20 * Math.log10(sound.level)).toFixed(2)) : -60;
    }
    if (!source.enabled) {
      if (source.kind === "video") clip.hidden = true;
      else clip.muted = true;
    }
    if (sound && sound !== source && (!sound.enabled || !sequence.audioTracks[sound.trackIndex]?.enabled)) clip.muted = true;
    // The file has sound the Premiere cut did not use: keep it silent here.
    if (source.kind === "video" && !sound && file.hasAudio) {
      clip.muted = true;
    }
    importedBySource.set(source.id, clip);
    clips.push(clip);
  }

  // Remaining links pair a picture with sound from another file: share a
  // linkId so they move together and the picture's own sound stays silent.
  const linked = new Set<string>();
  for (const source of sequence.clips) {
    const imported = importedBySource.get(source.id);
    if (!imported || linked.has(source.id)) continue;
    const group = [...new Set([source.id, ...source.links])].filter((id) => importedBySource.has(id));
    if (group.length < 2) continue;
    const linkId = newId ? newId("link") : `link-${imported.id}`;
    for (const id of group) {
      linked.add(id);
      const member = importedBySource.get(id);
      if (member) { member.linkId = linkId; }
    }
  }

  if (missingFiles.size > 0) {
    warnings.push(`${missingClips} clip(s) were left out because their media was not supplied: ${[...missingFiles].join(", ")}.`);
  }
  const markers: TimelineMarker[] = sequence.markers.map((marker, position) => ({
    id: newId ? newId("marker") : `marker-${position + 1}`,
    timeMs: ms(marker.frame),
    label: marker.name
  }));
  return {
    name: sequence.name,
    fps: sequence.fps,
    width: sequence.width,
    height: sequence.height,
    tracks,
    clips,
    markers,
    missingClips,
    warnings
  };
}
