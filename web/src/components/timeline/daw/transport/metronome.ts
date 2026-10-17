/**
 * The DAW-mode metronome: a click on every beat while the timeline plays, an
 * accented one on each downbeat.
 *
 * Clicks are scheduled on the audio clock of the preview's own context, a
 * short look-ahead at a time, from the same anchor the playback clock starts
 * from (timeline ms ↔ `context.currentTime`), so they stay locked to the
 * sources the audio graph schedules. They go straight to the context's
 * destination, never through the mix bus, so an export never contains them.
 */

import { beatDurationMs } from "@nodetool-ai/timeline";
import type { TimelineTempo } from "@nodetool-ai/timeline";

/** How far ahead of the audio clock clicks are scheduled, in seconds. */
const LOOKAHEAD_SEC = 0.15;
/** How often the scheduler tops up the look-ahead window, in ms. */
const SCHEDULE_INTERVAL_MS = 25;
const CLICK_DECAY_SEC = 0.05;
const ACCENT_FREQUENCY_HZ = 1760;
const BEAT_FREQUENCY_HZ = 1320;
const ACCENT_LEVEL = 0.6;
const BEAT_LEVEL = 0.35;
/** A beat this close under an index boundary still counts as that beat. */
const BEAT_EPSILON = 1e-6;

export interface MetronomeClick {
  /** Timeline time of the beat, in ms. */
  timeMs: number;
  /** First beat of a bar. */
  downbeat: boolean;
}

/** Index of the first beat at or after `ms`, counted from `tempo.offsetMs`. */
export function firstBeatIndexAt(ms: number, tempo: TimelineTempo): number {
  return Math.ceil((ms - tempo.offsetMs) / beatDurationMs(tempo) - BEAT_EPSILON) || 0;
}

/** The clicks in `[fromMs, toMs)`. */
export function metronomeClicks(
  fromMs: number,
  toMs: number,
  tempo: TimelineTempo
): MetronomeClick[] {
  const beatMs = beatDurationMs(tempo);
  const beatsPerBar = Math.max(1, Math.round(tempo.timeSignature.beatsPerBar));
  const clicks: MetronomeClick[] = [];
  for (let i = firstBeatIndexAt(fromMs, tempo); ; i += 1) {
    const timeMs = tempo.offsetMs + i * beatMs;
    if (timeMs >= toMs) break;
    clicks.push({ timeMs, downbeat: ((i % beatsPerBar) + beatsPerBar) % beatsPerBar === 0 });
  }
  return clicks;
}

export interface MetronomeStartOptions {
  context: BaseAudioContext;
  /** `context.currentTime` at the moment the playback clock started. */
  anchorContextSec: number;
  /** Timeline position the playback clock started from. */
  anchorMs: number;
  /** Playback rate; the metronome only runs forwards. */
  rate: number;
  tempo: TimelineTempo;
}

export class Metronome {
  private context: BaseAudioContext | null = null;
  private output: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private scheduled: Array<{ osc: OscillatorNode; endsAt: number }> = [];
  private volume = 1;

  /** Listener volume, linear 0..1, the same the preview applies to the mix. */
  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.context && this.output) {
      this.output.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01);
    }
  }

  get running(): boolean {
    return this.timer !== null;
  }

  start(options: MetronomeStartOptions): void {
    this.stop();
    const { context, anchorContextSec, anchorMs, rate, tempo } = options;
    if (!(rate > 0)) return;
    const output = context.createGain();
    output.gain.value = this.volume;
    output.connect(context.destination);
    this.context = context;
    this.output = output;
    const beatMs = beatDurationMs(tempo);
    let index = firstBeatIndexAt(anchorMs, tempo);
    const beatsPerBar = Math.max(1, Math.round(tempo.timeSignature.beatsPerBar));
    const contextTimeOf = (timeMs: number): number =>
      anchorContextSec + (timeMs - anchorMs) / 1000 / rate;

    const schedule = (): void => {
      const horizon = context.currentTime + LOOKAHEAD_SEC;
      for (;;) {
        const timeMs = tempo.offsetMs + index * beatMs;
        const when = contextTimeOf(timeMs);
        if (when > horizon) break;
        if (when >= context.currentTime) {
          const downbeat = ((index % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
          this.click(context, output, when, downbeat);
        }
        index += 1;
      }
      this.scheduled = this.scheduled.filter((c) => c.endsAt > context.currentTime);
    };
    schedule();
    this.timer = setInterval(schedule, SCHEDULE_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const context = this.context;
    for (const { osc } of this.scheduled) {
      try {
        osc.stop(context ? context.currentTime : 0);
      } catch {
        /* already stopped */
      }
    }
    this.scheduled = [];
    try {
      this.output?.disconnect();
    } catch {
      /* not connected */
    }
    this.output = null;
    this.context = null;
  }

  private click(
    context: BaseAudioContext,
    output: GainNode,
    when: number,
    downbeat: boolean
  ): void {
    const osc = context.createOscillator();
    const env = context.createGain();
    osc.type = "sine";
    osc.frequency.value = downbeat ? ACCENT_FREQUENCY_HZ : BEAT_FREQUENCY_HZ;
    const level = downbeat ? ACCENT_LEVEL : BEAT_LEVEL;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(level, when + 0.001);
    env.gain.exponentialRampToValueAtTime(0.0001, when + CLICK_DECAY_SEC);
    osc.connect(env);
    env.connect(output);
    osc.start(when);
    const endsAt = when + CLICK_DECAY_SEC + 0.01;
    osc.stop(endsAt);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
    this.scheduled.push({ osc, endsAt });
  }
}
