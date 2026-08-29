/**
 * Read a video with a vision model that has no video content part.
 *
 * Most chat APIs are OpenAI-compatible and have nowhere to put a clip, so a
 * `video` part reaching them used to be a hard refusal — even when the model
 * behind the endpoint reads images perfectly well. This samples the clip into
 * stills with ffmpeg and puts them on the message as ordinary image parts,
 * labelled with their timestamps so the model can reason about order and
 * timing.
 *
 * It is a downgrade, and it says so: the header text names the frame count and
 * the sample rate, so a model that needs continuous motion or the audio track
 * can report that it is missing rather than inventing it. A provider that
 * reads video natively (`supportsVideoInput`) never comes through here.
 */

import type { Message, MessageContent, MessageVideoContent } from "./types.js";
import { safeFetch } from "./safe-url.js";
import { sampleVideoFrames, type VideoFrameSample } from "./video-frames.js";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool:video-frame-fallback");

export type VideoFrameFallbackOptions = {
  /** Resolve a non-`data:` URI the way the provider would (asset files, legacy paths). */
  resolveUri?: (uri: string) => Promise<string>;
  signal?: AbortSignal;
  /** Provider id, for the log line and the error message. */
  provider?: string;
};

/**
 * Whether the fallback is on. `NODETOOL_VIDEO_FRAME_FALLBACK=0` turns it off
 * and restores the old refusal, for a caller that would rather fail than
 * silently pay for a lossy read.
 */
export function videoFrameFallbackEnabled(): boolean {
  const raw = globalThis.process?.env?.["NODETOOL_VIDEO_FRAME_FALLBACK"];
  return raw !== "0" && raw !== "false";
}

/** Whether any message carries a `video` content part. */
function messagesContainVideo(messages: readonly Message[]): boolean {
  return messages.some(
    (m) =>
      Array.isArray(m.content) && m.content.some((c) => c.type === "video")
  );
}

function decodeBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/** The bytes behind a `data:` URI. */
function parseDataUri(uri: string): Uint8Array {
  const comma = uri.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URI");
  return decodeBase64(uri.slice(comma + 1));
}

/**
 * Source a video part's bytes: inline data first, then its URI. The container
 * type is not read off the ref — ffmpeg sniffs it from the file itself, which
 * is right more often than a `mimeType` the caller guessed.
 */
async function videoContentBytes(
  video: MessageVideoContent["video"],
  options: VideoFrameFallbackOptions
): Promise<Uint8Array> {
  if (typeof video.data === "string" && video.data.length > 0) {
    return video.data.startsWith("data:")
      ? parseDataUri(video.data)
      : decodeBase64(video.data);
  }
  if (video.data instanceof Uint8Array && video.data.length > 0) {
    return video.data;
  }
  if (!video.uri) return new Uint8Array();

  const resolved = video.uri.startsWith("data:")
    ? video.uri
    : ((await options.resolveUri?.(video.uri)) ?? video.uri);
  if (resolved.startsWith("data:")) return parseDataUri(resolved);

  const resp = await safeFetch(
    resolved,
    options.signal ? { signal: options.signal } : undefined
  );
  if (!resp.ok) throw new Error(`Failed to fetch video: ${resp.status}`);
  return new Uint8Array(await resp.arrayBuffer());
}

function round(value: number, digits = 1): string {
  return value.toFixed(digits).replace(/\.0+$/, "");
}

/** The header that tells the model what it is looking at, and what it is not. */
export function frameHeaderText(sample: VideoFrameSample): string {
  const count = sample.frames.length;
  const duration =
    sample.durationSec !== null ? `${round(sample.durationSec)}s ` : "";
  const rate =
    sample.fps >= 1
      ? `${round(sample.fps, 2)} frames/second`
      : `one frame every ${round(1 / sample.fps, 1)}s`;
  const cut = sample.truncated
    ? ` Sampling stopped at the frame limit, so the end of the clip is not shown.`
    : "";
  return (
    `[The following ${count} still frame${count === 1 ? "" : "s"} were ` +
    `sampled from a ${duration}video at ${rate}, in order. They are stills: ` +
    `there is no audio and no motion between them.${cut}]`
  );
}

/** One frame as an image part, preceded by its timestamp. */
function framePartsFor(sample: VideoFrameSample): MessageContent[] {
  const parts: MessageContent[] = [];
  for (const [index, frame] of sample.frames.entries()) {
    parts.push({
      type: "text",
      text: `Frame ${index + 1} at ${round(frame.timeSec)}s:`
    });
    parts.push({
      type: "image_url",
      image: {
        uri: `data:${frame.mimeType};base64,${Buffer.from(frame.data).toString("base64")}`,
        mimeType: frame.mimeType
      }
    });
  }
  return parts;
}

/**
 * Replace every `video` content part with sampled frames. Messages with no
 * video are returned untouched (same object identity), so this is cheap to
 * call on every request.
 */
export async function expandVideoContentAsFrames(
  messages: Message[],
  options: VideoFrameFallbackOptions = {}
): Promise<Message[]> {
  if (!messagesContainVideo(messages)) return messages;

  const out: Message[] = [];
  for (const message of messages) {
    if (
      !Array.isArray(message.content) ||
      !message.content.some((c) => c.type === "video")
    ) {
      out.push(message);
      continue;
    }
    const parts: MessageContent[] = [];
    for (const part of message.content) {
      if (part.type !== "video") {
        parts.push(part);
        continue;
      }
      const bytes = await videoContentBytes(
        (part as MessageVideoContent).video,
        options
      );
      if (bytes.length === 0) {
        parts.push({
          type: "text",
          text: "[A video was attached but its bytes could not be read.]"
        });
        continue;
      }
      const sample = await sampleVideoFrames(bytes, {
        signal: options.signal
      });
      if (sample.frames.length === 0) {
        throw new Error(
          `ffmpeg decoded no frames from the attached video, so ` +
            `${options.provider ?? "this provider"} has nothing to read. The ` +
            `file may not be a video, or may use a codec this ffmpeg build ` +
            `does not decode.`
        );
      }
      log.debug("Sampled a video into frames", {
        provider: options.provider,
        frames: sample.frames.length,
        fps: sample.fps,
        durationSec: sample.durationSec
      });
      parts.push({ type: "text", text: frameHeaderText(sample) });
      parts.push(...framePartsFor(sample));
    }
    out.push({ ...message, content: parts });
  }
  return out;
}
