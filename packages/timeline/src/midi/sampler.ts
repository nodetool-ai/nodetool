import type { MidiInstrument, SamplerMidiInstrument } from "../types.js";
import type { FramePoint, VoiceEvent } from "./voice.js";

/** Decoded recordings are host-owned and never serialized into the document. */
export interface SamplerAudio {
  readonly samples: Float32Array;
  readonly sampleRate: number;
}
export type SamplerSamples = Readonly<Record<string, SamplerAudio>>;

/** Resolve each recording once. A missing recording fails the render explicitly. */
export async function loadSamplerSamples(
  instrument: MidiInstrument,
  load: (assetId: string) => Promise<SamplerAudio>
): Promise<SamplerSamples> {
  if (instrument.type !== "sampler") return {};
  const entries = await Promise.all(
    [...new Set(instrument.zones.map((zone) => zone.assetId))].map(
      async (id) => {
        const audio = await load(id);
        if (
          !audio.samples.length ||
          !Number.isFinite(audio.sampleRate) ||
          audio.sampleRate <= 0
        ) {
          throw new Error(`Sample ${id} contains no usable audio`);
        }
        return [id, audio] as const;
      }
    )
  );
  return Object.fromEntries(entries);
}

/** Long enough to audition a complete one-shot, including transposition. */
export function samplerTailMs(
  instrument: SamplerMidiInstrument,
  pitch: number,
  samples: SamplerSamples
): number {
  if (!instrument.oneShot) return instrument.releaseMs;
  return instrument.zones.reduce((tail, zone) => {
    const audio = samples[zone.assetId];
    if (!audio || pitch < zone.lowNote || pitch > zone.highNote) return tail;
    return Math.max(
      tail,
      (1000 * audio.samples.length) /
        audio.sampleRate /
        2 ** ((pitch - zone.rootNote) / 12)
    );
  }, 0);
}

function evalPitchBend(points: ReadonlyArray<FramePoint>, frame: number): number {
  if (points.length === 0 || frame < points[0]!.frame) return 0;
  const last = points[points.length - 1]!;
  if (frame >= last.frame) return last.value;
  for (let i = 1; i < points.length; i++) {
    const b = points[i]!;
    if (frame < b.frame) {
      const a = points[i - 1]!;
      const span = b.frame - a.frame;
      return span <= 0 ? b.value : a.value + ((b.value - a.value) * (frame - a.frame)) / span;
    }
  }
  return last.value;
}

function evalStepTrack(points: ReadonlyArray<FramePoint> | undefined, frame: number): number {
  if (!points || points.length === 0 || frame < points[0]!.frame) return 0;
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (points[mid]!.frame <= frame) lo = mid;
    else hi = mid - 1;
  }
  return points[lo]!.value;
}

/** Shared sample playback for browser workers, auditions and server exports. */
export function renderSamplerVoices(
  out: Float32Array,
  events: readonly VoiceEvent[],
  instrument: SamplerMidiInstrument,
  sampleRate: number,
  samples: SamplerSamples,
  pitchBendSemitones?: ReadonlyArray<FramePoint>
): boolean {
  let soundingAtEnd = false;
  const attack = (instrument.attackMs * sampleRate) / 1000;
  const release = Math.max(1, (instrument.releaseMs * sampleRate) / 1000);
  const endRampFrames = Math.max(1, sampleRate * 0.002);
  const hasChannelBend = Boolean(pitchBendSemitones && pitchBendSemitones.length > 0);
  for (const zone of instrument.zones) {
    const audio = samples[zone.assetId];
    if (!audio)
      throw new Error(`Sample unavailable: ${zone.name || zone.assetId}`);
    for (const event of events) {
      if (event.pitch < zone.lowNote || event.pitch > zone.highNote) continue;
      const pitchPoints = event.expression?.pitch;
      const baseRate =
        (audio.sampleRate / sampleRate) *
        2 ** ((event.pitch - zone.rootNote) / 12);
      const gain = (event.velocity / 127) * 10 ** (zone.gainDb / 20);
      const gateLevel =
        attack > 0
          ? Math.min(1, (event.gateOffFrame - event.startFrame) / attack)
          : 1;

      const isConstantPitch =
        !hasChannelBend &&
        (!pitchPoints ||
          pitchPoints.length === 0 ||
          (pitchPoints.length === 1 && pitchPoints[0]!.frame <= event.startFrame));

      if (isConstantPitch) {
        const bend = pitchPoints && pitchPoints.length === 1 ? pitchPoints[0]!.value : 0;
        const rate = bend !== 0 ? baseRate * 2 ** (bend / 12) : baseRate;
        const sourceEnd = event.startFrame + audio.samples.length / rate;
        const end = instrument.oneShot
          ? sourceEnd
          : Math.min(sourceEnd, event.gateOffFrame + release);
        for (
          let frame = Math.max(0, event.startFrame);
          frame < Math.min(out.length, end);
          frame++
        ) {
          const position = (frame - event.startFrame) * rate;
          const index = Math.floor(position);
          const fraction = position - index;
          const a = audio.samples[index] ?? 0;
          const b = audio.samples[index + 1] ?? 0;
          let envelope =
            attack > 0 ? Math.min(1, (frame - event.startFrame) / attack) : 1;
          if (!instrument.oneShot && frame >= event.gateOffFrame) {
            envelope =
              gateLevel * Math.max(0, 1 - (frame - event.gateOffFrame) / release);
          }
          // A short ramp prevents a click on a recording whose last sample is nonzero.
          const endRamp = Math.min(1, (sourceEnd - frame) / endRampFrames);
          out[frame] += (a + (b - a) * fraction) * gain * envelope * endRamp;
        }
        if (end > out.length && event.startFrame < out.length)
          soundingAtEnd = true;
      } else {
        let position = 0;
        for (let f = event.startFrame; f < 0; f++) {
          const bend =
            (pitchPoints ? evalPitchBend(pitchPoints, f) : 0) +
            (hasChannelBend ? evalStepTrack(pitchBendSemitones, f) : 0);
          position += bend !== 0 ? baseRate * 2 ** (bend / 12) : baseRate;
        }
        const envEnd = instrument.oneShot
          ? Number.POSITIVE_INFINITY
          : event.gateOffFrame + release;
        const maxFrame = Math.min(out.length, envEnd);
        let frame = Math.max(0, event.startFrame);
        for (; frame < maxFrame && position < audio.samples.length; frame++) {
          const bend =
            (pitchPoints ? evalPitchBend(pitchPoints, frame) : 0) +
            (hasChannelBend ? evalStepTrack(pitchBendSemitones, frame) : 0);
          const instRate = bend !== 0 ? baseRate * 2 ** (bend / 12) : baseRate;
          const index = Math.floor(position);
          const fraction = position - index;
          const a = audio.samples[index] ?? 0;
          const b = audio.samples[index + 1] ?? 0;
          let envelope =
            attack > 0 ? Math.min(1, (frame - event.startFrame) / attack) : 1;
          if (!instrument.oneShot && frame >= event.gateOffFrame) {
            envelope =
              gateLevel * Math.max(0, 1 - (frame - event.gateOffFrame) / release);
          }
          const remainingFrames = (audio.samples.length - position) / instRate;
          const endRamp = Math.min(1, remainingFrames / endRampFrames);
          out[frame] += (a + (b - a) * fraction) * gain * envelope * endRamp;
          position += instRate;
        }
        if (
          frame >= out.length &&
          position < audio.samples.length &&
          out.length < envEnd &&
          event.startFrame < out.length
        ) {
          soundingAtEnd = true;
        }
      }
    }
  }
  return soundingAtEnd;
}
