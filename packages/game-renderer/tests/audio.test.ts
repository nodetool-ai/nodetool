import { afterEach, describe, expect, it, vi } from "vitest";
import { gameAssetBinding, gameSnapshot, type GameEvent, type GameRenderFrame } from "@nodetool-ai/protocol";
import { GameAudioPlayer, gameAudioSpatialView2D, type GameAudioOptions } from "../src/audio.js";

class FakeParam {
  value = 1;
  readonly calls: Array<[string, number, number]> = [];
  setValueAtTime(value: number, time: number): void { this.value = value; this.calls.push(["set", value, time]); }
  linearRampToValueAtTime(value: number, time: number): void { this.value = value; this.calls.push(["ramp", value, time]); }
  exponentialRampToValueAtTime(value: number, time: number): void { this.value = value; this.calls.push(["exponential", value, time]); }
  setTargetAtTime(value: number, time: number): void { this.value = value; this.calls.push(["target", value, time]); }
  cancelScheduledValues(time: number): void { this.calls.push(["cancel", this.value, time]); }
}

class FakeNode {
  readonly outputs: unknown[] = [];
  connect<Destination>(destination: Destination): Destination { this.outputs.push(destination); return destination; }
  disconnect(): void { this.outputs.length = 0; }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = "lowpass";
  readonly Q = new FakeParam();
  readonly frequency = new FakeParam();
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam();
  readonly knee = new FakeParam();
  readonly ratio = new FakeParam();
  readonly attack = new FakeParam();
  readonly release = new FakeParam();
}

class FakePanner extends FakeNode {
  panningModel = "equalpower";
  distanceModel = "inverse";
  refDistance = 1;
  maxDistance = 10000;
  rolloffFactor = 1;
  coneInnerAngle = 360;
  coneOuterAngle = 360;
  coneOuterGain = 0;
  readonly positionX = new FakeParam();
  readonly positionY = new FakeParam();
  readonly positionZ = new FakeParam();
  readonly orientationX = new FakeParam();
  readonly orientationY = new FakeParam();
  readonly orientationZ = new FakeParam();
}

class FakeListener {
  readonly positionX = new FakeParam();
  readonly positionY = new FakeParam();
  readonly positionZ = new FakeParam();
  readonly forwardX = new FakeParam();
  readonly forwardY = new FakeParam();
  readonly forwardZ = new FakeParam();
  readonly upX = new FakeParam();
  readonly upY = new FakeParam();
  readonly upZ = new FakeParam();
}

class FakeSource extends FakeNode {
  readonly playbackRate = new FakeParam();
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  readonly starts: number[] = [];
  readonly stops: number[] = [];
  start(_when: number, offset = 0): void { this.starts.push(offset); }
  stop(when: number): void { this.stops.push(when); this.onended?.(); }
}

