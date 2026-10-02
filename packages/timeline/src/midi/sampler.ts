import type { MidiInstrument, SamplerMidiInstrument } from "../types.js";
import type { VoiceEvent } from "./voice.js";

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

/** Shared sample playback for browser workers, auditions and server exports. */
export function renderSamplerVoices(
  out: Float32Array,
  events: readonly VoiceEvent[],
  instrument: SamplerMidiInstrument,
  sampleRate: number,
  samples: SamplerSamples
): boolean {
  let soundingAtEnd = false;
  const attack = (instrument.attackMs * sampleRate) / 1000;
  const release = Math.max(1, (instrument.releaseMs * sampleRate) / 1000);
  for (const zone of instrument.zones) {
    const audio = samples[zone.assetId];
    if (!audio)
      throw new Error(`Sample unavailable: ${zone.name || zone.assetId}`);
    for (const event of events) {
      if (event.pitch < zone.lowNote || event.pitch > zone.highNote) continue;
      const rate =
        (audio.sampleRate / sampleRate) *
        2 ** ((event.pitch - zone.rootNote) / 12);
      const sourceEnd = event.startFrame + audio.samples.length / rate;
      const end = instrument.oneShot
        ? sourceEnd
        : Math.min(sourceEnd, event.gateOffFrame + release);
      const gain = (event.velocity / 127) * 10 ** (zone.gainDb / 20);
      const gateLevel =
        attack > 0
          ? Math.min(1, (event.gateOffFrame - event.startFrame) / attack)
          : 1;
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
        const endRamp = Math.min(
          1,
          (sourceEnd - frame) / Math.max(1, sampleRate * 0.002)
        );
        out[frame] += (a + (b - a) * fraction) * gain * envelope * endRamp;
      }
      if (end > out.length && event.startFrame < out.length)
        soundingAtEnd = true;
    }
  }
  return soundingAtEnd;
}
