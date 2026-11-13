/**
 * The music mode path of `generate_media` (MUSIC-MODE.md sections 10 and 11):
 * a scripted `music_task` provider returns synthetic WAV candidates, and the
 * test reads back the stored take assets, the RPC response and the generation
 * row that `lookup_generations` recovers from.
 */
import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { unpack } from "msgpackr";
import { Asset, initTestDb, Prediction } from "@nodetool-ai/models";
import type { MusicGenerationRecord } from "@nodetool-ai/protocol/api-schemas/timeline.js";
import {
  BaseProvider,
  type MusicTaskParams,
  type MusicTaskResult,
  type ProviderCapability,
  type ProviderId
} from "@nodetool-ai/runtime";
import { encodeWav } from "@nodetool-ai/runtime/media/testing";
import {
  applyGain,
  cutRange,
  peakNormalizeGain,
  samplePeak
} from "@nodetool-ai/timeline/music/process";

import {
  WebSocketClientSession,
  type WebSocketConnection,
  type WebSocketReceiveFrame
} from "../src/websocket-client-session.js";
import { encodeFloatWav, readFloatWav } from "../src/lib/float-wav.js";

/** Bytes per asset id: what the handler stored, and what a test seeded. */
const STORED = vi.hoisted(() => new Map<string, Uint8Array>());

vi.mock("@nodetool-ai/asset-services/thumbnail", async (orig) => ({
  ...(await orig<typeof import("@nodetool-ai/asset-services/thumbnail")>()),
  storeAssetWithThumbnail: vi.fn(
    async (_userId: string, assetId: string, _key: string, bytes: Uint8Array) => {
      STORED.set(assetId, bytes);
    }
  )
}));

vi.mock("@nodetool-ai/asset-services/asset-paths", async (orig) => {
  const actual = await orig<typeof import("../src/lib/asset-paths.js")>();
  return {
    ...actual,
    retrieveAssetBytes: vi.fn(
      async (_adapter: unknown, _userId: string, assetId: string) =>
        STORED.get(assetId) ?? null
    )
  };
});

const USER = "1";
const RATE = 48000;
/** One beat and one bar at 120 BPM in 4/4. */
const BEAT = 24000;
const BAR = 96000;

class MockWebSocket implements WebSocketConnection {
  clientState: "connected" | "disconnected" = "connected";
  applicationState: "connected" | "disconnected" = "connected";
  sentBytes: Uint8Array[] = [];
  sentText: string[] = [];
  queue: WebSocketReceiveFrame[] = [];
  async accept(): Promise<void> {}
  async receive(): Promise<WebSocketReceiveFrame> {
    return this.queue.shift() ?? { type: "websocket.disconnect" };
  }
  async sendBytes(data: Uint8Array): Promise<void> {
    this.sentBytes.push(data);
  }
  async sendText(data: string): Promise<void> {
    this.sentText.push(data);
  }
  async close(): Promise<void> {
    this.clientState = "disconnected";
    this.applicationState = "disconnected";
  }
}

type Script = (params: MusicTaskParams) => Promise<MusicTaskResult>;

/** A `music_task` provider that answers from a script and records each call. */
class ScriptedMusicProvider extends BaseProvider {
  readonly calls: MusicTaskParams[] = [];
  textToMusicCalls = 0;
  constructor(private readonly script: Script) {
    super("acestep" as ProviderId);
  }
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["music_task", "text_to_music"];
  }
  override async musicTask(params: MusicTaskParams): Promise<MusicTaskResult> {
    this.calls.push(params);
    return this.script(params);
  }
  override async textToMusic(): Promise<{ data: Uint8Array; mimeType: string }> {
    this.textToMusicCalls += 1;
    return { data: new Uint8Array([1, 2, 3]), mimeType: "audio/mpeg" };
  }
  async generateMessage(): Promise<never> {
    throw new Error("not a chat provider");
  }
  // eslint-disable-next-line require-yield
  async *generateMessages(): AsyncGenerator<never> {
    throw new Error("not a chat provider");
  }
}