class FakeContext {
  state: AudioContextState = "suspended";
  currentTime = 5;
  readonly sampleRate = 48000;
  readonly destination = {};
  readonly sources: FakeSource[] = [];
  readonly gains: FakeGain[] = [];
  readonly panners: FakePanner[] = [];
  readonly mediaSources: FakeNode[] = [];
  createMediaElementSource(): FakeNode { const source = new FakeNode(); this.mediaSources.push(source); return source; }
  readonly listener = new FakeListener();
  createPanner(): FakePanner { const panner = new FakePanner(); this.panners.push(panner); return panner; }
  createBufferSource(): FakeSource { const source = new FakeSource(); this.sources.push(source); return source; }
  createGain(): FakeGain { const gain = new FakeGain(); this.gains.push(gain); return gain; }
  createBiquadFilter(): FakeFilter { return new FakeFilter(); }
  createDynamicsCompressor(): FakeCompressor { return new FakeCompressor(); }
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
    expect((context.sources[0].outputs[0] as FakeGain).gain.calls).toEqual([["set", 0, 5], ["ramp", 0.4, 6]]);
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

describe("game audio mixer routing", () => {
  it("routes voices to their buses, ducks music under voice, and follows trigger events", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const effect = gameAssetBinding.parse({ assetId: "./line.wav", digest: "l", mediaKind: "audio", width: 1, height: 1 });
    const music = gameAssetBinding.parse({ assetId: "./music.wav", digest: "m", mediaKind: "audio", width: 1, height: 1 });
    const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60, assets: { line: effect, music },
      resolveAsset: async (asset) => asset.assetId, status: vi.fn(),
      mixer: { assetBuses: { line: "voice" }, snapshots: { calm: { buses: { music: { volume: 0.5 } } } },
        transitions: [{ on: { kind: "trigger", event: "rest" }, snapshot: "calm" }] } });
    await audio.unlock();
    audio.sync(snapshot(0, 0));
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    audio.handle({ kind: "audio", action: "start", voiceId: "line:1", assetId: "line", loop: false, volume: 1, fadeInTicks: 0, fadeOutTicks: 0 });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    const musicVoiceGain = context.sources[0].outputs[0] as FakeGain;
    const lineVoiceGain = context.sources[1].outputs[0] as FakeGain;
    expect(musicVoiceGain.outputs[0]).not.toBe(lineVoiceGain.outputs[0]);
    expect(audio.mixerState().buses.voice.activeVoices).toBe(1);
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    expect(audio.mixerState().buses.music.duckGain).toBeCloseTo(0.35);

    audio.handle({ kind: "trigger", event: "rest", entityId: "bench" });
    expect(context.sources).toHaveLength(2);
    expect(audio.mixerState().snapshot).toBe("calm");
    expect(audio.mixerState().buses.music.volume).toBe(0.5);

    audio.handle({ kind: "audio", action: "stop", voiceId: "line:1", fadeOutTicks: 0 });
    expect(audio.mixerState().buses.music.duckGain).toBe(1);
    audio.reset(snapshot(10, 10));
    expect(audio.mixerState().snapshot).toBe("base");
    audio.dispose();
  });

  it("reports invalid mixer settings and plays through the default mix", () => {
    const status = vi.fn();
    const audio = new GameAudioPlayer({ context: new FakeContext() as unknown as AudioContext, tickRate: 60, assets: {},
      resolveAsset: async () => null, status, mixer: { assetBuses: { line: "missing" } } });
    expect(status).toHaveBeenCalledWith(expect.stringContaining("Audio mixer settings are invalid"));
    expect(Object.keys(audio.mixerState().buses).sort()).toEqual(["master", "music", "sfx", "ui", "voice"]);
    audio.updateMixer({ buses: { ambience: { volume: 0.5 } } });
    expect(audio.mixerState().buses.ambience.volume).toBe(0.5);
    audio.setBusVolume("music", 0.25);
    expect(audio.mixerState().buses.music.userVolume).toBe(0.25);
    audio.dispose();
  });
});

