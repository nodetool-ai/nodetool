/**
 * Normalize clips to one frame size, rate and audio format and write them end
 * to end into one file: the in-process form of encoding a segment per clip
 * with `-vf <filter>` and joining them with the concat demuxer and `-c copy`.
 * Doing it in one pass leaves no segment files and no remux.
 */

import {
  AV_PIX_FMT_RGBA,
  AV_SAMPLE_FMT_FLT,
  avChannelLayoutDefault,
  Encoder,
  FilterAPI,
  Frame,
  Rational,
  type Packet
} from "node-av";

import { AudioEncoder } from "./audio-encoder.js";
import {
  abortError,
  findEncoder,
  openFileMuxer,
  quietLibav,
  rationalFor,
  throwIfAborted
} from "./av.js";
import { openFilterGraph } from "./filter-graph.js";
import type { VideoEncoderSpec } from "./rgba.js";

/** One piece of the output, `durationSec` long. */
export type ConcatSegment =
  | {
      kind: "video";
      filePath: string;
      /** Source seconds to start at (`-ss` before `-i`). */
      inSec?: number;
      /** Source seconds to stop reading at (`-to` before `-i`). */
      outSec?: number;
      durationSec: number;
      /** Use the clip's own sound; otherwise, or when it has none, silence. */
      withAudio: boolean;
    }
  | { kind: "image"; filePath: string; durationSec: number }
  /** Black picture and silence. */
  | { kind: "blank"; durationSec: number };

const AUDIO_RATE = 48000;
const AUDIO_CHANNELS = 2;

