/**
 * Timeline nodes — operate on persisted timeline sequences (the video
 * editor's documents) referenced by the `timeline` type.
 *
 * RenderTimeline produces a rough cut with ffmpeg: video/image clips are
 * normalized to the sequence's resolution and concatenated in start order,
 * and audio-track clips are mixed in at their timeline offsets. Per-clip
 * effects, transitions, captions, overlay tracks, and speed changes are not
 * applied server-side — open the timeline editor for the full preview.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { VideoRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import {
  makeClip,
  makeSequence,
  makeTrack,
  type TimelineClip,
  type TimelineSequence,
  type TimelineTrack
} from "@nodetool-ai/timeline";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);

const FFMPEG_MAX_BUFFER = 10 * 1024 * 1024;

interface TimelineRefLike {
  type?: string;
  id?: string | null;
  data?: unknown;
}

function videoRef(data: Uint8Array, extras: Partial<VideoRef> = {}): VideoRef {
  return {
    type: "video",
    data: Buffer.from(data).toString("base64"),
    ...extras
  };
}

async function loadTimelineSequence(
  ref: unknown,
  context: ProcessingContext | undefined
): Promise<TimelineSequence> {
  const timelineRef = (ref ?? {}) as TimelineRefLike;
  if (!timelineRef.id) {
    throw new Error(
      "Timeline input is empty — connect a Constant Timeline node and pick a timeline"
    );
  }
  if (!context) {
    throw new Error("Timeline nodes require a processing context");
  }
  const seq = (await context.getTimelineSequence(
    timelineRef.id
  )) as TimelineSequence | null;
  if (!seq) {
    throw new Error(`Timeline sequence not found: ${timelineRef.id}`);
  }
  return seq;
}

async function ffprobeDurationSeconds(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    const val = parseFloat(stdout.trim());
    return Number.isFinite(val) ? val : 0;
  } catch {
    return 0;
  }
}

async function ffprobeHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFile("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a",
      "-show_entries",
      "stream=codec_type",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function resolveClipBytes(
  clip: TimelineClip,
  context: ProcessingContext
): Promise<Uint8Array | null> {
  if (!clip.currentAssetId) return null;
  const { bytes } = await context.resolveAssetBytes(clip.currentAssetId);
  return bytes;
}

function trackById(
  tracks: TimelineTrack[]
): Map<string, TimelineTrack> {
  return new Map(tracks.map((t) => [t.id, t]));
}

/** Clips that take part in the rough cut, in render order. */
function renderableVideoClips(seq: TimelineSequence): TimelineClip[] {
  const tracks = trackById(seq.tracks);
  return seq.clips
    .filter((clip) => {
      const track = tracks.get(clip.trackId);
      return (
        track?.type === "video" &&
        track.visible !== false &&
        !clip.hidden &&
        (clip.mediaType === "video" || clip.mediaType === "image") &&
        !!clip.currentAssetId &&
        clip.durationMs > 0
      );
    })
    .sort((a, b) => a.startMs - b.startMs);
}

