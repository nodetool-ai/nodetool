/**
 * Encode filtered audio onto an existing video without re-encoding the
 * picture: the in-process form of `ffmpeg -i base ... -map 0:v -map [aout]
 * -c:v copy -c:a <codec> -shortest out`.
 */

import { avGetCodecName, Demuxer, type Frame, type Packet } from "node-av";

import { AudioEncoder } from "./audio-encoder.js";
import {
  abortError,
  openFileMuxer,
  quietLibav,
  startTimeSeconds,
  throwIfAborted,
  type FileMuxer
} from "./av.js";
import { transformMedia } from "./transform.js";

function seconds(ts: bigint, timeBase: { num: number; den: number }): number {
  return (Number(ts) * timeBase.num) / timeBase.den;
}

/** The end of the video stream in seconds: last packet's pts plus its duration. */
async function videoEndSec(filePath: string, signal?: AbortSignal): Promise<number> {
  const demuxer = await Demuxer.open(filePath, { signal });
  try {
    const stream = demuxer.video();
    if (!stream) throw new Error(`${filePath} has no video stream`);
    const formatStart = startTimeSeconds(demuxer.getFormatContext().startTime, {
      num: 1,
      den: 1_000_000
    });
    let end = 0;
    for await (const packet of demuxer.packets(stream.index)) {
      if (!packet) continue;
      throwIfAborted(signal);
      end = Math.max(
        end,
        seconds(packet.pts + packet.duration, stream.timeBase) - formatStart
      );
      packet.free();
    }
    return end;
  } finally {
    await demuxer.close();
  }
}

/**
 * Copy `videoPath`'s video stream into `outPath` and encode `audio` beside it
 * as `codec` at `sampleRate`, stereo. The audio is cut at the end of the
 * picture, as `-shortest` cut it, so a padded mix never outlasts the video.
 * `audio`'s frames are consumed and freed.
 */
export async function muxAudioWithVideoCopy(opts: {
  videoPath: string;
  audio: AsyncIterable<Frame>;
  outPath: string;
  codec: string;
  sampleRate: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal } = opts;
  quietLibav();
  throwIfAborted(signal);
  const endSec = await videoEndSec(opts.videoPath, signal);

  const demuxer = await Demuxer.open(opts.videoPath, { signal });
  let output: FileMuxer | null = null;
  let audioEncoder: AudioEncoder | null = null;
  try {
    const videoStream = demuxer.video();
    if (!videoStream) throw new Error(`${opts.videoPath} has no video stream`);
    output = await openFileMuxer(opts.outPath, { signal });
    const videoIndex = output.muxer.addStream(videoStream);
    // The CLI converted at the output: `-ar` and `-ac 2` after the graph.
    audioEncoder = await AudioEncoder.create(opts.codec, {
      sampleRate: opts.sampleRate,
      channels: 2,
      signal
    });
    const audioIndex = output.muxer.addStream(audioEncoder.encoder);
    const activeEncoder = audioEncoder;
    const activeOutput = output;
    const formatStart = startTimeSeconds(demuxer.getFormatContext().startTime, {
      num: 1,
      den: 1_000_000
    });

    const videoPackets = demuxer.packets(videoStream.index);
    let pendingVideo: Packet | null = null;
    let videoDone = false;
    const nextVideo = async (): Promise<void> => {
      while (!pendingVideo && !videoDone) {
        const { value, done } = await videoPackets.next();
        if (done) videoDone = true;
        else if (value) pendingVideo = value;
      }
    };
    const pendingVideoSec = (): number =>
      pendingVideo
        ? seconds(pendingVideo.dts ?? pendingVideo.pts, videoStream.timeBase) - formatStart
        : Number.POSITIVE_INFINITY;
    /** Write every video packet that sorts before `untilSec`. */
    const drainVideo = async (untilSec: number): Promise<void> => {
      await nextVideo();
      while (pendingVideo && pendingVideoSec() <= untilSec) {
        const packet: Packet = pendingVideo;
        pendingVideo = null;
        await activeOutput.muxer.writePacket(packet, videoIndex);
        packet.free();
        await nextVideo();
      }
    };

    const writePackets = async (packets: Packet[]): Promise<void> => {
      for (const packet of packets) {
        await drainVideo(seconds(packet.pts, packet.timeBase));
        await activeOutput.muxer.writePacket(packet, audioIndex);
        packet.free();
      }
    };

    for await (const mixed of opts.audio) {
      try {
        if (signal?.aborted) throw abortError(signal);
        const startSec = seconds(mixed.pts, mixed.timeBase);
        if (startSec >= endSec) break;
        const samples = mixed.nbSamples;
        const keep = Math.min(samples, Math.ceil((endSec - startSec) * mixed.sampleRate));
        if (keep < samples) {
          // The frame crosses the end of the picture: keep only what lies before it.
          mixed.nbSamples = keep;
        }
        await writePackets(await activeEncoder.encode(mixed));
        if (keep < samples) break;
      } finally {
        mixed.free();
      }
    }
    await writePackets(await activeEncoder.flush());
    await drainVideo(Number.POSITIVE_INFINITY);
    await output.close();
  } finally {
    audioEncoder?.close();
    await output?.close();
    await demuxer.close();
  }
}

