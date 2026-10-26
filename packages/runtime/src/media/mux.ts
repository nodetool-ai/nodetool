/**
 * Encode filtered audio onto an existing video without re-encoding the
 * picture: the in-process form of `ffmpeg -i base ... -map 0:v -map [aout]
 * -c:v copy -c:a <codec> -shortest out`.
 */

import {
  avGetSampleFmtName,
  Demuxer,
  Encoder,
  FilterAPI,
  type Frame,
  type Packet
} from "node-av";

import {
  abortError,
  findEncoder,
  openFileMuxer,
  quietLibav,
  startTimeSeconds,
  throwIfAborted,
  type FileMuxer
} from "./av.js";

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
  const codec = findEncoder(opts.codec);
  if (!codec) throw new Error(`This libav build has no ${opts.codec} encoder`);
  const sampleFormat = codec.sampleFormats?.[0];
  const formatName = sampleFormat === undefined ? null : avGetSampleFmtName(sampleFormat);
  const endSec = await videoEndSec(opts.videoPath, signal);

  const demuxer = await Demuxer.open(opts.videoPath, { signal });
  let output: FileMuxer | null = null;
  let encoder: Encoder | null = null;
  // The CLI converts at the output: `-ar` and `-ac` become an aresample and an
  // aformat after the graph, in the encoder's sample format.
  const convert = FilterAPI.create(
    [
      `aresample=${opts.sampleRate}`,
      `aformat=${formatName ? `sample_fmts=${formatName}:` : ""}sample_rates=${opts.sampleRate}:channel_layouts=stereo`
    ].join(","),
    { signal }
  );
  try {
    const videoStream = demuxer.video();
    if (!videoStream) throw new Error(`${opts.videoPath} has no video stream`);
    output = await openFileMuxer(opts.outPath, { signal });
    const videoIndex = output.muxer.addStream(videoStream);
    encoder = await Encoder.create(codec, { signal });
    const audioIndex = output.muxer.addStream(encoder);
    const activeEncoder = encoder;
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

    const writeAudio = async (frame: Frame | null): Promise<void> => {
      for (const packet of await activeEncoder.encodeAll(frame)) {
        const sec = seconds(packet.pts, packet.timeBase);
        await drainVideo(sec);
        await activeOutput.muxer.writePacket(packet, audioIndex);
        packet.free();
      }
    };

    let reachedEnd = false;
    for await (const mixed of opts.audio) {
      if (signal?.aborted) {
        mixed.free();
        throw abortError(signal);
      }
      if (reachedEnd) {
        mixed.free();
        break;
      }
      for (const frame of await convert.processAll(mixed)) {
        try {
          if (seconds(frame.pts, frame.timeBase) >= endSec) {
            reachedEnd = true;
            continue;
          }
          await writeAudio(frame);
        } finally {
          frame.free();
        }
      }
      mixed.free();
    }
    if (!reachedEnd) {
      for (const frame of await convert.processAll(null)) {
        try {
          if (seconds(frame.pts, frame.timeBase) < endSec) await writeAudio(frame);
        } finally {
          frame.free();
        }
      }
    }
    await writeAudio(null);
    await drainVideo(Number.POSITIVE_INFINITY);
    await output.close();
  } finally {
    convert.close();
    encoder?.close();
    await output?.close();
    await demuxer.close();
  }
}
