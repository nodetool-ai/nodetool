/**
 * Container probes on Mediabunny: duration, picture size, frame rates,
 * streams and packet timestamps, read without decoding anything.
 */

import {
  ALL_FORMATS,
  BufferSource,
  EncodedPacketSink,
  FilePathSource,
  Input
} from "mediabunny";

import { throwIfAborted } from "./abort.js";

/** A file path or the file's bytes. */
export type MediaSource = string | Uint8Array;

export interface VideoStreamInfo {
  codec: string | null;
  /** Coded size before rotation, as ffprobe's `stream=width,height` reports it. */
  width: number;
  height: number;
  /** Size after rotation metadata is applied. */
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  /**
   * The rate of the timestamp lattice the frames sit on, or `null` when the
   * frames sit on none (a truly variable-rate source). Frames may be missing
   * from the lattice: a 60 fps grid with two frames of every five kept still
   * reports 60. This is what ffprobe calls `r_frame_rate` for files whose
   * header carries a real rate.
   */
  nominalFps: number | null;
  /** Frames per second over the probed packets, as ffprobe's `avg_frame_rate`. */
  averageFps: number;
  /** True only when every lattice slot holds a frame. */
  constantFrameRate: boolean;
  /** Whether the frames may carry alpha (a `yuva*` or RGBA stream). */
  alpha: boolean;
  /** Ticks per second of the track's timestamps. */
  timeResolution: number;
}

export interface AudioStreamInfo {
  codec: string | null;
  sampleRate: number;
  channels: number;
}

export interface MediaProbe {
  /** Container name, e.g. `MP4`, `Matroska`, `WAVE`. */
  format: string;
  /** End of the last packet in seconds, or `null` when it cannot be known. */
  durationSec: number | null;
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo | null;
}

export interface ProbeOptions {
  signal?: AbortSignal;
  /**
   * How many video packets the frame-rate measurement reads. Mediabunny needs
   * about 256 for a reliable answer. `Infinity` reads the whole track.
   */
  frameRatePackets?: number;
}

function openInput(source: MediaSource): Input {
  return new Input({
    source:
      typeof source === "string" ? new FilePathSource(source) : new BufferSource(source),
    formats: ALL_FORMATS
  });
}

/**
 * Read `source`'s streams and timing. Throws when the bytes are not a
 * container Mediabunny recognizes; callers that treat unreadable media as
 * "no audio" or "no duration" catch that.
 */
export async function probeMedia(
  source: MediaSource,
  options: ProbeOptions = {}
): Promise<MediaProbe> {
  const { signal } = options;
  throwIfAborted(signal);
  const input = openInput(source);
  try {
    const format = (await input.getFormat()).name;
    throwIfAborted(signal);
    const videoTrack = await input.getPrimaryVideoTrack();
    const audioTrack = await input.getPrimaryAudioTrack();
    const durationSec =
      (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    throwIfAborted(signal);

    let video: VideoStreamInfo | null = null;
    if (videoTrack) {
      const target = options.frameRatePackets ?? 256;
      const rates = await videoTrack.computeFrameRateMetrics({
        // Mediabunny refuses Infinity, though its docs offer it for a full scan.
        targetPacketCount: Number.isFinite(target) ? target : Number.MAX_SAFE_INTEGER
      });
      throwIfAborted(signal);
      video = {
        codec: videoTrack.codec,
        width: videoTrack.codedWidth,
        height: videoTrack.codedHeight,
        displayWidth: videoTrack.displayWidth,
        displayHeight: videoTrack.displayHeight,
        rotation: videoTrack.rotation,
        nominalFps: rates.underlyingFrameRate,
        averageFps: rates.averageFrameRate,
        constantFrameRate: rates.frameRateIsConstant,
        alpha: await videoTrack.canBeTransparent(),
        timeResolution: videoTrack.timeResolution
      };
    }
    const audio: AudioStreamInfo | null = audioTrack
      ? {
          codec: audioTrack.codec,
          sampleRate: audioTrack.sampleRate,
          channels: audioTrack.numberOfChannels
        }
      : null;
    return {
      format,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      video,
      audio
    };
  } finally {
    input.dispose();
  }
}

/**
 * Presentation timestamps of the primary video track's packets in seconds, in
 * file (decode) order, as ffprobe's `packet=pts_time` lists them. `null` when
 * there is no video track or the track has more than `maxPackets` packets.
 */
export async function packetTimes(
  source: MediaSource,
  options: { signal?: AbortSignal; maxPackets?: number } = {}
): Promise<number[] | null> {
  const { signal } = options;
  const maxPackets = options.maxPackets ?? Number.POSITIVE_INFINITY;
  throwIfAborted(signal);
  const input = openInput(source);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const times: number[] = [];
    const sink = new EncodedPacketSink(track);
    for await (const packet of sink.packets(undefined, undefined, { metadataOnly: true })) {
      throwIfAborted(signal);
      if (times.length >= maxPackets) return null;
      times.push(packet.timestamp);
    }
    return times;
  } finally {
    input.dispose();
  }
}
