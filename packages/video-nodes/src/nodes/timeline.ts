/**
 * Timeline nodes — operate on persisted timeline sequences (the video
 * editor's documents) referenced by the `timeline` type.
 *
 * RenderTimeline composites the sequence frame by frame through the same GPU
 * compositor and scene model the editor's preview and its in-browser export
 * use (`@nodetool-ai/timeline/render`), so a workflow render is the picture
 * the user previewed: clip placement, transforms, opacity, blend modes,
 * transitions, animations, effects, captions, text and shapes, across every
 * visual track. ffmpeg decodes clip media into RGBA and encodes the result.
 *
 * Compositing needs a WebGPU device, which means the optional `webgpu` (Dawn)
 * package and a working driver. Both profiles ship Dawn (D9,
 * docs/plans/motion-graphics.md), and the Docker image installs lavapipe as its
 * Vulkan driver, so a server render is composited too. A host that still has no
 * adapter falls back to the older ffmpeg rough cut — video/image clips
 * normalized and concatenated in start order — which ignores everything above.
 * The fallback is a `warning` on the job and `metadata.render_mode` on the
 * output says which path ran: "composited" or "rough_cut".
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { TimelineRef, VideoRef } from "@nodetool-ai/protocol";
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
import { tagAsNode } from "@nodetool-ai/nodes-utils";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  execFfmpeg,
  execFfprobe,
  ffprobeDuration,
  FFMPEG_MAX_BUFFER,
  MissingBinaryError,
  videoRef
} from "./ffmpeg-helpers.js";
import {
  CompositorUnavailableError,
  renderTimelineComposited
} from "./timeline/compositeRender.js";
import {
  isNonEmptyString,
  isNumber,
  isPositiveNumber,
  isString
} from "../type-predicates.js";

interface TimelineRefLike {
  type?: string;
  id?: string | null;
  data?: unknown;
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

async function ffprobeHasAudio(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFfprobe([
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
  } catch (error) {
    if (error instanceof MissingBinaryError) throw error;
    return false;
  }
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

/**
 * linkIds of audio-track clips that are the detached audio representation of a
 * video clip. The mere presence of such a clip means the linked video's own
 * muxed audio must be suppressed (the editor mutes the video element; audio
 * comes only from audio-track clips). This is intentionally NOT gated on
 * mute/hidden — those govern whether the audio clip is mixed in, not whether
 * the video's embedded audio resurfaces. If the user deletes the audio clip,
 * the store auto-unlinks the lone survivor, clearing the video's linkId, so the
 * video's audio returns on its own.
 */