function makeRunner(ws: MockWebSocket, provider: BaseProvider): Promise<WebSocketClientSession> {
  const runner = new WebSocketClientSession({
    resolveExecutor: () => ({ async process() { return {}; } }),
    resolveProvider: async () => provider,
    nodeRegistry: {
      listMetadata: () => [],
      has: () => false,
      resolve: () => ({ async process() { return {}; } }),
      getMetadata: () => undefined,
      createNodeValidator: () => () => undefined
    } as never,
    apiOptions: { metadataRoots: [], registry: {} as never, storage: {} } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => true
  });
  return runner.connect(ws).then(() => runner);
}

/** Send frames, let the session drain them, and return every reply. */
async function exchange(
  provider: BaseProvider,
  frames: Array<Record<string, unknown>>
): Promise<Array<Record<string, unknown>>> {
  const ws = new MockWebSocket();
  const runner = await makeRunner(ws, provider);
  for (const frame of frames) {
    ws.queue.push({ type: "websocket.message", text: JSON.stringify(frame) });
  }
  ws.queue.push({ type: "websocket.disconnect" });
  await runner.receiveMessages();
  await runner.disconnect();
  const count = Math.max(ws.sentBytes.length, ws.sentText.length);
  const replies: Array<Record<string, unknown>> = [];
  for (let index = 0; index < count; index += 1) {
    const bytes = ws.sentBytes[index];
    replies.push(
      (bytes ? unpack(bytes) : JSON.parse(ws.sentText[index] ?? "{}")) as Record<string, unknown>
    );
  }
  return replies;
}

async function rpc(
  provider: BaseProvider,
  command: string,
  requestId: string,
  data: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const replies = await exchange(provider, [{ command, request_id: requestId, data }]);
  const reply = replies.find(
    (frame) => frame.type === "rpc_response" && frame.request_id === requestId
  );
  if (!reply) throw new Error(`No RPC response for ${requestId}`);
  return reply;
}

/** Deterministic interleaved stereo noise. */
function noise(frames: number, seed: number, level = 0.4): Float32Array {
  let state = seed;
  const out = new Float32Array(frames * 2);
  for (let index = 0; index < out.length; index += 1) {
    state = (state * 16807) % 2147483647;
    out[index] = level * (state / 2147483647 - 0.5) * 2;
  }
  return out;
}

/** Interleaved stereo noise bursts every beat from `firstFrame`, at `peak`. */
function clickTrack(frames: number, firstFrame: number, peak: number): Float32Array {
  const out = noise(frames, 3, 0.005);
  let state = 11;
  for (let start = firstFrame; start < frames; start += BEAT) {
    for (let i = 0; i < 1200 && start + i < frames; i += 1) {
      state = (state * 16807) % 2147483647;
      const value = peak * (state / 2147483647 - 0.5) * 2 * Math.exp(-i / 240);
      out[(start + i) * 2] += value;
      out[(start + i) * 2 + 1] += value;
    }
  }
  return out;
}

function wav(samples: Float32Array): Uint8Array {
  return encodeFloatWav(samples, RATE, 2);
}

function storedPcm(assetId: string): Float32Array {
  const bytes = STORED.get(assetId);
  if (!bytes) throw new Error(`asset ${assetId} was not stored`);
  const samples = readFloatWav(bytes, RATE, 2);
  if (!samples) throw new Error(`asset ${assetId} is not a 48 kHz stereo float WAV`);
  return samples;
}

async function seedAsset(bytes: Uint8Array, name: string): Promise<string> {
  const asset = (await Asset.create({
    user_id: USER,
    name,
    content_type: "audio/wav",
    parent_id: USER
  })) as Asset;
  STORED.set(asset.id, bytes);
  return asset.id;
}