function mixableAudioClips(seq: TimelineSequence): TimelineClip[] {
  const tracks = trackById(seq.tracks);
  return seq.clips
    .filter((clip) => {
      const track = tracks.get(clip.trackId);
      return (
        track?.type === "audio" &&
        track.muted !== true &&
        !clip.muted &&
        !clip.hidden &&
        clip.mediaType === "audio" &&
        !!clip.currentAssetId &&
        clip.durationMs > 0
      );
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** Scale + letterbox to the sequence frame, normalize fps and pixel format. */
function segmentVideoFilter(width: number, height: number, fps: number): string {
  return (
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${fps},format=yuv420p`
  );
}

/**
 * Encode one clip into a uniform segment (same codec, resolution, fps,
 * stereo AAC audio) so segments can be concatenated losslessly.
 */
async function encodeSegment(opts: {
  clip: TimelineClip;
  srcPath: string;
  segPath: string;
  width: number;
  height: number;
  fps: number;
}): Promise<void> {
  const { clip, srcPath, segPath, width, height, fps } = opts;
  const durationS = clip.durationMs / 1000;
  const filter = segmentVideoFilter(width, height, fps);
  const silentAudio = [
    "-f",
    "lavfi",
    "-t",
    String(durationS),
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000"
  ];

  if (clip.mediaType === "image") {
    await execFile(
      "ffmpeg",
      [
        "-y",
        "-loop",
        "1",
        "-t",
        String(durationS),
        "-i",
        srcPath,
        ...silentAudio,
        "-filter_complex",
        `[0:v]${filter}[v]`,
        "-map",
        "[v]",
        "-map",
        "1:a",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-shortest",
        segPath
      ],
      { maxBuffer: FFMPEG_MAX_BUFFER }
    );
    return;
  }

  const hasAudio = await ffprobeHasAudio(srcPath);
  const seek: string[] = [];
  if (typeof clip.inPointMs === "number" && clip.inPointMs > 0) {
    seek.push("-ss", String(clip.inPointMs / 1000));
  }
  if (typeof clip.outPointMs === "number" && clip.outPointMs > 0) {
    seek.push("-to", String(clip.outPointMs / 1000));
  }
  await execFile(
    "ffmpeg",
    [
      "-y",
      ...seek,
      "-i",
      srcPath,
      ...(hasAudio ? [] : silentAudio),
      "-filter_complex",
      `[0:v]${filter}[v]`,
      "-map",
      "[v]",
      "-map",
      hasAudio ? "0:a" : "1:a",
      "-t",
      String(durationS),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      segPath
    ],
    { maxBuffer: FFMPEG_MAX_BUFFER }
  );
}

/** Per-clip audio chain: trim to in/out, apply gain, delay to timeline start. */
function audioClipFilter(
  clip: TimelineClip,
  inputIndex: number,
  label: string
): string {
  const steps: string[] = [];
  const inS = typeof clip.inPointMs === "number" ? clip.inPointMs / 1000 : 0;
  const outS =
    typeof clip.outPointMs === "number" && clip.outPointMs > 0
      ? clip.outPointMs / 1000
      : inS + clip.durationMs / 1000;
  steps.push(`atrim=start=${inS}:end=${outS}`, "asetpts=PTS-STARTPTS");
  if (typeof clip.volumeDb === "number" && clip.volumeDb !== 0) {
    steps.push(`volume=${clip.volumeDb}dB`);
  }
  const delay = Math.max(0, Math.round(clip.startMs));
  steps.push(`adelay=${delay}|${delay}`);
  return `[${inputIndex}:a]${steps.join(",")}[${label}]`;
}

export class RenderTimelineNode extends BaseNode {
  static readonly nodeType = "nodetool.timeline.RenderTimeline";
  static readonly title = "Render Timeline";
  static readonly description =
    "Render a timeline sequence to a video (rough cut: clips are concatenated in start order, audio tracks are mixed in at their offsets).\n    timeline, render, video, export, cut\n\n    Use cases:\n    - Turn an edit assembled in the timeline editor into a shareable video\n    - Feed a rough cut into captioning, review, or upload nodes\n    - Automate exports of timelines built by other workflow nodes";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields = ["timeline"];
  static readonly inputFields = ["timeline"];

  @prop({
    type: "timeline",
    default: { type: "timeline", id: null, data: null },
    title: "Timeline",
    description: "The timeline sequence to render."
  })
  declare timeline: any;

  @prop({
    type: "bool",
    default: true,
    title: "Include audio",
    description: "Mix audio-track clips into the rendered video."
  })
  declare include_audio: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const seq = await loadTimelineSequence(this.timeline, context);
    const ctx = context as ProcessingContext;
    const width = seq.width > 0 ? seq.width : 1920;
    const height = seq.height > 0 ? seq.height : 1080;
    const fps = seq.fps > 0 ? seq.fps : 30;

    const videoClips = renderableVideoClips(seq);
    const audioClips = this.include_audio === false ? [] : mixableAudioClips(seq);
    if (videoClips.length === 0 && audioClips.length === 0) {
      throw new Error(
        `Timeline "${seq.name}" has no renderable clips with media — generate or import clip media first`
      );
    }

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-timeline-")
    );
    try {
      // 1. Normalize each video/image clip into a uniform segment.
      const segments: string[] = [];
      for (const [i, clip] of videoClips.entries()) {
        const bytes = await resolveClipBytes(clip, ctx);
        if (!bytes) {
          console.warn(
            `RenderTimeline: skipping clip "${clip.name}" — asset ${clip.currentAssetId} not found`
          );
          continue;
        }
        const srcPath = path.join(workDir, `src_${i}`);
        await fs.writeFile(srcPath, bytes);
        const segPath = path.join(workDir, `seg_${i}.mp4`);
        await encodeSegment({ clip, srcPath, segPath, width, height, fps });
        segments.push(segPath);
      }

      // 2. Concatenate segments (or synthesize black video for audio-only cuts).
      const basePath = path.join(workDir, "base.mp4");
      if (segments.length > 0) {
        const listPath = path.join(workDir, "segments.txt");
        await fs.writeFile(
          listPath,
          segments.map((p) => `file '${p}'`).join("\n")
        );
        await execFile(
          "ffmpeg",
          ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", basePath],
          { maxBuffer: FFMPEG_MAX_BUFFER }
        );
      } else {
        const totalS =
          Math.max(...audioClips.map((c) => c.startMs + c.durationMs)) / 1000;
        await execFile(
          "ffmpeg",
          [
            "-y",
            "-f",
            "lavfi",
            "-t",
            String(totalS),
            "-i",
            `color=black:s=${width}x${height}:r=${fps}`,
            "-f",
            "lavfi",
            "-t",
            String(totalS),
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-c:a",
            "aac",
            basePath
          ],
          { maxBuffer: FFMPEG_MAX_BUFFER }
        );
      }

      // 3. Mix audio-track clips over the base at their timeline offsets.
      let outPath = basePath;
      if (audioClips.length > 0) {
        const inputs: string[] = ["-i", basePath];
        const filters: string[] = [];
        const labels: string[] = [];
        let inputIndex = 1;
        for (const [i, clip] of audioClips.entries()) {
          const bytes = await resolveClipBytes(clip, ctx);
          if (!bytes) {
            console.warn(
              `RenderTimeline: skipping audio clip "${clip.name}" — asset ${clip.currentAssetId} not found`
            );
            continue;
          }
          const audioPath = path.join(workDir, `audio_${i}`);
          await fs.writeFile(audioPath, bytes);
          inputs.push("-i", audioPath);
          const label = `a${i}`;
          filters.push(audioClipFilter(clip, inputIndex, label));
          labels.push(`[${label}]`);
          inputIndex += 1;
        }
        if (labels.length > 0) {
          outPath = path.join(workDir, "mixed.mp4");
          const amix = `[0:a]${labels.join("")}amix=inputs=${labels.length + 1}:duration=first:normalize=0[aout]`;
          await execFile(
            "ffmpeg",
            [
              "-y",
              ...inputs,
              "-filter_complex",
              [...filters, amix].join(";"),
              "-map",
              "0:v",
              "-map",
              "[aout]",
              "-c:v",
              "copy",
              "-c:a",
              "aac",
              outPath
            ],
            { maxBuffer: FFMPEG_MAX_BUFFER }
          );
        }
      }

      const rendered = new Uint8Array(await fs.readFile(outPath));
      const duration = await ffprobeDurationSeconds(outPath);
      return {
        output: videoRef(rendered, {
          format: "mp4",
          duration: duration > 0 ? duration : null
        })
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}

export class TimelineTranscriptNode extends BaseNode {
  static readonly nodeType = "nodetool.timeline.Transcript";
  static readonly title = "Timeline Transcript";
  static readonly description =
    "Extract the transcript of a timeline sequence as text.\n    timeline, transcript, text, script, voiceover\n\n    Use cases:\n    - Summarize or rewrite an edit's narration with an LLM\n    - Generate titles, descriptions, or chapters from the spoken script\n    - Translate a voiceover script before re-recording with TTS";
  static readonly metadataOutputTypes = {
    text: "str",
    lines: "list[str]"
  };
  static readonly inlineFields = ["timeline"];
  static readonly inputFields = ["timeline"];

  @prop({
    type: "timeline",
    default: { type: "timeline", id: null, data: null },
    title: "Timeline",
    description: "The timeline sequence to read the transcript from."
  })
  declare timeline: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const seq = await loadTimelineSequence(this.timeline, context);
    const lines = (seq.transcript ?? []).map((line) => line.text);
    return { text: lines.join("\n"), lines };
  }
}

export class AddClipsToTimelineNode extends BaseNode {
  static readonly nodeType = "nodetool.timeline.AddClips";
  static readonly title = "Add Clips To Timeline";
  static readonly description =
    "Append media to a timeline sequence as clips (videos and images on the video track, audio on the audio track). Creates a new timeline when none is given.\n    timeline, clips, append, assemble, storyboard\n\n    Use cases:\n    - Assemble generated shots into an editable rough cut\n    - Turn a storyboard's images into an animatic\n    - Add a generated voiceover or soundtrack under an edit";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    output: "timeline"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["timeline", "clips"];

  @prop({
    type: "timeline",
    default: { type: "timeline", id: null, data: null },
    title: "Timeline",
    description:
      "Timeline to append to. Leave empty to create a new timeline."
  })
  declare timeline: any;

  @prop({
    type: "list",
    default: [],
    title: "Clips",
    description: "Media to append: image, video, and audio references."
  })
  declare clips: any;

  @prop({
    type: "str",
    default: "Untitled video",
    title: "Name",
    description: "Name for the timeline when a new one is created."
  })
  declare name: any;

  @prop({
    type: "int",
    default: 3000,
    title: "Image duration (ms)",
    description: "Clip duration for still images, in milliseconds.",
    min: 100,
    max: 600000
  })
  declare image_duration_ms: any;

  async process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    if (!context) {
      throw new Error("AddClipsToTimeline requires a processing context");
    }
    const items = (Array.isArray(this.clips) ? this.clips : [])
      .filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === "object"
      )
      .filter((item) =>
        ["image", "video", "audio"].includes(String(item.type))
      );
    if (items.length === 0) {
      throw new Error("AddClipsToTimeline: no image/video/audio clips given");
    }

    const timelineRef = (this.timeline ?? {}) as TimelineRefLike;
    const seq: TimelineSequence = timelineRef.id
      ? await loadTimelineSequence(timelineRef, context)
      : makeSequence({
          name: String(this.name ?? "Untitled video"),
          projectId: "default"
        });

    const ensureTrack = (type: "video" | "audio"): TimelineTrack => {
      const existing = seq.tracks.find((t) => t.type === type);
      if (existing) return existing;
      const track = makeTrack({
        type,
        name: type === "video" ? "Video" : "Audio",
        index: seq.tracks.length
      });
      seq.tracks.push(track);
      return track;
    };
    const trackEnd = (trackId: string): number =>
      seq.clips
        .filter((c) => c.trackId === trackId)
        .reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0);

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-timeline-add-")
    );
    try {
      const cursor: Record<string, number> = {};
      for (const [i, item] of items.entries()) {
        const mediaType = String(item.type) as "image" | "video" | "audio";
        const bytes = await loadMediaRefBytes(
          item as { uri?: string; data?: unknown; asset_id?: string | null },
          context
        );

        let assetId =
          typeof item.asset_id === "string" && item.asset_id
            ? item.asset_id
            : null;
        if (!assetId) {
          if (!bytes) {
            console.warn(
              `AddClipsToTimeline: skipping clip ${i} — media has no resolvable bytes`
            );
            continue;
          }
          const contentType =
            mediaType === "video"
              ? "video/mp4"
              : mediaType === "audio"
                ? "audio/mpeg"
                : "image/png";
          const created = (await context.createAsset({
            name: `clip-${i + 1}`,
            contentType,
            content: bytes
          })) as { id: string };
          assetId = created.id;
        }

        let durationMs = Number(this.image_duration_ms ?? 3000);
        if (mediaType !== "image") {
          if (!bytes) {
            console.warn(
              `AddClipsToTimeline: skipping clip ${i} — cannot probe duration without media bytes`
            );
            continue;
          }
          const probePath = path.join(workDir, `probe_${i}`);
          await fs.writeFile(probePath, bytes);
          const seconds = await ffprobeDurationSeconds(probePath);
          if (seconds <= 0) {
            console.warn(
              `AddClipsToTimeline: skipping clip ${i} — could not determine duration`
            );
            continue;
          }
          durationMs = Math.round(seconds * 1000);
        }

        const track = ensureTrack(mediaType === "audio" ? "audio" : "video");
        const startMs = cursor[track.id] ?? trackEnd(track.id);
        seq.clips.push(
          makeClip({
            trackId: track.id,
            name: `Clip ${seq.clips.length + 1}`,
            startMs,
            durationMs,
            mediaType,
            sourceType: "imported",
            status: "generated",
            currentAssetId: assetId
          })
        );
        cursor[track.id] = startMs + durationMs;
      }
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }

    seq.durationMs = seq.clips.reduce(
      (end, c) => Math.max(end, c.startMs + c.durationMs),
      0
    );

    const saved = (timelineRef.id
      ? await context.updateTimelineSequence(seq.id, seq)
      : await context.createTimelineSequence(seq)) as { id: string } | null;
    if (!saved) {
      throw new Error("AddClipsToTimeline: failed to save timeline sequence");
    }
    return { output: { type: "timeline", id: saved.id } };
  }
}

export const TIMELINE_NODES = tagAsServer([
  RenderTimelineNode,
  TimelineTranscriptNode,
  AddClipsToTimelineNode
]);
