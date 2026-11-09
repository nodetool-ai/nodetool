// Code media helpers stage only in the explicitly granted workspace. Codec and
// filter execution stays in the existing native media host.
import {
  createAudioBridge as audioDsp,
  encodeNativeWav
} from "nodetool:code-audio-dsp";
import {
  probeMedia,
  packetTimes,
  openRgbaFrameReader,
  openVideoFrameEncoder,
  openFilterComplex,
  muxAudioWithVideoCopy
} from "./media-native.mjs";
import { statSync } from "./fs.mjs";
import { staged, nativeAudioData } from "./media-decode.mjs";
export { nativeAudioData };
const codecName = (name) =>
  ({ h264: "avc", pcm_s16le: "pcm-s16", pcm_f32le: "pcm-f32" })[name] ?? name;
function finite(value, name, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`${name} must be a finite number`);
  return value;
}
function dimensions(width, height, maxBytes) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > Math.floor(maxBytes / 4 / height)
  )
    throw new Error("video: decoded frame exceeds the run media limit");
}
export function createAudioBridge(signal, maxBytes = 256 * 1024 * 1024) {
  const original = audioDsp(signal, maxBytes);
  return {
    ...original,
    async info(bytes) {
      // The existing PCM parser needs no codec or filesystem grant.
      if (
        bytes[0] === 82 &&
        bytes[1] === 73 &&
        bytes[8] === 87 &&
        bytes[9] === 65
      )
        return original.info(bytes);
      return staged([bytes], signal, maxBytes, async ({ files }) => {
        const probe = await probeMedia(files[0], { signal });
        if (!probe.audio) throw new Error("audio.info: no audio track found");
        return {
          format: codecName(probe.audio.codec),
          codec: codecName(probe.audio.codec),
          duration: probe.durationSec,
          channels: probe.audio.channels,
          sample_rate: probe.audio.sampleRate,
          size_bytes: bytes.length
        };
      });
    }
  };
}
function rotateFrame(frame, degrees) {
  if (!degrees) return frame;
  const swap = degrees === 90 || degrees === 270,
    width = swap ? frame.height : frame.width,
    height = swap ? frame.width : frame.height;
  const rgba = new Uint8Array(frame.rgba.length);
  for (let y = 0; y < frame.height; y++)
    for (let x = 0; x < frame.width; x++) {
      const nx =
        degrees === 90
          ? frame.height - 1 - y
          : degrees === 180
            ? frame.width - 1 - x
            : y;
      const ny =
        degrees === 90
          ? x
          : degrees === 180
            ? frame.height - 1 - y
            : frame.width - 1 - x;
      rgba.set(
        frame.rgba.subarray(
          (y * frame.width + x) * 4,
          (y * frame.width + x) * 4 + 4
        ),
        (ny * width + nx) * 4
      );
    }
  return { ...frame, width, height, rgba };
}
function videoInfo(probe, maxBytes) {
  if (!probe.video) throw new Error("video: no video track found");
  dimensions(probe.video.width, probe.video.height, maxBytes);
  return {
    width: probe.video.displayWidth,
    height: probe.video.displayHeight,
    rotation: probe.video.rotation,
    codec: codecName(probe.video.codec),
    duration: probe.durationSec,
    has_audio: !!probe.audio
  };
}
async function mux(videoPath, audioPath, outPath, probe, range, signal) {
  if (!probe.audio) return videoPath;
  const start = range.start ?? 0,
    end = range.end;
  const filter = `atrim=start=${start}${end === undefined ? "" : `:end=${end}`},asetpts=PTS-STARTPTS`;
  const audio = await openFilterComplex({
    inputs: [{ filePath: audioPath, kind: "audio", label: "in" }],
    graph: `[in]${filter}[out]`,
    output: "out",
    outputKind: "audio",
    signal
  });
  try {
    await muxAudioWithVideoCopy({
      videoPath,
      outPath,
      audio: audio.frames(),
      signal
    });
    return outPath;
  } finally {
    await audio.close();
  }
}
export function createVideoBridge(signal, maxBytes = 256 * 1024 * 1024) {
  async function transform(
    bytes,
    { start = 0, end, width, height, fit = "fill", rotation = 0 } = {}
  ) {
    return staged(
      [bytes],
      signal,
      maxBytes,
      async ({ files, directory, read }) => {
        const probe = await probeMedia(files[0], { signal });
        videoInfo(probe, maxBytes);
        const fps = probe.video.nominalFps || probe.video.averageFps || 30;
        const filters = [
          `trim=start=${start}${end === undefined ? "" : `:end=${end}`}`,
          "setpts=PTS-STARTPTS",
          `fps=${fps}`
        ];
        if (width !== undefined) {
          dimensions(width, height, maxBytes);
          if (fit === "fill") filters.push(`scale=${width}:${height}`);
          else if (fit === "contain")
            filters.push(
              `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
              `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`
            );
          else
            filters.push(
              `scale=${width}:${height}:force_original_aspect_ratio=increase`,
              `crop=${width}:${height}`
            );
        }
        filters.push("format=rgba");
        const reader = await openRgbaFrameReader({
          filePath: files[0],
          filter: filters.join(","),
          signal
        });
        let encoder,
          frames = 0;
        const picture = `${directory}/picture.mp4`;
        try {
          for (;;) {
            signal?.throwIfAborted();
            const next = await reader.next();
            if (!next) break;
            const frame = rotateFrame(
              next,
              (probe.video.rotation + rotation) % 360
            );
            dimensions(frame.width, frame.height, maxBytes);
            encoder ??= await openVideoFrameEncoder({
              outPath: picture,
              width: frame.width,
              height: frame.height,
              fps,
              input: "rgba",
              spec: {
                codec: "libx264",
                pixelFormat: "yuv420p",
                options: { preset: "veryfast", crf: "18" }
              },
              signal
            });
            await encoder.write(frame.rgba);
            frames++;
            if (statSync(picture).size > maxBytes)
              throw new Error("Code media output exceeds the run media limit");
          }
          if (!frames) throw new Error("video: conversion produced no frames");
          await encoder.finish();
          return read(
            await mux(
              picture,
              files[0],
              `${directory}/result.mp4`,
              probe,
              { start, end },
              signal
            )
          );
        } finally {
          await reader.close();
          await encoder?.abort();
        }
      }
    );
  }
  return {
    async info(bytes) {
      return staged([bytes], signal, maxBytes, async ({ files }) =>
        videoInfo(await probeMedia(files[0], { signal }), maxBytes)
      );
    },
    async trim(bytes, options = {}) {
      const start = Math.max(0, finite(options.start, "start", 0)),
        end = finite(options.end, "end");
      if (end !== undefined && end <= start)
        throw new Error("video.trim: end must be after start");
      return transform(bytes, { start, end });
    },
    async resize(bytes, options = {}) {
      const width = finite(options.width, "width", 0),
        height = finite(options.height, "height", 0),
        fit = options.fit ?? "fill";
      if (!["fill", "contain", "cover"].includes(fit))
        throw new Error("video.resize: fit must be fill, contain, or cover");
      dimensions(width, height, maxBytes);
      return transform(bytes, { width, height, fit });
    },
    async rotate(bytes, degrees) {
      if (![0, 90, 180, 270].includes(degrees))
        throw new Error("video.rotate: degrees must be 0, 90, 180, or 270");
      return transform(bytes, { rotation: degrees });
    },
    async extractFrame(bytes, time = 0) {
      time = Math.max(0, finite(time, "video.extractFrame time", 0));
      return staged([bytes], signal, maxBytes, async ({ files }) => {
        const probe = await probeMedia(files[0], { signal });
        videoInfo(probe, maxBytes);
        const times = await packetTimes(files[0], { signal });
        const at = times
          .filter((value) => value <= time)
          .reduce((latest, value) => Math.max(latest, value), 0);
        if (time > probe.durationSec)
          throw new Error("video.extractFrame: no frame found at that time");
        const reader = await openRgbaFrameReader({
          filePath: files[0],
          seekSec: at,
          filter: `trim=start=${at},format=rgba`,
          signal
        });
        try {
          const frame = await reader.next();
          if (!frame)
            throw new Error("video.extractFrame: no frame found at that time");
          const rotated = rotateFrame(frame, probe.video.rotation);
          return await globalThis.__host.image.encodePngAsync(
            rotated.rgba,
            rotated.width,
            rotated.height
          );
        } finally {
          await reader.close();
        }
      });
    },
    async extractAudio(bytes) {
      return encodeNativeWav(
        await nativeAudioData(bytes, signal, maxBytes),
        maxBytes,
        signal
      );
    },
    async addAudio(videoBytes, audioBytes, options = {}) {
      return staged(
        [videoBytes, audioBytes],
        signal,
        maxBytes,
        async ({ files, directory, read }) => {
          const probe = await probeMedia(files[0], { signal });
          videoInfo(probe, maxBytes);
          const added = await probeMedia(files[1], { signal });
          if (!added.audio)
            throw new Error(
              "video.addAudio: audio input has no usable audio track"
            );
          const audio = await openFilterComplex({
            inputs: [{ filePath: files[1], kind: "audio", label: "in" }],
            graph: "[in]anull[out]",
            output: "out",
            outputKind: "audio",
            signal
          });
          const outPath = `${directory}/added.mp4`;
          try {
            await muxAudioWithVideoCopy({
              videoPath: files[0],
              outPath,
              audio: audio.frames(),
              signal
            });
            if (options.keepOriginalAudio === true && probe.audio) {
              if (!globalThis.__host.media.remuxTracks)
                throw new Error(
                  "Native media track-preserving remux is not registered"
                );
              await globalThis.__host.media.remuxTracks({
                videoPath: files[0],
                audioPath: outPath,
                outPath: `${directory}/tracks.mp4`
              });
              return read(`${directory}/tracks.mp4`);
            }
            return read(outPath);
          } finally {
            await audio.close();
          }
        }
      );
    }
  };
}
export const audioOps = createAudioBridge();
export const videoOps = createVideoBridge();