describe("spatial game audio voices", () => {
  function view(emitterX: number, cameraX = 0): ReturnType<typeof gameAudioSpatialView2D> {
    const frame: GameRenderFrame = { tick: 1, width: 16, height: 9, pixelsPerUnit: 32, camera: { x: cameraX, y: 0, zoom: 1 }, tiles: [], hud: [],
      sprites: [{ entityId: "radio", assetId: "sprite", x: emitterX, y: 0, previousX: emitterX, previousY: 0, rotation: 0, scaleX: 1, scaleY: 1,
        width: 1, height: 1, layer: 0 }] };
    return gameAudioSpatialView2D(frame, 1);
  }
  const emitter = { entityId: "radio", position: { x: 5, y: 0, z: 0 }, minDistance: 2, maxDistance: 30, rolloff: 0.5,
    distanceModel: "linear" as const, doppler: 1 };

  it("routes a spatial effect through a panner that follows its emitter, counts it as a voice and releases it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const effect = gameAssetBinding.parse({ assetId: "./hum.wav", digest: "h", mediaKind: "audio", width: 1, height: 1 });
    const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60, assets: { hum: effect },
      resolveAsset: async (asset) => asset.assetId, status: vi.fn(), spatialQuality: "low" });
    await audio.unlock();
    audio.handle({ kind: "audio", action: "start", voiceId: "plain:1", assetId: "hum", loop: false, volume: 1, fadeInTicks: 0, fadeOutTicks: 0 });
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(context.panners).toHaveLength(0);

    audio.handle({ kind: "audio", action: "start", voiceId: "spatial:1", assetId: "hum", loop: false, volume: 1, fadeInTicks: 0, fadeOutTicks: 0, emitter });
    await vi.waitFor(() => expect(context.sources).toHaveLength(2));
    const [panner] = context.panners;
    const voiceGain = context.sources[1].outputs[0] as FakeGain;
    expect(voiceGain.outputs[0]).toBe(panner);
    expect(panner.outputs[0]).toBe((context.sources[0].outputs[0] as FakeGain).outputs[0]);
    expect([panner.panningModel, panner.distanceModel, panner.refDistance, panner.maxDistance, panner.rolloffFactor]).toEqual(["equalpower", "linear", 2, 30, 0.5]);
    expect(panner.positionX.value).toBe(5);
    expect(audio.mixerState().buses.sfx.activeVoices).toBe(2);

    audio.updateSpatial(view(3, 1));
    expect(panner.positionX.calls.at(-1)).toEqual(["target", 3, 5]);
    expect(context.listener.positionX.value).toBe(1);
    context.currentTime = 5.1;
    audio.updateSpatial(view(2, 1));
    expect(context.sources[1].playbackRate.value).toBeGreaterThan(1);
    audio.updateSpatial({ listener: view(0).listener, emitter: () => undefined });
    expect(panner.positionX.value).toBe(2);

    context.sources[1].stop(6);
    expect(panner.outputs).toHaveLength(0);
    const moves = panner.positionX.calls.length;
    audio.updateSpatial(view(9));
    expect(panner.positionX.calls).toHaveLength(moves);
    expect(audio.mixerState().buses.sfx.activeVoices).toBe(1);
    audio.dispose();
  });

  it("starts a spatial voice at the emitter's latest rendered position", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const effect = gameAssetBinding.parse({ assetId: "./hum.wav", digest: "h", mediaKind: "audio", width: 1, height: 1 });
    const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60, assets: { hum: effect },
      resolveAsset: async (asset) => asset.assetId, status: vi.fn() });
    await audio.unlock();
    audio.updateSpatial(view(-4));
    audio.handle({ kind: "audio", action: "start", voiceId: "spatial:1", assetId: "hum", loop: false, volume: 1, fadeInTicks: 0, fadeOutTicks: 0, emitter });
    await vi.waitFor(() => expect(context.panners).toHaveLength(1));
    expect(context.panners[0].panningModel).toBe("HRTF");
    expect(context.panners[0].positionX.value).toBe(-4);
    audio.dispose();
  });
});


class FakeMedia extends EventTarget {
  src = "";
  crossOrigin: string | null = null;
  preload = "";
  loop = false;
  readyState = 0;
  currentTime = 0;
  duration = 300;
  paused = true;
  play = vi.fn(async () => { this.paused = false; });
  pause = vi.fn(() => { this.paused = true; });
  load = vi.fn();
  removeAttribute(name: string): void { if (name === "src") this.src = ""; }
  metadata(duration = 300): void { this.duration = duration; this.readyState = 1; this.dispatchEvent(new Event("loadedmetadata")); }
}

function streamedPlayer(context: FakeContext, resolveAsset: GameAudioOptions["resolveAsset"] = async (asset) => asset.assetId) {
  const media: FakeMedia[] = [];
  vi.stubGlobal("Audio", class extends FakeMedia { constructor() { super(); media.push(this); } });
  const binding = gameAssetBinding.parse({ assetId: "./long.wav", digest: "music", mediaKind: "audio", width: 1, height: 1 });
  const status = vi.fn();
  const audio = new GameAudioPlayer({ context: context as unknown as AudioContext, tickRate: 60,
    assets: { music: binding }, scenes: [{ id: "room", music: { assetId: "music", volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30,
      streaming: { loopStartSeconds: 10, loopEndSeconds: 20 } } }], resolveAsset, status });
  return { audio, media, status, binding };
}

