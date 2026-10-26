/**
 * In-process media: probes, decode, filter graphs and encode without the
 * `ffmpeg` and `ffprobe` binaries.
 *
 * Mediabunny handles probes, timestamp decode, trims and whole-file
 * conversions. node-av, the same libav Mediabunny's server adapter runs on,
 * handles filter graphs, the audio mix, and raw RGBA decode and encode, so the
 * CLI's filter strings and swscale flags carry over unchanged.
 *
 * Node only: every function here loads a native addon.
 */

export { hasEncoder, hasFilter } from "./codecs.js";
export {
  packetTimes,
  probeMedia,
  type AudioStreamInfo,
  type MediaProbe,
  type MediaSource,
  type ProbeOptions,
  type VideoStreamInfo
} from "./probe.js";
export {
  decodeAudioChunks,
  decodeAudioToPcm,
  type PcmAudio,
  type PcmOptions
} from "./audio.js";
export {
  openFilterComplex,
  openFilterGraph,
  type FilterComplexInput,
  type FilterRun
} from "./filter-graph.js";
export { openDecodedStream, type DecodedStream, type MediaKind } from "./decode.js";
export {
  openRgbaFrameReader,
  openVideoFrameEncoder,
  type RgbaFrame,
  type RgbaFrameReader,
  type VideoEncoderSpec,
  type VideoFrameEncoder
} from "./rgba.js";
export { muxAudioWithVideoCopy } from "./mux.js";
export { convertAudioToWav, ensureMediabunnyServer, trimVideo } from "./convert.js";
export { transcodeVideo } from "./transcode.js";
export { AudioEncoder } from "./audio-encoder.js";