function sha(samples: Float32Array): string {
  return createHash("sha256")
    .update(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
    .digest("hex");
}

function sameBits(a: Float32Array, b: Float32Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}

beforeEach(() => {
  initTestDb();
  STORED.clear();
});

describe("music generation: text2music (MM3 exit 2 shape)", () => {
  // Bars 5 and 6 at 120 BPM: a 2-bar target, three segments reach 10 s, and
  // one beat of room for the alignment shift.
  const segments = [0, 1, 2].map((k) => ({
    start_frame: k * 2 * BAR,
    end_frame: (k + 1) * 2 * BAR
  }));
  const requestFrames = 3 * 2 * BAR + BEAT;
  const windowStart = 4 * BAR;
  const offsets = [1440, -960];
  const peaks = [0.5, 0.9];
  const candidates = offsets.map((offset, index) =>
    clickTrack(requestFrames, offset, peaks[index]!)
  );
  const music = {
    task: "text2music",
    bpm: 120,
    key: { tonic: "A", mode: "minor" },
    beats_per_bar: 4,
    beat_unit: 4,
    candidates: 2,
    seed: 42,
    steps: 8,
    request_frames: requestFrames,
    beat_phase_frames: 0,
    segments,
    align: true,
    window_start_frame: windowStart
  };

  function provider(): ScriptedMusicProvider {
    return new ScriptedMusicProvider(async (params) => {
      params.onRunning?.();
      return {
        candidates: candidates.map((samples, index) => ({
          audio: wav(samples),
          seed: 42 + index,
          audioCodes: `codes-${index}`
        })),
        backend: "acestep.cpp@07abf07",
        timing: { queueMs: 5, lmMs: 1200, synthMs: 3400 }
      };
    });
  }

  it("stores three 192000-frame takes per candidate with filled records", async () => {
    const scripted = provider();
    const reply = await rpc(scripted, "generate_media", "music-gen", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "warm analog synth bass groove",
      music
    });
    expect(reply.error).toBeUndefined();
    const result = reply.result as {
      asset_ids: string[];
      music_takes: Array<{ asset_id: string; candidate: number; segment: number; record: MusicGenerationRecord }>;
      timing: Record<string, number>;
    };
    expect(result.asset_ids).toHaveLength(6);
    expect(result.music_takes.map((take) => [take.candidate, take.segment])).toEqual([
      [0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]
    ]);
    expect(result.music_takes.map((take) => take.asset_id)).toEqual(result.asset_ids);
    expect(result.timing).toEqual({ queue_ms: 5, lm_ms: 1200, synth_ms: 3400 });

    const call = scripted.calls[0]!;
    expect(call).toMatchObject({
      task: "text2music",
      model: "acestep-v15-turbo",
      caption: "warm analog synth bass groove",
      bpm: 120,
      key: "A minor",
      timeSignature: 4,
      durationSec: requestFrames / RATE,
      candidates: 2,
      seed: 42,
      steps: 8
    });
    expect(call.signal).toBeInstanceOf(AbortSignal);
    expect(call.sourceAudio).toBeUndefined();

    for (const take of result.music_takes) {
      const pcm = storedPcm(take.asset_id);
      expect(pcm.length / 2).toBe(192000);
      const record = take.record;
      const segment = segments[take.segment]!;
      expect(record).toMatchObject({
        task: "text2music",
        backend: "acestep.cpp@07abf07",
        steps: 8,
        bpm: 120,
        key: { tonic: "A", mode: "minor" },
        beatsPerBar: 4,
        beatUnit: 4,
        seed: 42 + take.candidate,
        audioCodes: `codes-${take.candidate}`,
        candidateIndex: take.candidate,
        segmentIndex: take.segment,
        // Every segment is a take for the same clip: the first segment's
        // place, `segment` segment lengths before this one (item 4).
        targetStartFrame: windowStart,
        targetEndFrame: windowStart + 2 * BAR,
        requestFrames
      });
      expect(record.contextAssetId).toBeUndefined();
      expect(record.splice).toBeUndefined();
      // The measured offset is within 2 ms of the fixture's and was applied.
      expect(record.alignment?.corrected).toBe(true);
      expect(Math.abs(record.alignment!.offsetFrames - offsets[take.candidate]!)).toBeLessThanOrEqual(96);
      expect(record.alignment?.drifting).toBe(false);
      // One -3 dBFS gain per candidate, applied before the cut.
      const source = candidates[take.candidate]!;
      const { gain, gainDb } = peakNormalizeGain(source);
      expect(record.gainDb).toBeCloseTo(gainDb, 9);
      expect(gainDb).toBeCloseTo(-3 - 20 * Math.log10(samplePeak(source)), 9);
      const expected = cutRange(applyGain(source, gain), segment, record.alignment!.offsetFrames);
      expect(sameBits(pcm, expected)).toBe(true);
    }
    // A negative offset pads the head of the first segment with silence.
    const early = result.music_takes.find((take) => take.candidate === 1 && take.segment === 0)!;
    const silent = -early.record.alignment!.offsetFrames;
    expect(silent).toBeGreaterThan(0);
    expect(storedPcm(early.asset_id).subarray(0, silent * 2).every((value) => value === 0)).toBe(true);

    // The row keeps the takes and timing, and lookup_generations returns them.
    const [row] = await Prediction.byRequestIds(USER, ["music-gen"]);
    expect(row?.status).toBe("completed");
    expect(row?.asset_ids).toEqual(result.asset_ids);
    expect(row?.parameters?.music_takes).toEqual(result.music_takes);
    expect(row?.parameters?.timing).toEqual(result.timing);
    const lookup = await rpc(scripted, "lookup_generations", "lookup", {
      request_ids: ["music-gen"]
    });
    const generations = (lookup.result as { generations: Array<Record<string, unknown>> }).generations;
    expect(generations).toHaveLength(1);
    expect(generations[0]).toMatchObject({
      request_id: "music-gen",
      status: "completed",
      asset_ids: result.asset_ids,
      music_takes: result.music_takes,
      timing: result.timing
    });
    expect(generations[0]!.music_status).toBeUndefined();
  });

  it("leaves the cuts in place when align is off, and records the offset as uncorrected", async () => {
    const reply = await rpc(provider(), "generate_media", "music-noalign", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "drums",
      music: { ...music, align: false }
    });
    const result = reply.result as {
      music_takes: Array<{ asset_id: string; candidate: number; segment: number; record: MusicGenerationRecord }>;
    };
    for (const take of result.music_takes) {
      expect(take.record.alignment?.corrected).toBe(false);
      const source = candidates[take.candidate]!;
      const expected = cutRange(applyGain(source, peakNormalizeGain(source).gain), segments[take.segment]!);
      expect(sameBits(storedPcm(take.asset_id), expected)).toBe(true);
    }
  });

  it("names the clip range and the segment index of a replayed segment (item 4)", async () => {
    // A replay of segment 2 renders the window again and cuts that segment only.
    const replay = { ...music, candidates: 1, segments: [{ ...segments[2]!, index: 2 }] };
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: [{ audio: wav(candidates[0]!), seed: 42, audioCodes: "codes-0" }],
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
    }));
    const reply = await rpc(scripted, "generate_media", "music-replay", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "warm analog synth bass groove",
      music: replay
    });
    expect(reply.error).toBeUndefined();
    const result = reply.result as {
      music_takes: Array<{ asset_id: string; candidate: number; segment: number; record: MusicGenerationRecord }>;
    };
    expect(result.music_takes).toHaveLength(1);
    const take = result.music_takes[0]!;
    expect(take.segment).toBe(2);
    expect(take.record).toMatchObject({
      segmentIndex: 2,
      targetStartFrame: windowStart,
      targetEndFrame: windowStart + 2 * BAR
    });
    const source = candidates[0]!;
    const expected = cutRange(applyGain(source, peakNormalizeGain(source).gain), segments[2]!, take.record.alignment!.offsetFrames);
    expect(sameBits(storedPcm(take.asset_id), expected)).toBe(true);
  });

  it("fails when a segment reaches past the decoded audio, and keeps no take (item 2)", async () => {
    // The backend rounded the window down: the last segment's tail is missing.
    const short = clickTrack(6 * BAR - 1920, 1440, 0.5);
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: [{ audio: wav(candidates[0]!), seed: 1 }, { audio: wav(short), seed: 2 }],
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
    }));
    const reply = await rpc(scripted, "generate_media", "music-short", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "drums",
      music: { ...music, align: false }
    });
    expect(JSON.stringify(reply.error)).toMatch(/segment 2 .*past the end of the generated audio/);
    // Candidate 0's takes were stored first; none is kept.
    expect(STORED.size).toBe(3);
    for (const id of STORED.keys()) {
      expect(await Asset.find(USER, id)).toBeNull();
    }
  });

  it("fails when the alignment shift moves the last segment past the audio (item 2)", async () => {
    // Exactly the segments, with the beat 1440 frames late: the shifted cut
    // of the last segment would end past the audio. Without align it fits.
    const exact = clickTrack(6 * BAR, 1440, 0.5);
    const scripted = (): ScriptedMusicProvider =>
      new ScriptedMusicProvider(async () => ({
        candidates: [{ audio: wav(exact), seed: 1 }],
        backend: "acestep.cpp@07abf07",
        timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
      }));
    const aligned = await rpc(scripted(), "generate_media", "music-shifted", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "drums",
      music: { ...music, candidates: 1, align: true }
    });
    expect(JSON.stringify(aligned.error)).toMatch(/past the end of the generated audio/);
    const unaligned = await rpc(scripted(), "generate_media", "music-unshifted", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "drums",
      music: { ...music, candidates: 1, align: false }
    });
    expect(unaligned.error).toBeUndefined();
  });

  it("deletes the takes it stored when a later candidate fails (item 8)", async () => {
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: [
        { audio: wav(candidates[0]!), seed: 1 },
        { audio: new Uint8Array([1, 2, 3, 4]), seed: 2 }
      ],
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
    }));
    const reply = await rpc(scripted, "generate_media", "music-broken", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "drums",
      music
    });
    expect(reply.error).toBeDefined();
    // Candidate 0's three takes were stored before candidate 1 failed.
    const stored = [...STORED.keys()];
    expect(stored).toHaveLength(3);
    for (const id of stored) {
      expect(await Asset.find(USER, id)).toBeNull();
    }
  });

  it("reports queued until the backend starts the job, then running", async () => {
    const seen: unknown[] = [];
    const readStatus = async (): Promise<unknown> => {
      const [row] = await Prediction.byRequestIds(USER, ["music-status"]);
      return row?.parameters?.music_status;
    };
    const scripted = new ScriptedMusicProvider(async (params) => {
      seen.push(await readStatus());
      params.onRunning?.();
      for (let attempt = 0; attempt < 50 && (await readStatus()) !== "running"; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      seen.push(await readStatus());
      return {
        candidates: [{ audio: wav(candidates[0]!), seed: 1 }],
        backend: "acestep.cpp@07abf07",
        timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
      };
    });
    const reply = await rpc(scripted, "generate_media", "music-status", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "pads",
      music: { ...music, candidates: 1 }
    });
    expect(reply.error).toBeUndefined();
    expect(seen).toEqual(["queued", "running"]);
  });
});