describe("streamed scene music", () => {
  it("starts the fade-in when playback is ready instead of consuming it while media buffers", async () => {
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    let completePlay: (() => void) | undefined;
    media[0].play.mockImplementationOnce(() => new Promise<void>((resolve) => { completePlay = resolve; }));
    media[0].metadata();
    const voiceGain = context.mediaSources[0].outputs[0] as FakeGain;
    expect(voiceGain.gain.calls).toEqual([["set", 0, 5]]);
    completePlay?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(voiceGain.gain.calls.slice(-2)).toEqual([["set", 0, 5], ["ramp", 0.4, 6]]);
    audio.dispose();
  });

  it("uses native whole-track looping and corrects hardware drift from the snapshot tick on resume", async () => {
    const { audio, media } = streamedPlayer(new FakeContext());
    audio.updateScenes([{ id: "room", music: { assetId: "music", volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30,
      streaming: { loopStartSeconds: 0 } } }]);
    audio.sync(snapshot(18060, 0)); // 301 seconds in a 300-second track.
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    expect(media[0].currentTime).toBe(1);
    expect(media[0].loop).toBe(true);
    media[0].currentTime = 19;
    audio.pause();
    audio.sync(snapshot(18120, 0));
    audio.resume();
    await vi.waitFor(() => expect(media[0].paused).toBe(false));
    expect(media[0].currentTime).toBe(2);
    expect(media).toHaveLength(1);
    audio.dispose();
  });

  it("preserves the intro and wraps custom loop points including a delayed boundary notification", async () => {
    const { audio, media } = streamedPlayer(new FakeContext());
    audio.sync(snapshot(300, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    expect(media[0].currentTime).toBe(5);
    media[0].currentTime = 20.25;
    media[0].dispatchEvent(new Event("timeupdate"));
    expect(media[0].currentTime).toBe(10.25);
    media[0].currentTime = 300;
    media[0].dispatchEvent(new Event("ended"));
    expect(media[0].currentTime).toBe(10);
    expect(media[0].play).toHaveBeenCalledTimes(2);
    audio.dispose();
  });

  it("reports invalid track loop points once and retries with edited scene settings", async () => {
    const { audio, media, status } = streamedPlayer(new FakeContext());
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata(8);
    expect(status).toHaveBeenCalledWith(expect.stringContaining("loop points must fit"));
    for (let tick = 1; tick <= 120; tick++) audio.sync(snapshot(tick, 0));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(media).toHaveLength(1);
    expect(status).toHaveBeenCalledTimes(1);
    audio.updateScenes([{ id: "room", music: { assetId: "music", volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30,
      streaming: { loopStartSeconds: 2, loopEndSeconds: 6 } } }]);
    await vi.waitFor(() => expect(media).toHaveLength(2));
    media[1].metadata(8);
    expect(media[1].currentTime).toBe(2);
    expect(media[1].paused).toBe(false);
    audio.dispose();
  });

  it("discards a pending URL on reset and a changed asset binding", async () => {
    const resolveOld: Array<(url: string | null) => void> = [];
    const context = new FakeContext();
    const { audio, media, status, binding } = streamedPlayer(context, (asset) => asset.digest === "music" ?
      new Promise((resolve) => { resolveOld.push(resolve); }) : Promise.resolve(asset.assetId));
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    expect(media).toHaveLength(0);
    audio.reset(snapshot(90, 10));
    audio.updateAssets({ music: { ...binding, digest: "replacement", assetId: "./replacement.wav" } });
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    expect(media[0].src).toBe("./replacement.wav");
    expect(media[0].currentTime).toBeCloseTo(80 / 60);
    expect(resolveOld).toHaveLength(2);
    for (const resolve of resolveOld) resolve(null);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(media).toHaveLength(1);
    expect(status).not.toHaveBeenCalled();
    audio.dispose();
  });

  it("removes old metadata listeners on reset and starts one new voice at the restored tick", async () => {
    const { audio, media } = streamedPlayer(new FakeContext());
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    audio.reset(snapshot(90, 10));
    await vi.waitFor(() => expect(media).toHaveLength(2));
    media[0].metadata();
    expect(media[0].play).not.toHaveBeenCalled();
    expect(media[0].src).toBe("");
    media[1].metadata();
    expect(media[1].currentTime).toBeCloseTo(80 / 60);
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    audio.dispose();
  });

  it("switches edited scene music between streaming and decoded playback without changing its logical start", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    audio.sync(snapshot(1650, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    audio.updateScenes([{ id: "room", music: { assetId: "music", volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30 } }]);
    await vi.waitFor(() => expect(context.sources).toHaveLength(1));
    expect(media[0].src).toBe("");
    expect(context.sources[0].starts).toEqual([1.5]);
    audio.updateScenes([{ id: "room", music: { assetId: "music", volume: 0.4, fadeInTicks: 60, fadeOutTicks: 30,
      streaming: { loopStartSeconds: 12, loopEndSeconds: 90 } } }]);
    await vi.waitFor(() => expect(media).toHaveLength(2));
    expect(context.sources[0].stops).toHaveLength(1);
    media[1].metadata();
    expect(media[1].currentTime).toBe(27.5);
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    audio.dispose();
  });

  it("does not let an older play completion pause a newer resumed playback", async () => {
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    let completeOldPlay: (() => void) | undefined;
    media[0].play.mockImplementationOnce(() => new Promise<void>((resolve) => { completeOldPlay = resolve; }));
    media[0].metadata();
    audio.pause();
    audio.resume();
    await vi.waitFor(() => expect(media[0].paused).toBe(false));
    completeOldPlay?.();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(media[0].paused).toBe(false);
    audio.dispose();
  });

  it("freezes both tracks of a crossfade during pause and releases the outgoing track after resume", async () => {
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    const first = snapshot(0, 0);
    first.music = { ...first.music!, fadeInTicks: 0, fadeOutTicks: 6 };
    audio.sync(first);
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    await vi.waitFor(() => expect(media[0].paused).toBe(false));
    audio.sync({ ...first, tick: 60, music: { ...first.music!, startTick: 60 } });
    await vi.waitFor(() => expect(media).toHaveLength(2));
    media[1].metadata();
    expect(audio.mixerState().buses.music.activeVoices).toBe(2);
    audio.pause();
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
    expect(media.every((element) => element.paused)).toBe(true);
    expect(media[0].src).toBe("./long.wav");
    audio.resume();
    await vi.waitFor(() => expect(media[0].src).toBe(""));
    expect(media[1].paused).toBe(false);
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    audio.dispose();
  });

  it("keeps rejected playback stopped across ticks and retries after another user gesture", async () => {
    const context = new FakeContext();
    const { audio, media, status } = streamedPlayer(context);
    audio.sync(snapshot(0, 0));
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].play.mockRejectedValueOnce(new Error("autoplay blocked"));
    media[0].metadata();
    await vi.waitFor(() => expect(status).toHaveBeenCalledWith(expect.stringContaining("autoplay blocked")));
    for (let tick = 1; tick <= 120; tick++) audio.sync(snapshot(tick, 0));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(media).toHaveLength(1);
    expect(audio.mixerState().buses.music.activeVoices).toBe(0);
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(2));
    media[1].metadata();
    await vi.waitFor(() => expect(media[1].paused).toBe(false));
    expect(media[1].currentTime).toBe(2);
    audio.dispose();
  });

  it("reserves room for scene music by ending an effect when the shared voice cap is full", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]))));
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    await audio.unlock();
    for (let index = 0; index < 32; index++) {
      audio.handle({ kind: "audio", action: "start", voiceId: `effect:${index}`, assetId: "music", loop: false,
        volume: 1, fadeInTicks: 0, fadeOutTicks: 0 });
    }
    await vi.waitFor(() => expect(context.sources).toHaveLength(32));
    audio.sync(snapshot(0, 0));
    await vi.waitFor(() => expect(media).toHaveLength(1));
    media[0].metadata();
    await vi.waitFor(() => expect(media[0].paused).toBe(false));
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    expect(audio.mixerState().buses.sfx.activeVoices).toBe(31);
    expect(context.sources[0].stops).toHaveLength(1);
    audio.dispose();
  });

  it("streams a long track without fetching or decoding it and seeks the snapshot offset into its authored loop", async () => {
    const fetchAsset = vi.fn(async () => new Response(new Uint8Array([1])));
    vi.stubGlobal("fetch", fetchAsset);
    const context = new FakeContext();
    const { audio, media } = streamedPlayer(context);
    audio.preload();
    audio.sync(snapshot(1650, 0)); // 27.5 seconds, after the intro and one loop.
    expect(media).toHaveLength(0);
    await audio.unlock();
    await vi.waitFor(() => expect(media).toHaveLength(1));
    expect(fetchAsset).not.toHaveBeenCalled();
    expect(context.sources).toHaveLength(0);
    media[0].metadata();
    await vi.waitFor(() => expect(media[0].paused).toBe(false));
    expect(media[0].currentTime).toBe(17.5);
    expect(media[0].crossOrigin).toBe("anonymous");
    expect(context.mediaSources).toHaveLength(1);
    expect(audio.mixerState().buses.music.activeVoices).toBe(1);
    audio.sync(snapshot(1660, 0));
    expect(media).toHaveLength(1);
    audio.dispose();
    expect(media[0].paused).toBe(true);
    expect(media[0].src).toBe("");
    expect(context.mediaSources[0].outputs).toHaveLength(0);
  });
});
