import { afterEach, describe, expect, it, vi } from "vitest";
import { gameAssetBinding, gameSnapshot, type GameEvent } from "@nodetool-ai/protocol";
import { GameAudioPlayer } from "../src/audio.js";

class FakeParam {
  value = 1;
  readonly calls: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number): void { this.value = value; this.calls.push(["set", value, time]); }
  linearRampToValueAtTime(value: number, time: number): void { this.value = value; this.calls.push(["ramp", value, time]); }
  cancelScheduledValues(time: number): void { this.calls.push(["cancel", this.value, time]); }
}

class FakeGain {
  readonly gain = new FakeParam();
  connect(destination: unknown): unknown { return destination; }
  disconnect(): void {}
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  connect(destination: unknown): unknown { return destination; }
  disconnect(): void {}
  start(_when: number, offset = 0): void { this.starts.push(offset); }
  stop(when: number): void { this.stops.push(when); this.onended?.(); }
}

class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 5;
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  createBufferSource(): FakeSource { const source = new FakeSource(); this.sources.push(source); return source; }
  createGain(): FakeGain { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  decodeAudioData(): Promise<AudioBuffer> { return Promise.resolve({ duration: 2 } as AudioBuffer); }
  resume(): Promise<void> { this.state = "running"; return Promise.resolve(); }
  suspend(): Promise<void> { this.state = "suspended"; return Promise.resolve(); }
  close(): Promise<void> { this.state = "closed"; return Promise.resolve(); }
}

class DelayedContext extends FakeContext {
  readonly resolveOldDecodes: Array<(buffer: AudioBuffer) => void> = [];
  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    if (new Uint8Array(bytes)[0] === 2) return Promise.resolve({ duration: 2 } as AudioBuffer);
    return new Promise((resolve) => this.resolveOldDecodes.push(resolve));
  }
}

function snapshot(tick: number, startTick: number, assetId = "music") {
  return gameSnapshot.parse({ gameRevision: "r", engineVersion: "1", sceneId: "room", tick, rngState: 0,
    score: 0, won: false, entities: [], music: { voiceId: "scene:room:music", assetId, startTick,
      volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30 } });
}

function player(context: FakeContext) {
  const status = vi.fn();
  // The fake implements only the Web Audio operations used by this playback boundary.
  const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60,
    assets: { music: { assetId: "./music.wav", digest: "d", mediaKind: "audio", width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" },
      music2: { assetId: "./music2.wav", digest: "f", mediaKind: "audio", width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" },
      effect: { assetId: "./effect.wav", digest: "e", mediaKind: "audio", width: 1, height: 1, pivot: { x: 0.5, y: 0.5 }, sampling: "nearest" } },
    resolveAsset: async (binding) => binding.assetId, status });
  return { audio, status };
}

afterEach(() => vi.unstubAllGlobals());

