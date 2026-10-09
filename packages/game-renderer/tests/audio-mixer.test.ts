import { describe, expect, it } from "vitest";
import { OfflineAudioContext } from "node-web-audio-api";
import type { GameAudioMixerInput } from "@nodetool-ai/protocol";
import { GameAudioMixer } from "../src/audio/mixer.js";

const SAMPLE_RATE = 48000;
const TICK_RATE = 60;

interface Render {
  readonly data: Float32Array;
  /** Samples the limiter's lookahead delays the output by. */
  readonly latency: number;
  readonly times: Readonly<Record<string, number>>;
}

interface Scenario {
  readonly mixer?: GameAudioMixerInput;
  readonly seconds: number;
  /** Constant input levels per bus. */
  readonly sources: Readonly<Record<string, number>>;
  /** Mixer actions in time order. Each runs before rendering with the mixer clock at its time, so it schedules there. */
  readonly at?: ReadonlyArray<readonly [string, number, (mixer: GameAudioMixer) => void]>;
  readonly setup?: (mixer: GameAudioMixer) => void;
}

async function render(scenario: Scenario): Promise<Render> {
  const length = Math.round(scenario.seconds * SAMPLE_RATE);
  const context = new OfflineAudioContext({ numberOfChannels: 1, length, sampleRate: SAMPLE_RATE });
  let now = 0;
  const mixer = new GameAudioMixer(context, scenario.mixer, TICK_RATE, { clock: () => now });
  scenario.setup?.(mixer);
  for (const [bus, level] of Object.entries(scenario.sources)) {
    const source = context.createConstantSource();
    source.offset.value = level;
    source.connect(mixer.input(bus));
    source.start(0);
  }
  const times: Record<string, number> = {};
  for (const [label, time, action] of scenario.at ?? []) {
    now = time;
    times[label] = time;
    action(mixer);
  }
  const data = (await context.startRendering()).getChannelData(0);
  return { data, latency: await limiterLatency(), times };
}

let measuredLatency: number | null = null;

/** The limiter delays its output by a fixed lookahead. Measure it once with a unit step through the default mixer. */
async function limiterLatency(): Promise<number> {
  if (measuredLatency !== null) { return measuredLatency; }
  const context = new OfflineAudioContext({ numberOfChannels: 1, length: 4800, sampleRate: SAMPLE_RATE });
  const mixer = new GameAudioMixer(context, undefined, TICK_RATE);
  const source = context.createConstantSource();
  source.offset.value = 0.25;
  source.connect(mixer.input("sfx"));
  source.start(0);
  const data = (await context.startRendering()).getChannelData(0);
  measuredLatency = data.findIndex((value) => Math.abs(value) > 1e-6);
  return measuredLatency;
}

/** Output sample at mixer time `seconds`. */
function sampleAt(result: Render, seconds: number): number {
  return result.data[Math.round(seconds * SAMPLE_RATE) + result.latency];
}

function rms(data: Float32Array, from: number, to: number): number {
  let sum = 0;
  for (let index = from; index < to; index++) { sum += data[index] * data[index]; }
  return Math.sqrt(sum / Math.max(1, to - from));
}