describe("music generation: repaint (MM5 exit 2 shape)", () => {
  // An 8-bar parent; the window starts at bar 2 and runs 12 s, and the region
  // is bars 3 and 4, which sit at frames 192000..384000 of the parent.
  const parentFrames = 8 * BAR;
  const requestFrames = 6 * BAR;
  const region = { start_frame: BAR, end_frame: 3 * BAR };
  const splice = { start_frame: 2 * BAR, end_frame: 4 * BAR };

  async function repaint(parentBytes: Uint8Array, requestId: string) {
    const parentId = await seedAsset(parentBytes, "parent.wav");
    const contextBytes = wav(noise(requestFrames, 17));
    const contextId = await seedAsset(contextBytes, "context.wav");
    const candidates = [noise(requestFrames, 23), noise(requestFrames, 29)];
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: candidates.map((samples, index) => ({ audio: wav(samples), seed: 7 + index })),
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 0, synthMs: 900 }
    }));
    const reply = await rpc(scripted, "generate_media", requestId, {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-turbo",
      prompt: "brighter chords",
      music: {
        task: "repaint",
        bpm: 120,
        beats_per_bar: 4,
        beat_unit: 4,
        candidates: 2,
        request_frames: requestFrames,
        context_asset_id: contextId,
        region,
        splice: { parent_asset_id: parentId, ...splice },
        window_start_frame: BAR
      }
    });
    return { reply, scripted, parentId, contextId, contextBytes, candidates };
  }

  it("keeps the parent's frame count and identical audio outside the span", async () => {
    const parent = noise(parentFrames, 31);
    const { reply, scripted, parentId, contextId, contextBytes, candidates } = await repaint(
      wav(parent),
      "music-repaint"
    );
    expect(reply.error).toBeUndefined();
    const call = scripted.calls[0]!;
    expect(call.task).toBe("repaint");
    expect(call.sourceAudio).toEqual(contextBytes);
    expect(call.regionStartSec).toBe(2);
    expect(call.regionEndSec).toBe(6);
    expect(call.durationSec).toBe(12);

    const result = reply.result as {
      asset_ids: string[];
      music_takes: Array<{ asset_id: string; candidate: number; record: MusicGenerationRecord }>;
    };
    expect(result.asset_ids).toHaveLength(2);
    for (const take of result.music_takes) {
      const pcm = storedPcm(take.asset_id);
      expect(pcm.length).toBe(parent.length);
      const before = 2 * splice.start_frame;
      const after = 2 * splice.end_frame;
      expect(sha(pcm.subarray(0, before))).toBe(sha(parent.subarray(0, before)));
      expect(sha(pcm.subarray(after))).toBe(sha(parent.subarray(after)));
      // Between the crossfades the span is the candidate's region, unchanged.
      const generated = cutRange(candidates[take.candidate]!, region);
      expect(
        sameBits(pcm.subarray(before + 2 * 960, after - 2 * 960), generated.subarray(2 * 960, generated.length - 2 * 960))
      ).toBe(true);
      expect(take.record).toMatchObject({
        task: "repaint",
        seed: 7 + take.candidate,
        candidateIndex: take.candidate,
        segmentIndex: 0,
        targetStartFrame: 2 * BAR,
        targetEndFrame: 4 * BAR,
        contextAssetId: contextId,
        contextStartFrame: BAR,
        contextEndFrame: BAR + requestFrames,
        requestFrames,
        splice: { parentAssetId: parentId, startFrame: splice.start_frame, endFrame: splice.end_frame, crossfadeFrames: 960 }
      });
      expect(take.record.splice?.parentResampled).toBeUndefined();
      expect(take.record.gainDb).toBeUndefined();
      expect(take.record.alignment?.corrected).toBe(false);
    }
  });

  it("resamples a parent that is not 48 kHz stereo once and says so", async () => {
    // 16 s of 16-bit mono at 44.1 kHz decodes to the same 16 s at 48 kHz.
    const mono = new Float32Array(16 * 44100);
    for (let index = 0; index < mono.length; index += 1) {
      mono[index] = 0.25 * Math.sin((2 * Math.PI * 220 * index) / 44100);
    }
    const { reply } = await repaint(encodeWav(mono, 44100, 1), "music-resampled");
    expect(reply.error).toBeUndefined();
    const result = reply.result as {
      music_takes: Array<{ asset_id: string; record: MusicGenerationRecord }>;
    };
    const take = result.music_takes[0]!;
    expect(take.record.splice?.parentResampled).toBe(true);
    expect(Math.abs(storedPcm(take.asset_id).length / 2 - parentFrames)).toBeLessThanOrEqual(1);
  });
});

