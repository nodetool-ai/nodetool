// The SQ-4 audio rig: one shared AudioContext hosting all four device
// engines, per-track gain (fader × mute) + analyser taps, and the single
// final limiter (docs/sq4-clips.md §7). The store talks to the rig through
// the SeqRig interface so tests can substitute a silent fake.

import { makeDevice, type SeqDevice } from './devices';
import type { SessionDoc } from './protocol';
import { masterFxParams, type MasterFxParams } from './masterFx';
import masterWorkletUrl from './master-worklet.js?url';
import sharedFxWorkletUrl from '../engine/ott-worklet.js?url';
import { KEY_CHANNELS, KICK_CHANNEL } from '../engine/sidechain';
import { DrumEngine, KICK_KEY_OUTPUT } from '../drum/engine/drum-synth';

export interface SeqRig {
  sampleRate: number;
  devices: SeqDevice[];
  /** Current context frame (the shared timebase). */
  now(): number;
  setTrackGain(t: number, gain: number): void;
  setMasterGain(gain: number): void;
  /** Optional while test rigs migrate; the browser rig always implements it. */
  setMasterFx?(params: MasterFxParams): void;
  sendTempo(bpm: number, swing: number, anchor: number): void;
  panic(): void;
  /** Per-track post-fader analysers (scope traces + VU), null in fakes. */
  trackAnalysers: AnalyserNode[] | null;
  /** Pre-FX master sum and final output analysers for the mix assistant. */
  masterTaps?: { input: AnalyserNode; output: AnalyserNode } | null;
}

export class WebAudioRig implements SeqRig {
  ctx!: AudioContext;
  devices: SeqDevice[] = [];
  trackGains: GainNode[] = [];
  trackAnalysers: AnalyserNode[] | null = null;
  masterTaps: { input: AnalyserNode; output: AnalyserNode } | null = null;
  masterBus!: AudioWorkletNode;
  trackDelays: DelayNode[] = [];
  kickKeyGain: GainNode | null = null;
  /** The five-channel side-chain key bus (see wireKeyBus). */
  keyBus: ChannelMergerNode | null = null;
  kickKeyTrack = -1;
  sampleRate = 48000;

  async init(session: SessionDoc): Promise<void> {
    const Ctor = window.AudioContext
      || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.sampleRate = ctx.sampleRate;

    await ctx.audioWorklet.addModule(sharedFxWorkletUrl);
    await ctx.audioWorklet.addModule(masterWorkletUrl);
    this.masterBus = new AudioWorkletNode(ctx, 'fable-sq-master', {
      // Input 1 is the side-chain key bus. Five discrete channels: the browser's
      // speaker layouts would otherwise remix it and drop channel 4 (KICK).
      numberOfInputs: 2, numberOfOutputs: 1, outputChannelCount: [2],
      channelCount: KEY_CHANNELS, channelCountMode: 'explicit', channelInterpretation: 'discrete',
    });
    this.masterBus.connect(ctx.destination);
    const tap = () => Object.assign(ctx.createAnalyser(), { fftSize: 8192, smoothingTimeConstant: 0 });
    this.masterTaps = { input: tap(), output: tap() };
    this.masterBus.connect(this.masterTaps.output);
    this.setMasterFx(masterFxParams(session.masterFx));

    this.trackAnalysers = [];
    const inits: Promise<void>[] = [];
    const deviceOutputs: GainNode[] = [];
    for (const track of session.tracks) {
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      this.trackGains.push(gain);
      this.trackAnalysers.push(analyser);

      const device = makeDevice(track.machine);
      this.devices.push(device);
      const deviceOutput = ctx.createGain();
      deviceOutputs.push(deviceOutput);
      gain.connect(this.masterBus);
      gain.connect(analyser);
      gain.connect(this.masterTaps.input);
      inits.push(device.init(ctx, deviceOutput).then(() => device.applyPatch(track.patch)));
    }
    await Promise.all(inits);

    // Worklets expose their internal latency, but the message that carries it
    // can arrive after init() resolves. Keep a deterministic fallback matching
    // the native 63/17 FIR contract and align every device before the shared
    // summing bus, including the drum pad+group pair.
    const limiter = Math.max(8, Math.round(0.0015 * ctx.sampleRate));
    const fallback = (machine: string) => machine === 'DR1' ? 70 + limiter : 35 + limiter;
    const latencies = this.devices.map((device, i) => device.latencySamples || fallback(session.tracks[i].machine));
    const longest = Math.max(...latencies);
    this.trackDelays = [];
    for (let i = 0; i < deviceOutputs.length; i++) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = Math.max(0, longest - latencies[i]) / ctx.sampleRate;
      deviceOutputs[i].connect(delay);
      delay.connect(this.trackGains[i]);
      this.trackDelays.push(delay);
    }
    this.wireKeyBus(ctx);
  }

  /**
   * Side-chain key bus (src/engine/sidechain.ts): the post-fader track
   * outputs and DR-1's kick-only output, one mono channel each. The master
   * reads it directly, aligned with the mix. Devices read it through a
   * one-quantum delay, which the feedback loop (a device keyed by a track
   * it feeds) needs in Web Audio; their keys arrive ~3 ms late.
   */
  private wireKeyBus(ctx: AudioContext): void {
    const merger = ctx.createChannelMerger(KEY_CHANNELS);
    this.keyBus = merger;
    this.trackGains.forEach((gain, t) => { if (t < KICK_CHANNEL) gain.connect(merger, 0, t); });
    const drum = this.devices.findIndex((d) => d.engine instanceof DrumEngine);
    const drumNode = drum >= 0 ? (this.devices[drum].engine as DrumEngine).node : null;
    if (drumNode) {
      this.kickKeyGain = ctx.createGain();
      this.kickKeyGain.gain.value = this.trackGains[drum].gain.value;
      this.kickKeyTrack = drum;
      drumNode.connect(this.kickKeyGain, KICK_KEY_OUTPUT);
      this.kickKeyGain.connect(merger, 0, KICK_CHANNEL);
    }
    merger.connect(this.masterBus, 0, 1);
    const late = ctx.createDelay(0.01);
    late.delayTime.value = 128 / ctx.sampleRate;
    merger.connect(late);
    for (const d of this.devices) {
      const node = (d.engine as { node?: AudioWorkletNode } | undefined)?.node;
      if (node && node.numberOfInputs > 0) late.connect(node);
    }
  }

  now(): number {
    return Math.round(this.ctx.currentTime * this.ctx.sampleRate);
  }

  setTrackGain(t: number, gain: number): void {
    const g = this.trackGains[t];
    if (g) g.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015);
    // The kick key follows the drum fader and mute like the other keys.
    if (t === this.kickKeyTrack) this.kickKeyGain?.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.015);
  }

  setMasterGain(gain: number): void {
    this.masterBus.port.postMessage({ t: 'gain', value: gain });
  }

  setMasterFx(params: MasterFxParams): void {
    this.masterBus.port.postMessage({ t: 'params', params: masterFxParams(params) });
  }

  sendTempo(bpm: number, swing: number, anchor: number): void {
    for (const d of this.devices) d.setTempo(bpm, swing, anchor);
  }

  panic(): void {
    for (const d of this.devices) d.panic();
  }
}