describe("game audio mixer", () => {
  it("multiplies bus faders along the parent chain and is transparent below the limiter threshold", async () => {
    const result = await render({ seconds: 0.2, sources: { footsteps: 0.5, music: 0.25 }, mixer: {
      buses: { master: { volume: 0.8 }, sfx: { volume: 0.5 }, footsteps: { parent: "sfx", volume: 0.5 }, music: { volume: 0.4 } } } });
    // footsteps: 0.5 * 0.5 * 0.5 * 0.8 = 0.1, music: 0.25 * 0.4 * 0.8 = 0.08
    expect(sampleAt(result, 0.1)).toBeCloseTo(0.18, 4);
  });

  it("silences a muted bus and its children", async () => {
    const result = await render({ seconds: 0.1, sources: { footsteps: 0.5, ui: 0.25 }, mixer: {
      buses: { sfx: { muted: true }, footsteps: { parent: "sfx" } } } });
    expect(sampleAt(result, 0.05)).toBeCloseTo(0.25, 4);
  });

  it("ramps between mixer snapshots on a trigger event with the authored fade", async () => {
    const result = await render({ seconds: 1, sources: { music: 0.5 }, mixer: {
      snapshots: { underwater: { buses: { music: { volume: 0.2 } } } },
      transitions: [{ on: { kind: "trigger", event: "dive" }, snapshot: "underwater", fadeTicks: 15 },
        { on: { kind: "trigger", event: "surface" }, snapshot: "base", fadeTicks: 0 }] },
    at: [["dive", 0.25, (mixer) => {
      mixer.observe({ kind: "trigger", event: "jump", entityId: "player" });
      mixer.observe({ kind: "trigger", event: "dive", entityId: "player" });
    }], ["surface", 0.75, (mixer) => mixer.observe({ kind: "trigger", event: "surface", entityId: "player" })]] });
    const dive = result.times.dive;
    const fade = 15 / TICK_RATE;
    expect(sampleAt(result, dive - 0.01)).toBeCloseTo(0.5, 4);
    expect(sampleAt(result, dive + fade / 4)).toBeCloseTo(0.5 * (1 - 0.8 / 4), 3);
    expect(sampleAt(result, dive + fade / 2)).toBeCloseTo(0.5 * (1 - 0.8 / 2), 3);
    expect(sampleAt(result, dive + fade + 0.05)).toBeCloseTo(0.1, 4);
    expect(sampleAt(result, result.times.surface + 0.05)).toBeCloseTo(0.5, 4);
  });

  it("ducks music while a voice line plays and releases after it ends", async () => {
    const result = await render({ seconds: 1.4, sources: { music: 0.5 },
      at: [["start", 0.2, (mixer) => mixer.voiceStarted("voice")], ["end", 0.6, (mixer) => mixer.voiceEnded("voice")]] });
    const attack = 6 / TICK_RATE;
    const release = 30 / TICK_RATE;
    const { start, end } = result.times;
    expect(sampleAt(result, start - 0.01)).toBeCloseTo(0.5, 4);
    expect(sampleAt(result, start + attack / 2)).toBeCloseTo(0.5 * (1 - 0.65 / 2), 3);
    expect(sampleAt(result, start + attack + 0.05)).toBeCloseTo(0.175, 4);
    expect(sampleAt(result, end + release / 2)).toBeCloseTo(0.5 * (0.35 + 0.65 / 2), 3);
    expect(sampleAt(result, end + release + 0.05)).toBeCloseTo(0.5, 4);
  });

  it("ducks when a voice plays on a child of the trigger bus and applies the deepest active rule", async () => {
    const result = await render({ seconds: 0.6, sources: { music: 0.5 }, mixer: {
      buses: { dialogue: { parent: "voice" } },
      ducking: [{ bus: "music", when: "voice", gain: 0.5, attackTicks: 0 }, { bus: "music", when: "ui", gain: 0.25, attackTicks: 0 }] },
    at: [["voice", 0.1, (mixer) => mixer.voiceStarted("dialogue")], ["ui", 0.3, (mixer) => mixer.voiceStarted("ui")]] });
    expect(sampleAt(result, result.times.voice + 0.05)).toBeCloseTo(0.25, 4);
    expect(sampleAt(result, result.times.ui + 0.05)).toBeCloseTo(0.125, 4);
  });

  it("applies player volume and mute on top of the authored mix", async () => {
    const result = await render({ seconds: 0.4, sources: { music: 0.5 }, mixer: { buses: { music: { volume: 0.5 } } },
      setup: (mixer) => mixer.setUserVolume("music", 0.5),
      at: [["mute", 0.2, (mixer) => mixer.setUserMuted("master", true)]] });
    expect(sampleAt(result, 0.1)).toBeCloseTo(0.125, 4);
    expect(sampleAt(result, result.times.mute + 0.05)).toBe(0);
  });

  it("applies a scene snapshot on scene entry and on reset", async () => {
    const mixer: GameAudioMixerInput = { snapshots: { cave: { buses: { sfx: { volume: 0.5 } } } },
      transitions: [{ on: { kind: "scene", sceneId: "cave" }, snapshot: "cave", fadeTicks: 0 }] };
    const result = await render({ seconds: 0.5, sources: { sfx: 0.5 }, mixer, setup: (instance) => instance.enterScene("field"),
      at: [["enter", 0.1, (instance) => instance.enterScene("cave")], ["reset", 0.3, (instance) => instance.reset("field")]] });
    expect(sampleAt(result, 0.05)).toBeCloseTo(0.5, 4);
    expect(sampleAt(result, result.times.enter + 0.05)).toBeCloseTo(0.25, 4);
    expect(sampleAt(result, result.times.reset + 0.05)).toBeCloseTo(0.5, 4);
  });

  it("low-passes a bus in a snapshot without changing its DC gain", async () => {
    const context = new OfflineAudioContext({ numberOfChannels: 1, length: SAMPLE_RATE / 2, sampleRate: SAMPLE_RATE });
    let now = 0;
    const mixer = new GameAudioMixer(context, { snapshots: { muffled: { buses: { sfx: { lowpassHz: 200 } } } } }, TICK_RATE, { clock: () => now });
    const tone = context.createOscillator();
    tone.frequency.value = 4000;
    const gain = context.createGain();
    gain.gain.value = 0.5;
    tone.connect(gain).connect(mixer.input("sfx"));
    tone.start(0);
    now = 0.25;
    mixer.transition("muffled", 0);
    const data = (await context.startRendering()).getChannelData(0);
    const open = rms(data, 2400, 9600);
    const muffled = rms(data, 14400, 24000);
    expect(open).toBeCloseTo(0.5 / Math.SQRT2, 2);
    expect(muffled).toBeLessThan(open / 100);

    const dc = await render({ seconds: 0.2, sources: { sfx: 0.5 }, mixer: { buses: { sfx: { lowpassHz: 200 } } } });
    expect(sampleAt(dc, 0.15)).toBeCloseTo(0.5, 3);
  });

  it("sends post-fader signal to the reverb and leaves a tail after the source stops", async () => {
    async function tail(reverbSend: number): Promise<number> {
      const context = new OfflineAudioContext({ numberOfChannels: 1, length: SAMPLE_RATE / 2, sampleRate: SAMPLE_RATE });
      const mixer = new GameAudioMixer(context, { reverb: { decaySeconds: 0.5 }, buses: { sfx: { reverbSend } } }, TICK_RATE);
      const source = context.createConstantSource();
      source.offset.value = 0.5;
      source.connect(mixer.input("sfx"));
      source.start(0);
      source.stop(0.05);
      const data = (await context.startRendering()).getChannelData(0);
      return rms(data, Math.round(0.1 * SAMPLE_RATE), Math.round(0.3 * SAMPLE_RATE));
    }
    expect(await tail(0)).toBe(0);
    expect(await tail(0.8)).toBeGreaterThan(0.001);
  });

  it("keeps an input above full scale under 0 dBFS through the master limiter", async () => {
    const limited = await render({ seconds: 0.5, sources: { sfx: 2 } });
    expect(Math.max(...limited.data.subarray(SAMPLE_RATE / 4))).toBeLessThan(1);
    const open = await render({ seconds: 0.2, sources: { sfx: 2 }, mixer: { limiter: { enabled: false } } });
    expect(open.data[SAMPLE_RATE / 10]).toBeCloseTo(2, 4);
  });

  it("routes asset slots to their assigned bus and reports mixer state without touching simulation data", () => {
    const context = new OfflineAudioContext({ numberOfChannels: 1, length: 128, sampleRate: SAMPLE_RATE });
    const mixer = new GameAudioMixer(context, { assetBuses: { narration: "voice" } }, TICK_RATE);
    expect(mixer.busFor("narration", false)).toBe("voice");
    expect(mixer.busFor("theme", true)).toBe("music");
    expect(mixer.busFor("coin", false)).toBe("sfx");
    const event = { kind: "trigger", event: "dive", entityId: "player" } as const;
    const copy = structuredClone(event);
    mixer.observe(event);
    expect(event).toEqual(copy);
    mixer.voiceStarted("voice");
    expect(mixer.state().buses.music.duckGain).toBeCloseTo(0.35);
    expect(mixer.state().buses.voice.activeVoices).toBe(1);
    mixer.voiceEnded("voice");
    expect(mixer.state().buses.music.duckGain).toBe(1);
  });
});
