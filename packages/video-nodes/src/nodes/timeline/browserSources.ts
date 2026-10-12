/**
 * Clip media the headless browser can decode.
 *
 * Google Chrome decodes H.264 and HEVC; Chromium builds without proprietary
 * codecs (Playwright's own, most Linux packages) decode only VP8, VP9 and AV1,
 * and an H.264 clip there fails the render with
 * `DEMUXER_ERROR_NO_SUPPORTED_STREAMS`. The driver asks the page which
 * decoders it has ({@link DECODER_PROBES}) and converts a clip it lacks one
 * for to VP9 before serving it: one fast ffmpeg pass per clip, timestamps
 * kept, so a variable-frame-rate source still decodes by its own clock.
 */

import path from "node:path";

import { execFfmpeg, execFfprobe, FFMPEG_MAX_BUFFER } from "../ffmpeg-helpers.js";

/** WebCodecs codec strings the page checks, keyed by ffprobe's codec name. */
export const DECODER_PROBES: ReadonlyArray<readonly [string, string]> = [
  ["h264", "avc1.640028"],
  ["hevc", "hev1.1.6.L120.90"],
  ["vp8", "vp8"],
  ["vp9", "vp09.00.40.08"],
  ["av1", "av01.0.08M.08"]
];

/** Containers ffprobe reports for stills, which an `<img>` decodes. */
const STILL_FORMATS = /(^|,)(image2|[a-z0-9]+_pipe|gif|svg)(,|$)/;

/** ffmpeg pixel formats that carry an alpha plane. */
const ALPHA_PIXEL_FORMATS = /^(yuva|rgba|bgra|argb|abgr|gbrap|ya[0-9])/;

interface ProbedMedia {
  codec: string;
  alpha: boolean;
}

/** The first video stream's codec, or null for a still or unreadable file. */
async function probeVideo(file: string, signal?: AbortSignal): Promise<ProbedMedia | null> {
  try {
    const { stdout } = await execFfprobe(
      [
        "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,pix_fmt:format=format_name",
        "-of", "json", file
      ],
      { signal }
    );
    const parsed = JSON.parse(stdout) as {
      streams?: Array<{ codec_name?: string; pix_fmt?: string }>;
      format?: { format_name?: string };
    };
    const stream = parsed.streams?.[0];
    if (!stream?.codec_name) return null;
    if (STILL_FORMATS.test(parsed.format?.format_name ?? "")) return null;
    return { codec: stream.codec_name, alpha: ALPHA_PIXEL_FORMATS.test(stream.pix_fmt ?? "") };
  } catch {
    // Not media ffprobe reads (an SVG, a font): served as it is.
    return null;
  }
}

export interface SourceConverter {
  /** The file to serve for `file`: itself, or a VP9 copy the page decodes. */
  prepare(file: string): Promise<string>;
  /** How many clips were converted. */
  readonly converted: number;
}

export function openSourceConverter(opts: {
  workDir: string;
  /** ffprobe codec names the page has a decoder for. */
  decodable: ReadonlySet<string>;
  signal?: AbortSignal;
}): SourceConverter {
  const pending = new Map<string, Promise<string>>();
  let converted = 0;
  let next = 0;
  const convert = async (file: string): Promise<string> => {
    const media = await probeVideo(file, opts.signal);
    if (!media || opts.decodable.has(media.codec)) return file;
    const out = path.join(opts.workDir, `browser-source-${next++}.webm`);
    await execFfmpeg(
      [
        "-y", "-v", "error", "-i", file,
        "-map", "0:v:0", "-an",
        "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-row-mt", "1",
        "-crf", "18", "-b:v", "0",
        "-pix_fmt", media.alpha ? "yuva420p" : "yuv420p",
        // Keep every frame at its own timestamp, as the source has it.
        "-fps_mode", "passthrough",
        out
      ],
      { maxBuffer: FFMPEG_MAX_BUFFER, signal: opts.signal }
    );
    converted++;
    return out;
  };
  return {
    prepare(file: string): Promise<string> {
      let result = pending.get(file);
      if (!result) {
        result = convert(file);
        pending.set(file, result);
      }
      return result;
    },
    get converted(): number {
      return converted;
    }
  };
}