describe("music generation: lego", () => {
  it("cuts the region at the backend's level and passes the track role", async () => {
    const requestFrames = 5 * BAR;
    const region = { start_frame: BAR, end_frame: 3 * BAR };
    const contextId = await seedAsset(wav(noise(requestFrames, 41)), "mix.wav");
    const candidate = noise(requestFrames, 43, 0.2);
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: [{ audio: wav(candidate), seed: 9, audioCodes: "lego-codes" }],
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 400, synthMs: 800 }
    }));
    const reply = await rpc(scripted, "generate_media", "music-lego", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-base",
      prompt: "round electric bass",
      music: {
        task: "lego",
        bpm: 120,
        beats_per_bar: 4,
        beat_unit: 4,
        candidates: 1,
        request_frames: requestFrames,
        context_asset_id: contextId,
        region,
        track_role: "bass",
        window_start_frame: 0
      }
    });
    expect(reply.error).toBeUndefined();
    expect(scripted.calls[0]).toMatchObject({ task: "lego", trackRole: "bass", model: "acestep-v15-base" });
    const result = reply.result as {
      music_takes: Array<{ asset_id: string; record: MusicGenerationRecord }>;
    };
    expect(result.music_takes).toHaveLength(1);
    const take = result.music_takes[0]!;
    expect(sameBits(storedPcm(take.asset_id), cutRange(candidate, region))).toBe(true);
    expect(take.record).toMatchObject({
      task: "lego",
      trackRole: "bass",
      targetStartFrame: BAR,
      targetEndFrame: 3 * BAR,
      audioCodes: "lego-codes"
    });
    expect(take.record.gainDb).toBeUndefined();
  });
});

