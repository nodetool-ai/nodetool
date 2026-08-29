/**
 * Video understanding for vision models that cannot read video.
 *
 * These tests decode a real clip: ffmpeg is the feature, and a stubbed
 * ffmpeg would only prove the argv is spelled the way the test spells it. CI
 * installs it on the `test-packages` leg (`.github/workflows/quality-checks.yml`);
 * locally, `apt-get install -y ffmpeg`.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { BaseProvider } from "../../src/providers/base-provider.js";
import {
  frameRateFor,
  sampleVideoFrames
} from "../../src/providers/video-frames.js";
import {
  expandVideoContentAsFrames,
  frameHeaderText
} from "../../src/providers/video-frame-fallback.js";
import type {
  Message,
  MessageContent,
  MessageImageContent,
  ProviderStreamItem
} from "../../src/providers/types.js";

const execFile = promisify(execFileCb);

/** A 4-second 64×64 test pattern — small enough to decode in milliseconds. */
const CLIP_SECONDS = 4;
let clip: Uint8Array;
/** The same pattern as a raw H.264 stream: decodable, but with no duration. */
let rawStream: Uint8Array;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-vframe-test-"));
  const out = path.join(tmpDir, "clip.mp4");
  await execFile("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=64x64:rate=10:duration=${CLIP_SECONDS}`,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-y",
    out
  ]);
  clip = new Uint8Array(await fs.readFile(out));

  const raw = path.join(tmpDir, "clip.h264");
  await execFile("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=64x64:rate=10:duration=10",
    "-c:v",
    "libx264",
    "-bsf:v",
    "h264_mp4toannexb",
    "-f",
    "h264",
    "-y",
    raw
  ]);
  rawStream = new Uint8Array(await fs.readFile(raw));
}, 60_000);

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

function videoMessage(): Message {
  return {
    role: "user",
    content: [
      { type: "text", text: "what happens in this clip?" },
      { type: "video", video: { data: clip, mimeType: "video/mp4" } }
    ]
  };
}

function imageParts(content: MessageContent[]): MessageImageContent[] {
  return content.filter(
    (c): c is MessageImageContent => c.type === "image_url"
  );
}

describe("frameRateFor", () => {
  it("spreads the frame budget over the whole clip", () => {
    // 9 frames across 8 seconds: one every second, the last at t=8s.
    expect(frameRateFor(8, 9, 10)).toBeCloseTo(1, 6);
  });

  it("never samples denser than the ceiling", () => {
    expect(frameRateFor(1, 16, 1)).toBe(1);
  });

  it("falls back to the ceiling when the duration is unknown", () => {
    expect(frameRateFor(null, 16, 2)).toBe(2);
  });
});

describe("sampleVideoFrames", () => {
  it("decodes a clip into timestamped JPEG stills", async () => {
    const sample = await sampleVideoFrames(clip, { maxFrames: 5, maxFps: 4 });

    expect(sample.durationSec).toBeCloseTo(CLIP_SECONDS, 1);
    expect(sample.frames.length).toBeGreaterThan(1);
    expect(sample.frames.length).toBeLessThanOrEqual(5);
    for (const frame of sample.frames) {
      expect(frame.mimeType).toBe("image/jpeg");
      // JPEG SOI marker — proves ffmpeg wrote an image, not an empty file.
      expect([frame.data[0], frame.data[1]]).toEqual([0xff, 0xd8]);
    }
    const stamps = sample.frames.map((f) => f.timeSec);
    expect(stamps[0]).toBe(0);
    expect([...stamps].sort((a, b) => a - b)).toEqual(stamps);
    // The last frame lands near the end of the clip rather than bunching at
    // the start, which is what a naive `fps = maxFrames / duration` produces.
    expect(stamps[stamps.length - 1]).toBeGreaterThan(CLIP_SECONDS / 2);
  });

  it("stops at the frame cap when the duration is unknown, and says so", async () => {
    // A raw H.264 elementary stream carries no container duration, so the rate
    // cannot be fitted to the clip and the cap is what ends the sample.
    const sample = await sampleVideoFrames(rawStream, {
      maxFrames: 3,
      maxFps: 1
    });
    expect(sample.durationSec).toBeNull();
    expect(sample.frames).toHaveLength(3);
    expect(sample.truncated).toBe(true);
    expect(frameHeaderText(sample)).toMatch(/frame limit/);
  });

  it("fits frames inside the requested box without upscaling", async () => {
    const sample = await sampleVideoFrames(clip, {
      maxFrames: 1,
      maxDimension: 32
    });
    const [width, height] = jpegSize(sample.frames[0].data);
    expect(width).toBeLessThanOrEqual(32);
    expect(height).toBeLessThanOrEqual(32);
  });
});