describe("shared game audio lifecycle", () => {
  it("does not start old scene music or effects after decoding finishes in the next scene", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Uint8Array([url.includes("music2") ? 2 : 1]))));
    const context = new DelayedContext();
    const { audio } = player(context);
    await audio.unlock();
    audio.sync(snapshot(0, 0));
    audio.handle({ kind: "audio", action: "start", voiceId: "effect:room:hit:1:0", assetId: "effect",
      loop: false, volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 });
    await vi.waitFor(() => expect(context.resolveOldDecodes).toHaveLength(2));

    const nextScene = { ...snapshot(1, 1, "music2"), sceneId: "next",
      music: { ...snapshot(1, 1, "music2").music!, voiceId: "scene:next:music" } };
    audio.sync({ ...nextScene, music: null });
    audio.sync(nextScene);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(context.sources[0].loop).toBe(true);

    for (const resolve of context.resolveOldDecodes) resolve({ duration: 2 } as AudioBuffer);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(context.sources).toHaveLength(1);
    audio.dispose();
  });

  it("replaces pending music with the same voice ID and cancels a stopped pending effect", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Uint8Array([url.includes("music2") ? 2 : 1]))));
    const context = new DelayedContext();
    const { audio } = player(context);
    await audio.unlock();
    audio.sync(snapshot(0, 0));
    audio.handle({ kind: "audio", action: "start", voiceId: "effect:room:hit:1:0", assetId: "effect",
      loop: false, volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 });
    await vi.waitFor(() => expect(context.resolveOldDecodes).toHaveLength(2));

    audio.handle({ kind: "audio", action: "stop", voiceId: "effect:room:hit:1:0", fadeOutTicks: 0 });
    audio.sync(snapshot(0, 0, "music2"));
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    for (const resolve of context.resolveOldDecodes) resolve({ duration: 2 } as AudioBuffer);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].loop).toBe(true);
    audio.dispose();
  });

  it("keeps an effect emitted for the destination scene before its snapshot is synced", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new DelayedContext();
    const { audio } = player(context);
    await audio.unlock();
    audio.sync({ ...snapshot(0, 0), music: null });
    const effect: GameEvent = { kind: "audio", action: "start", voiceId: "effect:room:hit:1:0",
      assetId: "effect", loop: false, volume: 0.5, fadeInTicks: 0, fadeOutTicks: 0 };
    audio.handle(effect);
    await vi.waitFor(() => expect(context.resolveOldDecodes).toHaveLength(1));
    audio.handle({ ...effect, voiceId: "effect:next:hit:1:0" });
    audio.sync({ ...snapshot(1, 1), sceneId: "next", music: null });
    context.resolveOldDecodes[0]({ duration: 2 } as AudioBuffer);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].loop).toBe(false);
    audio.dispose();
  });
  it("starts music after a gesture, retains one voice, and seeks from logical ticks on load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const { audio } = player(context);
    audio.sync(snapshot(0, 0));
    expect(context.sources).toHaveLength(0);
    await audio.unlock();
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    audio.sync(snapshot(90, 0));
    expect(context.sources).toHaveLength(1);
    audio.pause();
    expect(context.state).toBe("suspended");
    audio.reset(snapshot(90, 10));
    expect(context.sources[0].stops).toHaveLength(1);
    audio.resume();
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    expect(context.sources[1].starts[0]).toBeCloseTo(80 / 60);
    audio.sync({ ...snapshot(90, 10), music: null });
    expect(context.sources[1].stops).toEqual([5.5]);
    audio.dispose();
    expect(context.state).toBe("closed");
  });

  it("schedules gain fades and lets effects overlap without replaying after reset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const { audio } = player(context);
    await audio.unlock();
    audio.sync(snapshot(0, 0));
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(context.gains[0].gain.calls).toEqual([["set", 0, 5], ["ramp", 0.4, 6]]);
    const event: GameEvent = { kind: "audio", action: "start", voiceId: "hit:1", assetId: "effect", loop: false,
      volume: 0.6, fadeInTicks: 0, fadeOutTicks: 0 };
    audio.handle(event);
    audio.handle({ ...event, voiceId: "hit:2" });
    await vi.waitFor(() => expect(context.sources).toHaveLength(3));
    audio.reset(snapshot(120, 120));
    await vi.waitFor(() => expect(context.sources).toHaveLength(4));
    expect(context.sources.slice(0, 3).every((source) => source.stops.length === 1)).toBe(true);
    audio.dispose();
  });
});

it("keeps decoded audio through unchanged bindings and reloads a changed slot", async () => {
  const fetchAsset = vi.fn(async () => new Response(new Uint8Array([1])));
  vi.stubGlobal("fetch", fetchAsset);
  const context = new FakeContext();
  const binding = gameAssetBinding.parse({ assetId: "./music.wav", digest: "d", mediaKind: "audio", width: 1, height: 1 });
  const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60,
    assets: { music: binding }, resolveAsset: async (asset) => asset.assetId, status: vi.fn() });
  audio.preload();
  await vi.waitFor(() => expect(fetchAsset).toHaveBeenCalledTimes(1));
  for (let index = 0; index < 10; index++) { audio.updateAssets({ music: { ...binding } }); }
  expect(fetchAsset).toHaveBeenCalledTimes(1);
  audio.updateAssets({ music: { ...binding, assetId: "./replacement.wav" } });
  await vi.waitFor(() => expect(fetchAsset).toHaveBeenCalledTimes(2));
  audio.dispose();
});

for (const delayed of [false, true]) {
  it(`replaces ${delayed ? "pending" : "playing"} music when its asset slot changes`, async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(new Uint8Array([url.includes("replacement") ? 2 : 1]))));
    const context = delayed ? new DelayedContext() : new FakeContext();
    const binding = gameAssetBinding.parse({ assetId: "./music.wav", digest: "old", mediaKind: "audio", width: 1, height: 1 });
    const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60,
      assets: { music: binding }, resolveAsset: async (asset) => asset.assetId, status: vi.fn() });
    await audio.unlock();
    audio.sync(snapshot(90, 0));
    if (context instanceof DelayedContext) {
      await vi.waitFor(() => expect(context.resolveOldDecodes).toHaveLength(1));
    } else {
      await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    }
    audio.updateAssets({ music: { ...binding, assetId: "./replacement.wav", digest: "new" } });
    await vi.waitFor(() => expect(context.sources).toHaveLength(delayed ? 1 : 2));
    expect(context.sources.at(-1)!.starts).toEqual([1.5]);
    if (context instanceof DelayedContext) {
      context.resolveOldDecodes[0]({ duration: 2 } as AudioBuffer);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(context.sources).toHaveLength(1);
    } else {
      expect(context.sources[0].stops).toHaveLength(1);
    }
    audio.updateAssets({});
    expect(context.sources.at(-1)!.stops).toHaveLength(1);
    audio.dispose();
  });
}