describe("music generation: short backend audio (item 2)", () => {
  it("fails a lego request whose region reaches past the decoded audio", async () => {
    const requestFrames = 5 * BAR;
    const region = { start_frame: 3 * BAR, end_frame: 5 * BAR };
    const contextId = await seedAsset(wav(noise(requestFrames, 41)), "mix.wav");
    const scripted = new ScriptedMusicProvider(async () => ({
      candidates: [{ audio: wav(noise(requestFrames - 3840, 43, 0.2)), seed: 9 }],
      backend: "acestep.cpp@07abf07",
      timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
    }));
    const reply = await rpc(scripted, "generate_media", "music-lego-short", {
      mode: "music",
      provider: "acestep",
      model: "acestep-v15-base",
      prompt: "round electric bass",
      music: {
        task: "lego",
        bpm: 120,
        beats_per_bar: 4,
        beat_unit: 4,
        candidates: 1,
        request_frames: requestFrames,
        context_asset_id: contextId,
        region,
        track_role: "bass"
      }
    });
    expect(JSON.stringify(reply.error)).toMatch(/region .*past the end of the generated audio/);
    expect(STORED.size).toBe(1);
  });
});

describe("music generation: routing and refusals (MD17)", () => {
  it("runs the plain text-to-music path when the request has no music object", async () => {
    const scripted = new ScriptedMusicProvider(async () => {
      throw new Error("musicTask must not run");
    });
    const reply = await rpc(scripted, "generate_media", "plain-music", {
      mode: "music",
      provider: "acestep",
      model: "music-1",
      prompt: "Warm ambient piano",
      duration: 30
    });
    expect(reply.error).toBeUndefined();
    expect(scripted.calls).toHaveLength(0);
    expect(scripted.textToMusicCalls).toBe(1);
    const [row] = await Prediction.byRequestIds(USER, ["plain-music"]);
    expect(row?.parameters?.music_takes).toBeUndefined();
  });

  it("refuses a provider without the music_task capability", async () => {
    class PlainMusicProvider extends ScriptedMusicProvider {
      protected override declaredCapabilities(): readonly ProviderCapability[] {
        return ["text_to_music"];
      }
    }
    const scripted = new PlainMusicProvider(async () => {
      throw new Error("musicTask must not run");
    });
    const reply = await rpc(scripted, "generate_media", "no-capability", {
      mode: "music",
      provider: "other",
      model: "music-1",
      prompt: "x",
      music: {
        task: "text2music",
        bpm: 120,
        beats_per_bar: 4,
        beat_unit: 4,
        candidates: 1,
        request_frames: 10 * RATE,
        segments: [{ start_frame: 0, end_frame: 10 * RATE }]
      }
    });
    expect(JSON.stringify(reply.error)).toMatch(/does not support the music_task capability/);
    expect(scripted.calls).toHaveLength(0);
  });

  it("refuses a music object that fails the schema", async () => {
    const scripted = new ScriptedMusicProvider(async () => {
      throw new Error("musicTask must not run");
    });
    const reply = await rpc(scripted, "generate_media", "bad-music", {
      mode: "music",
      provider: "acestep",
      model: "music-1",
      prompt: "x",
      music: { task: "repaint", bpm: 120, beats_per_bar: 4, beat_unit: 4, candidates: 1, request_frames: 10 * RATE }
    });
    expect(JSON.stringify(reply.error)).toMatch(/context_asset_id/);
    expect(scripted.calls).toHaveLength(0);
  });

  it("aborts the backend call through the signal and closes the row as cancelled", async () => {
    const controller = new AbortController();
    let received: AbortSignal | undefined;
    const scripted = new ScriptedMusicProvider(
      (params) =>
        new Promise((_resolve, reject) => {
          received = params.signal;
          params.signal?.addEventListener("abort", () => reject(new Error("Generation cancelled")));
          controller.abort(new Error("Generation cancelled"));
        })
    );
    const runner = new WebSocketClientSession({
      userId: USER,
      resolveExecutor: () => undefined as never,
      resolveProvider: (async () => scripted) as never
    });
    await expect(
      runner.inference.runDirectMediaGeneration({
        mode: "music",
        provider: "acestep",
        model: "acestep-v15-turbo",
        prompt: "x",
        requestId: "music-cancel",
        signal: controller.signal,
        music: {
          task: "text2music",
          bpm: 120,
          beats_per_bar: 4,
          beat_unit: 4,
          candidates: 1,
          request_frames: 10 * RATE,
          segments: [{ start_frame: 0, end_frame: 10 * RATE }]
        }
      })
    ).rejects.toThrow(/cancelled/);
    expect(received?.aborted).toBe(true);
    const [row] = await Prediction.byRequestIds(USER, ["music-cancel"]);
    expect(row?.status).toBe("cancelled");
    expect(STORED.size).toBe(0);
  });
});