describe("expandVideoContentAsFrames", () => {
  it("replaces a video part with a header and labelled frames", async () => {
    const [message] = await expandVideoContentAsFrames([videoMessage()]);
    const content = message.content as MessageContent[];

    expect(content.some((c) => c.type === "video")).toBe(false);
    expect(content[0]).toEqual({
      type: "text",
      text: "what happens in this clip?"
    });
    const header = content[1] as { type: "text"; text: string };
    expect(header.text).toMatch(/still frames? were sampled/);
    expect(header.text).toMatch(/no audio and no motion/);

    const images = imageParts(content);
    expect(images.length).toBeGreaterThan(1);
    for (const image of images) {
      expect(image.image.uri).toMatch(/^data:image\/jpeg;base64,/);
    }
    const labels = content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text);
    expect(labels.filter((t) => /^Frame \d+ at /.test(t))).toHaveLength(
      images.length
    );
  });

  it("returns messages carrying no video untouched", async () => {
    const messages: Message[] = [{ role: "user", content: "plain text" }];
    expect(await expandVideoContentAsFrames(messages)).toBe(messages);
  });

  it("reads a video from a data URI as well as inline bytes", async () => {
    const uri = `data:video/mp4;base64,${Buffer.from(clip).toString("base64")}`;
    const [message] = await expandVideoContentAsFrames([
      { role: "user", content: [{ type: "video", video: { uri } }] }
    ]);
    expect(imageParts(message.content as MessageContent[]).length).toBeGreaterThan(
      0
    );
  });
});

/** Records the messages a provider was actually asked to send. */
class RecordingProvider extends BaseProvider {
  sent: Message[] = [];
  constructor(private readonly readsVideo: boolean) {
    super("test");
  }

  override get supportsVideoInput(): boolean {
    return this.readsVideo;
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
  }): Promise<Message> {
    this.sent = args.messages;
    return { role: "assistant", content: "ok" };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
  }): AsyncGenerator<ProviderStreamItem> {
    this.sent = args.messages;
    yield { type: "chunk", content: "ok", done: true };
  }
}

async function drain(gen: AsyncGenerator<ProviderStreamItem>): Promise<void> {
  for await (const _ of gen) {
    // The provider records what it was sent; the stream itself is not the point.
  }
}

describe("BaseProvider video frame fallback", () => {
  it("hands a provider without video input the sampled frames", async () => {
    const provider = new RecordingProvider(false);
    await provider.generateMessage({
      messages: [videoMessage()],
      model: "m"
    });

    const content = provider.sent[0].content as MessageContent[];
    expect(content.some((c) => c.type === "video")).toBe(false);
    expect(imageParts(content).length).toBeGreaterThan(1);
  });

  it("covers the streaming path too", async () => {
    const provider = new RecordingProvider(false);
    await drain(provider.generateMessages({ messages: [videoMessage()], model: "m" }));

    const content = provider.sent[0].content as MessageContent[];
    expect(content.some((c) => c.type === "video")).toBe(false);
    expect(imageParts(content).length).toBeGreaterThan(1);
  });

  it("leaves a provider that reads video natively alone", async () => {
    const provider = new RecordingProvider(true);
    await provider.generateMessage({
      messages: [videoMessage()],
      model: "m"
    });

    const content = provider.sent[0].content as MessageContent[];
    expect(content.some((c) => c.type === "video")).toBe(true);
    expect(imageParts(content)).toHaveLength(0);
  });

  it("passes the clip through untouched when the fallback is switched off", async () => {
    // The inverted condition: without it, every assertion above would also
    // hold on a fallback that never ran, because the video part would simply
    // still be there.
    process.env.NODETOOL_VIDEO_FRAME_FALLBACK = "0";
    try {
      const provider = new RecordingProvider(false);
      await provider.generateMessage({
        messages: [videoMessage()],
        model: "m"
      });
      const content = provider.sent[0].content as MessageContent[];
      expect(content.some((c) => c.type === "video")).toBe(true);
      expect(imageParts(content)).toHaveLength(0);
    } finally {
      delete process.env.NODETOOL_VIDEO_FRAME_FALLBACK;
    }
  });
});

/** Width and height from a JPEG's first SOFn marker. */
function jpegSize(bytes: Uint8Array): [number, number] {
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = bytes[offset + 1];
    const size = (bytes[offset + 2] << 8) + bytes[offset + 3];
    if (marker >= 0xc0 && marker <= 0xc3) {
      return [
        (bytes[offset + 7] << 8) + bytes[offset + 8],
        (bytes[offset + 5] << 8) + bytes[offset + 6]
      ];
    }
    offset += 2 + size;
  }
  throw new Error("No JPEG SOFn marker found");
}
