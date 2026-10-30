/**
 * Real media for render tests, made in process: no `ffmpeg` on PATH.
 *
 * `writeClip` writes an H.264 picture with an AAC track beside it, the shape a
 * generated clip arrives in. `renderWithNode` runs RenderTimeline against a
 * context that serves assets from disk and returns the rendered file.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

import {
  muxAudioWithVideoCopy,
  openFilterComplex
} from "@nodetool-ai/runtime/media";
import {
  encodeWav,
  writeRgbaVideo
} from "@nodetool-ai/runtime/media/testing";

/**
 * Write an MP4 of `frames` RGBA frames at `fps`, with `audio` (mono float
 * samples at 48 kHz) muxed beside it when given.
 */
export async function writeClip(opts: {
  outPath: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  frameAt: (index: number) => Uint8Array;
  audio?: Float32Array;
}): Promise<void> {
  const videoPath = opts.audio ? `${opts.outPath}.video.mp4` : opts.outPath;
  await writeRgbaVideo({
    outPath: videoPath,
    width: opts.width,
    height: opts.height,
    fps: opts.fps,
    frames: opts.frames,
    frameAt: opts.frameAt,
    spec: {
      codec: "libx264",
      pixelFormat: "yuv420p",
      filter: "scale=out_color_matrix=bt709:out_range=tv",
      options: {
        preset: "veryfast",
        qp: "0",
        colorspace: "bt709",
        color_primaries: "bt709",
        color_trc: "bt709"
      }
    }
  });
  if (!opts.audio) return;
  const wavPath = `${opts.outPath}.wav`;
  await fs.writeFile(wavPath, encodeWav(opts.audio, 48000, 1));
  const audio = await openFilterComplex({
    inputs: [{ filePath: wavPath, kind: "audio", label: "0:a" }],
    graph: "[0:a]anull[out]",
    output: "out",
    outputKind: "audio"
  });
  try {
    await muxAudioWithVideoCopy({
      videoPath,
      audio: audio.frames(),
      outPath: opts.outPath,
      codec: "aac",
      sampleRate: 48000
    });
  } finally {
    await audio.close();
    await fs.rm(videoPath, { force: true });
    await fs.rm(wavPath, { force: true });
  }
}

/** A context that serves each asset id from a file on disk. */
export function diskContext(sequence: unknown, files: Record<string, string>) {
  return {
    getTimelineSequence: async () => sequence,
    localPath: async (assetId: string): Promise<string | null> => files[assetId] ?? null,
    resolveAssetBytes: async () => ({ bytes: null, attempts: [] })
  };
}

/** Write a render result's inline bytes to `outPath` and return the path. */
export async function writeRenderOutput(
  result: { output: { data: string | null } },
  outPath: string
): Promise<string> {
  const data = result.output.data;
  if (!data) throw new Error("The render returned no inline bytes");
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, Buffer.from(data, "base64"));
  return outPath;
}