describe("music generation: event loop (backlog M3)", () => {
  // measureAlignment takes about 1 s per minute of window. Run synchronously
  // in the handler, it stalls every other request on the server for that long.
  it("keeps the event loop turning while it processes a long window", async () => {
    const frames = 90 * RATE;
    const audio = wav(clickTrack(frames, 0, 0.5));
    let last = 0;
    let longestGap = 0;
    let ticker: ReturnType<typeof setInterval> | undefined;
    // The clock starts when the backend answers: what follows is the handler's own work.
    const scripted = new ScriptedMusicProvider(async () => {
      last = performance.now();
      ticker = setInterval(() => {
        const now = performance.now();
        longestGap = Math.max(longestGap, now - last);
        last = now;
      }, 5);
      return {
        candidates: [{ audio, seed: 1 }],
        backend: "acestep.cpp@07abf07",
        timing: { queueMs: 0, lmMs: 0, synthMs: 0 }
      };
    });
    let reply: Record<string, unknown>;
    try {
      reply = await rpc(scripted, "generate_media", "music-long", {
        mode: "music",
        provider: "acestep",
        model: "acestep-v15-turbo",
        prompt: "x",
        music: {
          task: "text2music",
          bpm: 120,
          beats_per_bar: 4,
          beat_unit: 4,
          candidates: 1,
          request_frames: frames,
          beat_phase_frames: 0,
          segments: [{ start_frame: 0, end_frame: frames }],
          // The measurement runs either way; align off keeps the cut in place.
          align: false
        }
      });
    } finally {
      clearInterval(ticker);
      longestGap = Math.max(longestGap, performance.now() - last);
    }
    expect(reply.error).toBeUndefined();
    const result = reply.result as { music_takes: Array<{ record: MusicGenerationRecord }> };
    expect(result.music_takes[0]!.record.alignment?.confidence).toBeGreaterThan(3);
    // Before the fix the measurement held the loop for 2.2 to 2.5 s in one
    // piece. The gain, the mono mix and the WAV encode of 90 s still run
    // whole: about 250 ms together on a loaded 4-core machine.
    expect(longestGap).toBeLessThan(500);
  }, 60_000);
});
