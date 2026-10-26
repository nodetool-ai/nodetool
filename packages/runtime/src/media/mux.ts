/**
 * Encode filtered audio onto an existing video without re-encoding the
 * picture: the in-process form of `ffmpeg -i base ... -map 0:v -map [aout]
 * -c:v copy -c:a <codec> -shortest out`.
 */

import { Demuxer, type Frame, type Packet } from "node-av";

import { AudioEncoder } from "./audio-encoder.js";
import {
  abortError,
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
