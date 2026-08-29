/**
 * Reading media into numbers: PCM out of an audio track, RGBA frames out of a
 * video track, and the container's own metadata.
 *
 * Mediabunny does the demuxing and decoding, so none of this needs ffmpeg on
 * the host — which is the point. `nodetool.video.GetVideoInfo` shells out to
 * ffprobe and returns an empty record when the binary is missing; an agent
 * asking "how long is this and where is the energy" should not depend on a
 * managed runtime tool being installed.
 *
 * Every entry point takes a byte budget and a duration cap, because the caller
 * is a model that will happily hand a two-hour master to a tool it thinks is
 * cheap. Truncation is reported, never silent.
 */

import { AudioSampleSink, VideoSampleSink, type Input } from "mediabunny";
import { ensureCodecs, inputFrom } from "./mediabunny-runtime.js";

/** Decoded audio: interleaved float PCM plus how to read it. */
export interface DecodedAudio {
  readonly samples: Float32Array;
  readonly sampleRate: number;
  readonly channels: number;
  /** Seconds actually decoded, which is `trackDuration` unless truncated. */
  readonly duration: number;
  /** The track's full duration, whether or not all of it was decoded. */
  readonly trackDuration: number;
  readonly codec: string;
  readonly truncated: boolean;
}

/** What the container says about itself, before anything is decoded. */
export interface ContainerInfo {
  readonly format: string;
  readonly duration: number;
  readonly sizeBytes: number;
  readonly video: {
    readonly codec: string;
    readonly width: number;
    readonly height: number;
    readonly rotation: number;
    readonly frameRate: number | null;
    readonly languageCode: string | null;
  } | null;
  readonly audio: {
    readonly codec: string;
    readonly channels: number;
    readonly sampleRate: number;
    readonly languageCode: string | null;
  } | null;
}

/** One decoded video frame, in RGBA. */
export interface DecodedFrame {
  readonly time: number;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

/** Frames a single analysis pass will decode, whatever the caller asks for. */
export const MAX_SAMPLED_FRAMES = 1200;

/** Seconds of audio a single analysis pass will decode. */
export const MAX_AUDIO_SECONDS = 3600;

/** Run `body` against an opened input and always dispose it. */
async function withInput<T>(
  bytes: Uint8Array,
  body: (input: Input) => Promise<T>
): Promise<T> {
  await ensureCodecs();
  const input = inputFrom(bytes);
  try {
    return await body(input);
  } finally {
    input.dispose();
  }
}

/** Read the container's tracks and durations without decoding any media. */
export async function probeContainer(
  bytes: Uint8Array
): Promise<ContainerInfo> {
  return withInput(bytes, async (input) => {
    const [format, duration, videoTrack, audioTrack] = await Promise.all([
      input.getFormat(),
      input.computeDuration(),
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack()
    ]);
    const video = videoTrack
      ? await (async () => {
          const [width, height, rotation, codec, stats] = await Promise.all([
            videoTrack.getDisplayWidth(),
            videoTrack.getDisplayHeight(),
            videoTrack.getRotation(),
            videoTrack.getCodec(),
            // The frame rate is not in every container's headers; Mediabunny
            // derives it from the packet timestamps, which costs an index
            // build but is the only honest answer for WebM and fragmented MP4.
            videoTrack.computePacketStats(200).catch(() => null)
          ]);
          return {
            codec: codec ?? "",
            width,
            height,
            rotation,
            frameRate: stats?.averagePacketRate ?? null,
            languageCode: videoTrack.languageCode ?? null
          };
        })()
      : null;
    const audio = audioTrack
      ? await (async () => {
          const [channels, sampleRate, codec] = await Promise.all([
            audioTrack.getNumberOfChannels(),
            audioTrack.getSampleRate(),
            audioTrack.getCodec()
          ]);
          return {
            codec: codec ?? "",
            channels,
            sampleRate,
            languageCode: audioTrack.languageCode ?? null
          };
        })()
      : null;
    return {
      format: format.name,
      duration,
      sizeBytes: bytes.length,
      video,
      audio
    };
  });
}

/**
 * Decode a file's primary audio track to interleaved float PCM.
 *
 * Both a bare audio file and the audio track of a video work — a caller
 * analysing a clip's soundtrack does not have to demux it first. Decoding
 * stops at `maxSeconds` and says so in `truncated`, so a long file answers
 * about its opening rather than exhausting memory.
 */
export async function decodeAudio(
  bytes: Uint8Array,
  maxSeconds = MAX_AUDIO_SECONDS
): Promise<DecodedAudio | null> {
  return withInput(bytes, async (input) => {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const [sampleRate, channels, codec, trackDuration] = await Promise.all([
      track.getSampleRate(),
      track.getNumberOfChannels(),
      track.getCodec(),
      track.computeDuration()
    ]);
    const limit = Math.min(maxSeconds, MAX_AUDIO_SECONDS);
    const chunks: Float32Array[] = [];
    let frames = 0;
    let truncated = false;
    const maxFrames = Math.ceil(limit * sampleRate);
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const wanted = Math.min(sample.numberOfFrames, maxFrames - frames);
        if (wanted <= 0) {
          truncated = true;
          break;
        }
        const buffer = new Float32Array(
          sample.numberOfFrames * sample.numberOfChannels
        );
        sample.copyTo(buffer, { planeIndex: 0, format: "f32" });
        chunks.push(
          wanted === sample.numberOfFrames
            ? buffer
            : buffer.subarray(0, wanted * sample.numberOfChannels)
        );
        frames += wanted;
      } finally {
        sample.close();
      }
      if (frames >= maxFrames) {
        truncated = true;
        break;
      }
    }
    const samples = new Float32Array(
      chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    );
    let offset = 0;
    for (const chunk of chunks) {
      samples.set(chunk, offset);
      offset += chunk.length;
    }
    return {
      samples,
      sampleRate,
      channels,
      duration: sampleRate > 0 ? frames / sampleRate : 0,
      trackDuration,
      codec: codec ?? "",
      truncated
    };
  });
}