export async function concatSegments(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  segments: ConcatSegment[];
  /**
   * A `-vf` chain that fits any picture to `width`x`height`, e.g. scale and
   * pad. A video segment is then resampled to `fps`, and every segment
   * converted to the spec's pixel format.
   */
  videoFilter: string;
  video: VideoEncoderSpec;
  audioCodec: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { signal, fps } = opts;
  throwIfAborted(signal);
  quietLibav();
  const codec = findEncoder(opts.video.codec);
  if (!codec) throw new Error(`This libav build has no ${opts.video.codec} encoder`);
  const rate = rationalFor(fps);
  const frameTimeBase = new Rational(rate.den, rate.num);
  const output = await openFileMuxer(opts.outPath, { signal });
  let videoEncoder: Encoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  try {
    videoEncoder = await Encoder.create(codec, {
      options: opts.video.options,
      context: { framerate: new Rational(rate.num, rate.den) },
      signal
    });
    const videoIndex = output.muxer.addStream(videoEncoder);
    audioEncoder = await AudioEncoder.create(opts.audioCodec, {
      sampleRate: AUDIO_RATE,
      channels: AUDIO_CHANNELS,
      signal
    });
    const audioIndex = output.muxer.addStream(audioEncoder.encoder);
    const activeVideo = videoEncoder;
    const activeAudio = audioEncoder;

    const writeVideoPackets = async (packets: Packet[]): Promise<void> => {
      for (const packet of packets) {
        await output.muxer.writePacket(packet, videoIndex);
        packet.free();
      }
    };
    const writeAudioPackets = async (packets: Packet[]): Promise<void> => {
      for (const packet of packets) {
        await output.muxer.writePacket(packet, audioIndex);
        packet.free();
      }
    };

    let frameIndex = 0;
    let sampleIndex = 0;
    const pixelFilter = `format=${opts.video.pixelFormat}`;

    /** Encode `frame` as the next output frame. */
    const putFrame = async (frame: Frame): Promise<void> => {
      frame.pts = BigInt(frameIndex);
      frame.timeBase = frameTimeBase;
      frameIndex += 1;
      await writeVideoPackets(await activeVideo.encodeAll(frame));
    };

    /** Encode silence until the audio reaches the video. */
    const padAudio = async (): Promise<void> => {
      const target = Math.round((frameIndex * AUDIO_RATE * rate.den) / rate.num);
      while (sampleIndex < target) {
        const count = Math.min(4096, target - sampleIndex);
        const silence = Frame.fromAudioBuffer(Buffer.alloc(count * AUDIO_CHANNELS * 4), {
          nbSamples: count,
          format: AV_SAMPLE_FMT_FLT,
          sampleRate: AUDIO_RATE,
          channelLayout: avChannelLayoutDefault(AUDIO_CHANNELS),
          timeBase: { num: 1, den: AUDIO_RATE },
          pts: BigInt(sampleIndex)
        });
        try {
          sampleIndex += count;
          await writeAudioPackets(await activeAudio.encode(silence));
        } finally {
          silence.free();
        }
      }
    };

    /** A blank frame at the output size, through the same pixel conversion. */
    const blankFrame = (): Frame =>
      Frame.fromVideoBuffer(Buffer.alloc(opts.width * opts.height * 4), {
        width: opts.width,
        height: opts.height,
        format: AV_PIX_FMT_RGBA,
        timeBase: frameTimeBase
      });

    for (const segment of opts.segments) {
      if (signal?.aborted) throw abortError(signal);
      const frameCount = Math.ceil(segment.durationSec * fps - 1e-9);
      const segmentStart = frameIndex;
      if (segment.kind === "video") {
        const inSec = segment.inSec && segment.inSec > 0 ? segment.inSec : 0;
        const trims = [
          inSec > 0 ? "trim=start=0" : null,
          segment.outSec !== undefined && segment.outSec > inSec
            ? `trim=end=${segment.outSec - inSec}`
            : null
        ].filter((step): step is string => step !== null);
        const run = await openFilterGraph({
          filePath: segment.filePath,
          kind: "video",
          filter: [...trims, opts.videoFilter, `fps=${fps}`, pixelFilter].join(","),
          seekSec: inSec,
          signal
        });
        if (!run) throw new Error(`${segment.filePath} has no video stream`);
        try {
          for await (const frame of run.frames()) {
            try {
              if (frameIndex - segmentStart >= frameCount) break;
              await putFrame(frame);
            } finally {
              frame.free();
            }
          }
        } finally {
          await run.close();
        }
        // The segment's sound: the clip's own, trimmed alike and no longer
        // than the picture it got, else silence.
        const pictureSec = (frameIndex - segmentStart) / fps;
        const audio = segment.withAudio && pictureSec > 0
          ? await openFilterGraph({
              filePath: segment.filePath,
              kind: "audio",
              filter: [
                inSec > 0 ? "atrim=start=0" : null,
                segment.outSec !== undefined && segment.outSec > inSec
                  ? `atrim=end=${segment.outSec - inSec}`
                  : null,
                `atrim=end=${pictureSec}`,
                `aresample=${AUDIO_RATE}`,
                `aformat=sample_fmts=flt:channel_layouts=stereo`
              ]
                .filter((step): step is string => step !== null)
                .join(","),
              seekSec: inSec,
              signal
            })
          : null;
        if (audio) {
          try {
            for await (const frame of audio.frames()) {
              try {
                frame.pts = BigInt(sampleIndex);
                frame.timeBase = new Rational(1, AUDIO_RATE);
                sampleIndex += frame.nbSamples;
                await writeAudioPackets(await activeAudio.encode(frame));
              } finally {
                frame.free();
              }
            }
          } finally {
            await audio.close();
          }
        }
        await padAudio();
      } else if (segment.kind === "image") {
        const still = await openFilterGraph({
          filePath: segment.filePath,
          kind: "video",
          filter: [opts.videoFilter, pixelFilter].join(","),
          signal
        });
        if (!still) throw new Error(`${segment.filePath} has no picture`);
        let picture: Frame | null = null;
        try {
          for await (const frame of still.frames()) {
            picture = frame;
            break;
          }
        } finally {
          await still.close();
        }
        if (!picture) throw new Error(`${segment.filePath} decoded to no picture`);
        try {
          for (let i = 0; i < frameCount; i++) {
            const copy = picture.clone();
            if (!copy) throw new Error("Out of memory copying a still");
            try {
              await putFrame(copy);
            } finally {
              copy.free();
            }
          }
        } finally {
          picture.free();
        }
        await padAudio();
      } else {
        const convert = FilterAPI.create(pixelFilter, { signal });
        try {
          for (let i = 0; i < frameCount; i++) {
            const blank = blankFrame();
            try {
              for (const converted of await convert.processAll(blank)) {
                try {
                  await putFrame(converted);
                } finally {
                  converted.free();
                }
              }
            } finally {
              blank.free();
            }
          }
        } finally {
          convert.close();
        }
        await padAudio();
      }
    }
    if (frameIndex === 0) throw new Error("No segment produced a frame");
    await writeVideoPackets(await activeVideo.encodeAll(null));
    await writeAudioPackets(await activeAudio.flush());
    await output.close();
  } finally {
    videoEncoder?.close();
    audioEncoder?.close();
    await output.close();
  }
}
