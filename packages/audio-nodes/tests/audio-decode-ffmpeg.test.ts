/**
 * Regression: WebM/Opus — what a browser `MediaRecorder` produces by default
 * (`audio/webm;codecs=opus`) — must decode through `decodeAudioToWav`.
 * node-web-audio-api's Symphonia backend has no Opus decoder and rejects these
 * bytes with "unsupported feature: core (codec):unsupported codec", so the
 * helper falls back to ffmpeg. The fallback must also preserve the source's
 * channel count and sample rate (no implicit downmix/resample), since these
 * feed audio effect/DSP nodes.
 *
 * ffmpeg is an optional runtime tool; the suite skips when it (or its libopus
 * encoder) is unavailable.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeAudioToWav } from "@nodetool-ai/audio-nodes";

const execFileP = promisify(execFile);

/** Encode a 0.25 s stereo 440 Hz tone as WebM/Opus, or null if ffmpeg can't. */
async function makeWebmOpus(): Promise<Uint8Array | null> {
  let dir: string | undefined;
  try {
    dir = await mkdtemp(join(tmpdir(), "audio-opus-fixture-"));
    const out = join(dir, "tone.webm");
    await execFileP("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.25:sample_rate=48000",
      "-ac",
      "2",
      "-c:a",
      "libopus",
      "-f",
      "webm",
      out
    ]);
    return new Uint8Array(await readFile(out));
  } catch {
    return null;
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true });
  }
}

describe("decodeAudioToWav: WebM/Opus via ffmpeg fallback", () => {
  let fixture: Uint8Array | null = null;
  beforeAll(async () => {
    fixture = await makeWebmOpus();
  });

  it("decodes browser-style WebM/Opus instead of throwing 'unsupported codec'", async () => {
    if (!fixture) return; // ffmpeg/libopus unavailable — covered where present
    // Sanity: the fixture really is a WebM container (EBML magic), not WAV.
    expect(String.fromCharCode(...fixture.slice(0, 4))).not.toBe("RIFF");
    expect([...fixture.slice(0, 4)]).toEqual([0x1a, 0x45, 0xdf, 0xa3]);

    const wav = await decodeAudioToWav(fixture);

    // Channels and rate preserved — no implicit mono downmix or resample.
    expect(wav.numChannels).toBe(2);
    expect(wav.sampleRate).toBe(48000);
    expect(wav.samples.length).toBeGreaterThan(0);

    let peak = 0;
    for (const s of wav.samples) peak = Math.max(peak, Math.abs(s));
    expect(peak).toBeGreaterThan(0.02); // a real tone, not a silent/zero buffer
  });
});