/** The timestamps a `sampleFps` walk over `duration` seconds visits. */
export function sampleTimestamps(
  duration: number,
  sampleFps: number,
  maxFrames = MAX_SAMPLED_FRAMES
): number[] {
  if (!(duration > 0) || !(sampleFps > 0)) return [0];
  const wanted = Math.max(1, Math.floor(duration * sampleFps));
  const count = Math.min(wanted, maxFrames);
  const step = duration / count;
  return Array.from({ length: count }, (_unused, index) => index * step);
}

/**
 * Decode the video track at the given timestamps, handing each frame to
 * `onFrame` and closing it immediately after.
 *
 * The frame is *not* retained: at 1080p a single RGBA frame is 8 MB, so
 * holding a few hundred of them to return as an array is the difference
 * between analysing a clip and running the host out of memory. The caller
 * reduces each frame to numbers as it arrives.
 *
 * Returns the number of frames that actually decoded — fewer than the
 * timestamps asked for when the track ends early or a timestamp lands before
 * the first frame.
 */
export async function forEachVideoFrame(
  bytes: Uint8Array,
  timestamps: readonly number[],
  onFrame: (frame: DecodedFrame) => void | Promise<void>
): Promise<number> {
  return withInput(bytes, async (input) => {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return 0;
    let decoded = 0;
    const sink = new VideoSampleSink(track);
    for await (const sample of sink.samplesAtTimestamps(timestamps)) {
      if (!sample) continue;
      try {
        const width = sample.displayWidth;
        const height = sample.displayHeight;
        if (width < 1 || height < 1) continue;
        const rgba = new Uint8Array(width * height * 4);
        await sample.copyTo(rgba, { format: "RGBA" });
        await onFrame({ time: sample.timestamp, width, height, rgba });
        decoded += 1;
      } finally {
        sample.close();
      }
    }
    return decoded;
  });
}