/** The video and audio codec of a file, in libav's names; `null` for none. */
export async function streamCodecs(
  filePath: string,
  signal?: AbortSignal
): Promise<{ video: string | null; audio: string | null }> {
  quietLibav();
  const demuxer = await Demuxer.open(filePath, { signal });
  try {
    const name = (stream: ReturnType<Demuxer["video"]>): string | null =>
      stream ? (avGetCodecName(stream.codecpar.codecId) ?? "unknown") : null;
    return { video: name(demuxer.video()), audio: name(demuxer.audio()) };
  } finally {
    await demuxer.close();
  }
}

/** A container `muxStreamCopy` writes. */
export type CopyContainer = "mp4" | "mov" | "webm" | "mkv";

/** The codecs each container takes without re-encoding; `null` takes any. */
const COPY_CODECS: Record<CopyContainer, { video: Set<string>; audio: Set<string> } | null> = {
  mp4: {
    video: new Set(["h264", "hevc", "av1", "vp9", "mpeg4"]),
    audio: new Set(["aac", "mp3", "opus", "flac", "alac", "ac3", "eac3"])
  },
  mov: {
    video: new Set(["h264", "hevc", "av1", "vp9", "mpeg4", "prores"]),
    audio: new Set(["aac", "mp3", "opus", "flac", "alac", "ac3", "eac3", "pcm_s16le"])
  },
  webm: {
    video: new Set(["vp8", "vp9", "av1"]),
    audio: new Set(["opus", "vorbis"])
  },
  mkv: null
};

function isCopyContainer(name: string): name is CopyContainer {
  return Object.hasOwn(COPY_CODECS, name);
}

/** Whether `container` holds `video` and `audio` (either may be absent) as they are. */
function holds(container: CopyContainer, video: string | null, audio: string | null): boolean {
  const codecs = COPY_CODECS[container];
  if (!codecs) return true;
  return (!video || codecs.video.has(video)) && (!audio || codecs.audio.has(audio));
}

/**
 * The container a stream copy of `video` and `audio` goes into, as yt-dlp
 * picked one when it merged: WebM when both are WebM codecs, else MP4 when
 * MP4 holds both, else Matroska, which holds anything.
 */
export function copyContainerFor(video: string | null, audio: string | null): CopyContainer {
  if (holds("webm", video, audio)) return "webm";
  if (holds("mp4", video, audio)) return "mp4";
  return "mkv";
}

/**
 * Copy the video stream of `videoPath` and the audio stream of `audioPath`
 * into one file, packets unchanged: the in-process form of
 * `ffmpeg -i v -i a -map 0:v -map 1:a -c copy out`, which is what yt-dlp ran
 * to merge formats.
 *
 * `container` is `auto` (see {@link copyContainerFor}) or a
 * {@link CopyContainer}; the output is `<outStem>.<container>`. A container
 * that cannot hold the codecs without re-encoding throws an error naming
 * both codecs and the container, before any file is written. When the two
 * paths are the same file, its audio stream is optional.
 */
export async function muxStreamCopy(opts: {
  videoPath: string;
  audioPath: string;
  outStem: string;
  container: string;
  signal?: AbortSignal;
}): Promise<{ outPath: string; container: CopyContainer; video: string; audio: string | null }> {
  const { signal } = opts;
  const sameFile = opts.videoPath === opts.audioPath;
  const video = (await streamCodecs(opts.videoPath, signal)).video;
  if (!video) throw new Error(`${opts.videoPath} has no video stream`);
  const audio = (await streamCodecs(opts.audioPath, signal)).audio;
  if (!audio && !sameFile) throw new Error(`${opts.audioPath} has no audio stream`);
  const requested = opts.container.trim().toLowerCase().replace(/^\./, "");
  const container =
    requested === "" || requested === "auto" ? copyContainerFor(video, audio) : requested;
  if (!isCopyContainer(container)) {
    throw new Error(
      `Cannot write container "${opts.container}": use auto, mp4, mov, webm or mkv`
    );
  }
  const pair = audio ? `${video} video with ${audio} audio` : `${video} video`;
  if (!holds(container, video, audio)) {
    throw new Error(
      `Cannot stream-copy ${pair} into ${container} without re-encoding. ` +
        `Use container auto or mkv.`
    );
  }
  const outPath = `${opts.outStem}.${container}`;
  try {
    await transformMedia({
      inputs: [{ filePath: opts.videoPath }, { filePath: opts.audioPath }],
      outPath,
      video: { copy: 0 },
      audio: { copy: 1, optional: sameFile },
      signal
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error(
      `Could not stream-copy ${pair} into ${container}: ` +
        `${error instanceof Error ? error.message : String(error)}`
    );
  }
  return { outPath, container, video, audio };
}