export function extractedAudioLinkIds(seq: TimelineSequence): Set<string> {
  const tracks = trackById(seq.tracks);
  const ids = new Set<string>();
  for (const clip of seq.clips) {
    const track = tracks.get(clip.trackId);
    if (
      track?.type === "audio" &&
      clip.mediaType === "audio" &&
      isNonEmptyString(clip.linkId)
    ) {
      ids.add(clip.linkId);
    }
  }
  return ids;
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
  /**
   * Drop the clip's own muxed audio in favor of silence, because a linked
   * audio-track clip supplies this video's audio in the final mix. Mapping
   * both would double the audio.
   */
  suppressEmbeddedAudio?: boolean;
}): Promise<void> {
  const { clip, srcPath, segPath, width, height, fps, suppressEmbeddedAudio } =
    opts;
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
    await execFfmpeg(
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

  const hasAudio = suppressEmbeddedAudio
    ? false
    : await ffprobeHasAudio(srcPath);
  const seek: string[] = [];
  if (isPositiveNumber(clip.inPointMs)) {
    seek.push("-ss", String(clip.inPointMs / 1000));
  }
  if (isPositiveNumber(clip.outPointMs)) {
    seek.push("-to", String(clip.outPointMs / 1000));
  }
  await execFfmpeg(
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

/**
 * Clips whose embedded audio the composited path must mix in itself: the
 * rough cut carried a video clip's audio through its segment, but a
 * frame-by-frame composite has no audio at all. Muted clips/tracks and clips
 * whose audio was extracted onto an audio track (see
 * {@link extractedAudioLinkIds}) are left out.
 */
function embeddedAudioClips(seq: TimelineSequence): TimelineClip[] {
  const tracks = trackById(seq.tracks);
  const suppressed = extractedAudioLinkIds(seq);
  return seq.clips
    .filter((clip) => {
      const track = tracks.get(clip.trackId);
      return (
        (track?.type === "video" || track?.type === "overlay") &&
        track.muted !== true &&
        !clip.muted &&
        clip.mediaType === "video" &&
        !!clip.currentAssetId &&
        clip.durationMs > 0 &&
        !(isString(clip.linkId) && suppressed.has(clip.linkId))
      );
    })
    .sort((a, b) => a.startMs - b.startMs);
}

/** Per-clip audio chain: trim to in/out, apply gain, delay to timeline start. */
function audioClipFilter(
  clip: TimelineClip,
  inputIndex: number,
  label: string
): string {
  const steps: string[] = [];
  const inS = isNumber(clip.inPointMs) ? clip.inPointMs / 1000 : 0;
  const outS =
    isPositiveNumber(clip.outPointMs)
      ? clip.outPointMs / 1000
      : inS + clip.durationMs / 1000;
  steps.push(`atrim=start=${inS}:end=${outS}`, "asetpts=PTS-STARTPTS");
  if (isNumber(clip.volumeDb) && clip.volumeDb !== 0) {
    steps.push(`volume=${clip.volumeDb}dB`);
  }
  const delay = Math.max(0, Math.round(clip.startMs));
  steps.push(`adelay=${delay}|${delay}`);
  return `[${inputIndex}:a]${steps.join(",")}[${label}]`;
}

/** Anything that draws: media, titles, shapes, or a caption riding a clip. */
function hasRenderableVisual(seq: TimelineSequence): boolean {
  const tracks = trackById(seq.tracks);
  return seq.clips.some((clip) => {
    const track = tracks.get(clip.trackId);
    if (!track || track.visible === false || clip.hidden) return false;
    if (clip.caption) return true;
    if (track.type !== "video" && track.type !== "overlay") return false;
    if (clip.mediaType === "text") return !!clip.textStyle;
    if (clip.mediaType === "shape") return !!clip.shapeStyle;
    return (
      (clip.mediaType === "video" || clip.mediaType === "image") &&
      !!clip.currentAssetId
    );
  });
}

/** The sequence's own length, or the end of its last clip when it has none. */
function totalDurationMs(seq: TimelineSequence): number {
  if (seq.durationMs > 0) return seq.durationMs;
  return seq.clips.reduce(
    (end, clip) => Math.max(end, clip.startMs + clip.durationMs),
    0
  );
}

/** Materializes clip assets on disk once each, for ffmpeg to read. */
class AssetFiles {
  private readonly files = new Map<string, Promise<string | null>>();

  constructor(
    private readonly workDir: string,
    private readonly context: ProcessingContext
  ) {}

  path(assetId: string): Promise<string | null> {
    let pending = this.files.get(assetId);
    if (!pending) {
      pending = this.write(assetId);
      this.files.set(assetId, pending);
    }
    return pending;
  }

  private async write(assetId: string): Promise<string | null> {
    const { bytes } = await this.context.resolveAssetBytes(assetId);
    if (!bytes) return null;
    const file = path.join(this.workDir, `asset_${assetId}`);
    await fs.writeFile(file, bytes);
    return file;
  }
}

/**
 * The pre-compositor rough cut, kept as the fallback for hosts without a GPU:
 * each video/image clip is normalized to the sequence frame and the segments
 * are concatenated in start order. Gaps, overlaps, transforms and every other
 * layer property are lost — it is a cut, not a render.
 */
async function renderRoughCut(opts: {
  seq: TimelineSequence;
  clips: TimelineClip[];
  audioClips: TimelineClip[];
  assets: AssetFiles;
  workDir: string;
  width: number;
  height: number;
  fps: number;
}): Promise<string> {
  const { seq, clips, audioClips, assets, workDir, width, height, fps } = opts;
  const suppressedLinkIds = extractedAudioLinkIds(seq);

  const segments: string[] = [];
  for (const [i, clip] of clips.entries()) {
    const srcPath = clip.currentAssetId
      ? await assets.path(clip.currentAssetId)
      : null;
    if (!srcPath) {
      console.warn(
        `RenderTimeline: skipping clip "${clip.name}" — asset ${clip.currentAssetId} not found`
      );
      continue;
    }
    const segPath = path.join(workDir, `seg_${i}.mp4`);
    await encodeSegment({
      clip,
      srcPath,
      segPath,
      width,
      height,
      fps,
      suppressEmbeddedAudio:
        isString(clip.linkId) && suppressedLinkIds.has(clip.linkId)
    });
    segments.push(segPath);
  }

  const basePath = path.join(workDir, "base.mp4");
  if (segments.length > 0) {
    const listPath = path.join(workDir, "segments.txt");
    await fs.writeFile(listPath, segments.map((p) => `file '${p}'`).join("\n"));
    await execFfmpeg(
      ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", basePath],
      { maxBuffer: FFMPEG_MAX_BUFFER }
    );
    return basePath;
  }

  // Audio-only cut: synthesize a black picture to carry the mix.
  //
  // `Math.max()` with no arguments is -Infinity, and spreading an empty array
  // is exactly that call. A timeline holding neither video nor audio reached
  // ffmpeg as `-t -Infinity` and died on "Invalid duration for option t",
  // naming neither the timeline nor the absent clips. `totalDurationMs` above
  // seeds a `reduce` for the same computation and is unaffected — one file,
  // two idioms, one of them wrong. Nothing renders from an empty timeline, so
  // say so here rather than build a command that cannot parse.
  if (audioClips.length === 0) {
    throw new Error(
      "Timeline has no clips to render. Add at least one video, image or " +
        "audio clip before rendering."
    );
  }
  const totalS =
    audioClips.reduce((end, c) => Math.max(end, c.startMs + c.durationMs), 0) /
    1000;
  await execFfmpeg(
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
  return basePath;
}

/**
 * Mix `clips` into `basePath` at their timeline offsets. `baseHasAudio` says
 * whether the base video carries a soundtrack of its own to keep (the rough
 * cut does; a composited render does not).
 */
async function mixAudioInto(opts: {
  basePath: string;
  clips: TimelineClip[];
  baseHasAudio: boolean;
  assets: AssetFiles;
  workDir: string;
}): Promise<string> {
  const { basePath, clips, baseHasAudio, assets, workDir } = opts;
  const inputs: string[] = ["-i", basePath];
  const filters: string[] = [];
  const labels: string[] = [];
  let inputIndex = 1;

  for (const [i, clip] of clips.entries()) {
    const audioPath = clip.currentAssetId
      ? await assets.path(clip.currentAssetId)
      : null;
    if (!audioPath) {
      console.warn(
        `RenderTimeline: skipping audio of clip "${clip.name}" — asset ${clip.currentAssetId} not found`
      );
      continue;
    }
    if (!baseHasAudio && !(await ffprobeHasAudio(audioPath))) continue;
    inputs.push("-i", audioPath);
    const label = `a${i}`;
    filters.push(audioClipFilter(clip, inputIndex, label));
    labels.push(`[${label}]`);
    inputIndex += 1;
  }
  if (labels.length === 0) return basePath;

  const sources = baseHasAudio ? [`[0:a]`, ...labels] : labels;
  const mix =
    sources.length === 1
      ? `${sources[0]}apad[aout]`
      : `${sources.join("")}amix=inputs=${sources.length}:duration=longest:normalize=0,apad[aout]`;
  const outPath = path.join(workDir, "mixed.mp4");
  await execFfmpeg(
    [
      "-y",
      ...inputs,
      "-filter_complex",
      [...filters, mix].join(";"),
      "-map",
      "0:v",
      "-map",
      "[aout]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      // `apad` runs the mix past the picture; stop at the shorter stream so the
      // render is exactly as long as the video.
      "-shortest",
      outPath
    ],
    { maxBuffer: FFMPEG_MAX_BUFFER }
  );
  return outPath;
}

/** Shortest gap between two `node_progress` posts — four a second. */
const PROGRESS_INTERVAL_MS = 250;

/** Output handles RenderTimelineNode.process() emits. */
type RenderTimelineNodeOutputs = {
  output: VideoRef;
};

export class RenderTimelineNode extends BaseNode {
  static readonly nodeType = "nodetool.timeline.RenderTimeline";
  static readonly title = "Render Timeline";
  static readonly description =
    "Render a timeline sequence to a video, composited exactly as the timeline editor previews it (tracks, transforms, transitions, effects, captions and text), with audio mixed in at each clip's offset.\n    timeline, render, video, export, cut\n\n    Use cases:\n    - Turn an edit assembled in the timeline editor into a shareable video\n    - Feed a rough cut into captioning, review, or upload nodes\n    - Automate exports of timelines built by other workflow nodes";
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
  declare timeline: TimelineRef;

  @prop({
    type: "bool",
    default: true,
    title: "Include audio",
    description: "Mix audio-track clips into the rendered video."
  })
  declare include_audio: boolean;

  async process(
    context?: ProcessingContext
  ): Promise<RenderTimelineNodeOutputs> {
    const seq = await loadTimelineSequence(this.timeline, context);
    const ctx = context as ProcessingContext;
    const width = seq.width > 0 ? seq.width : 1920;
    const height = seq.height > 0 ? seq.height : 1080;
    const fps = seq.fps > 0 ? seq.fps : 30;

    const includeAudio = this.include_audio !== false;
    const audioClips = includeAudio ? mixableAudioClips(seq) : [];
    if (!hasRenderableVisual(seq) && audioClips.length === 0) {
      throw new Error(
        `Timeline "${seq.name}" has no renderable clips with media — generate or import clip media first`
      );
    }
    const durationMs = totalDurationMs(seq);
    if (durationMs <= 0) {
      throw new Error(`Timeline "${seq.name}" has zero duration`);
    }

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-timeline-")
    );
    try {
      const assets = new AssetFiles(workDir, ctx);
      let basePath: string;
      let baseHasAudio: boolean;
      let audioToMix: TimelineClip[];
      let renderMode: "composited" | "rough_cut";

      try {
        basePath = path.join(workDir, "composited.mp4");
        const { skippedClips } = await renderTimelineComposited({
          sequence: seq,
          width,
          height,
          fps,
          durationMs,
          resolveAssetPath: (assetId) => assets.path(assetId),
          outPath: basePath,
          onProgress: this.progressReporter(ctx),
          signal: ctx.signal
        });
        for (const name of skippedClips) {
          this.log(
            ctx,
            `Clip "${name}" was skipped — its media could not be decoded`,
            "warning"
          );
        }
        renderMode = "composited";
        // A composite carries no sound: every audible clip is mixed in below,
        // including the audio muxed into video clips.
        baseHasAudio = false;
        audioToMix = includeAudio
          ? [...embeddedAudioClips(seq), ...audioClips]
          : [];
      } catch (error) {
        if (!(error instanceof CompositorUnavailableError)) throw error;
        this.log(
          ctx,
          `${error.message} Falling back to a rough cut — clip transforms, ` +
            "effects, transitions, captions and overlay tracks are not applied.",
          "warning"
        );
        basePath = await renderRoughCut({
          seq,
          clips: renderableVideoClips(seq),
          audioClips,
          assets,
          workDir,
          width,
          height,
          fps
        });
        renderMode = "rough_cut";
        baseHasAudio = true;
        audioToMix = audioClips;
      }

      const outPath =
        audioToMix.length > 0
          ? await mixAudioInto({
              basePath,
              clips: audioToMix,
              baseHasAudio,
              assets,
              workDir
            })
          : basePath;

      const rendered = new Uint8Array(await fs.readFile(outPath));
      const duration = await ffprobeDuration(outPath);
      return {
        output: videoRef(rendered, {
          format: "mp4",
          duration: duration > 0 ? duration : null,
          // Which of the two paths produced these bytes. The docker smoke test
          // asserts "composited": it is what proves the image renders the
          // picture the editor previews rather than a concatenation.
          metadata: { render_mode: renderMode }
        })
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }

  /** Post on the node's log channel, where the run has one. */
  private log(
    context: ProcessingContext,
    content: string,
    severity: "info" | "warning" | "error"
  ): void {
    if (!this.__node_id) return;
    context.postMessage({
      type: "log_update",
      node_id: this.__node_id,
      node_name: RenderTimelineNode.title,
      content,
      severity,
      workflow_id: context.workflowId
    });
  }

  /**
   * A `node_progress` reporter for the frame loop, rate-limited to four posts a
   * second. A minute of 1080p is thousands of frames and every post crosses the
   * websocket; the final frame always posts, so the bar reaches its end.
   */
  private progressReporter(
    context: ProcessingContext
  ): (frame: number, totalFrames: number) => void {
    const nodeId = this.__node_id;
    let lastPostMs = 0;
    return (frame, totalFrames) => {
      if (!nodeId) return;
      const now = Date.now();
      if (frame < totalFrames && now - lastPostMs < PROGRESS_INTERVAL_MS) {
        return;
      }
      lastPostMs = now;
      context.postMessage({
        type: "node_progress",
        node_id: nodeId,
        progress: frame,
        total: totalFrames,
        workflow_id: context.workflowId
      });
    };
  }
}

/** Output handles TimelineTranscriptNode.process() emits. */
type TimelineTranscriptNodeOutputs = {
  text: string;
  lines: string[];
};

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
  declare timeline: TimelineRef;

  async process(
    context?: ProcessingContext
  ): Promise<TimelineTranscriptNodeOutputs> {
    const seq = await loadTimelineSequence(this.timeline, context);
    const lines = (seq.transcript ?? []).map((line) => line.text);
    return { text: lines.join("\n"), lines };
  }
}

/** Content types AddClips falls back to when the bytes say nothing. */
const CLIP_CONTENT_TYPE_FALLBACK: Record<string, string> = {
  image: "image/png",
  audio: "audio/wav",
  video: "video/mp4"
};

const CLIP_CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  flac: "audio/x-flac",
  m4a: "audio/x-m4a",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime"
};

const startsWithBytes = (bytes: Uint8Array, ascii: string, at = 0): boolean => {
  if (bytes.length < at + ascii.length) return false;
  for (let i = 0; i < ascii.length; i++) {
    if (bytes[at + i] !== ascii.charCodeAt(i)) return false;
  }
  return true;
};

/** The content type the bytes themselves declare, or null when unrecognized. */
function sniffContentType(
  mediaType: string,
  bytes: Uint8Array
): string | null {
  if (startsWithBytes(bytes, "RIFF") && startsWithBytes(bytes, "WAVE", 8)) {
    return "audio/wav";
  }
  if (startsWithBytes(bytes, "RIFF") && startsWithBytes(bytes, "WEBP", 8)) {
    return "image/webp";
  }
  if (startsWithBytes(bytes, "ID3")) return "audio/mpeg";
  // MPEG audio frame sync: 11 set bits. Two bytes is weak evidence, so trust
  // it only where the clip is already known to be audio.
  if (
    mediaType === "audio" &&
    bytes.length >= 2 &&
    bytes[0] === 0xff &&
    (bytes[1]! & 0xe0) === 0xe0
  ) {
    return "audio/mpeg";
  }
  if (startsWithBytes(bytes, "OggS")) return "audio/ogg";
  if (startsWithBytes(bytes, "fLaC")) return "audio/x-flac";
  if (startsWithBytes(bytes, "\x89PNG")) return "image/png";
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  if (startsWithBytes(bytes, "GIF8")) return "image/gif";
  // Matroska/WebM EBML header.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "video/webm";
  }
  if (startsWithBytes(bytes, "ftyp", 4)) {
    if (startsWithBytes(bytes, "qt", 8)) return "video/quicktime";
    if (startsWithBytes(bytes, "M4A", 8)) return "audio/x-m4a";
    return "video/mp4";
  }
  return null;
}

/**
 * The content type to store a clip's bytes under.
 *
 * The stored asset's file extension and the `Content-Type` the browser is
 * served both come from this, so guessing by media kind alone mislabels
 * anything that is not the kind's default container: a WAV voiceover saved as
 * `audio/mpeg` reaches the player as a `.mp3` it cannot decode. Read the bytes
 * first, then the source URI's extension, and only then fall back to the kind.
 */
export function clipContentType(
  mediaType: string,
  bytes: Uint8Array,
  uri: string | undefined
): string {
  const sniffed = sniffContentType(mediaType, bytes);
  if (sniffed) return sniffed;
  const extension = (uri ?? "").toLowerCase().split(/[?#]/)[0]!.split(".").pop();
  const byExtension = extension
    ? CLIP_CONTENT_TYPE_BY_EXTENSION[extension]
    : undefined;
  if (byExtension) return byExtension;
  return CLIP_CONTENT_TYPE_FALLBACK[mediaType] ?? "application/octet-stream";
}

/** Output handles AddClipsToTimelineNode.process() emits. */
type AddClipsToTimelineNodeOutputs = {
  output: { type: string; id: string };
};

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
  declare timeline: TimelineRef;

  @prop({
    type: "list",
    default: [],
    title: "Clips",
    description: "Media to append: image, video, and audio references."
  })
  declare clips: unknown[];

  @prop({
    type: "str",
    default: "Untitled video",
    title: "Name",
    description: "Name for the timeline when a new one is created."
  })
  declare name: string;

  @prop({
    type: "int",
    default: 3000,
    title: "Image duration (ms)",
    description: "Clip duration for still images, in milliseconds.",
    min: 100,
    max: 600000
  })
  declare image_duration_ms: number;

  async process(
    context?: ProcessingContext
  ): Promise<AddClipsToTimelineNodeOutputs> {
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
          isNonEmptyString(item.asset_id)
            ? item.asset_id
            : null;
        if (!assetId) {
          if (!bytes) {
            console.warn(
              `AddClipsToTimeline: skipping clip ${i} — media has no resolvable bytes`
            );
            continue;
          }
          const contentType = clipContentType(
            mediaType,
            bytes,
            isString(item.uri) ? item.uri : undefined
          );
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
          const seconds = await ffprobeDuration(probePath);
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

export const TIMELINE_NODES = tagAsNode([
  RenderTimelineNode,
  TimelineTranscriptNode,
  AddClipsToTimelineNode
]);
