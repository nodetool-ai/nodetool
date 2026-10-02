import {
  loadSamplerSamples,
  type MidiInstrument,
  type SamplerAudio,
  type SamplerSamples
} from "@nodetool-ai/timeline";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

/** Recordings are immutable assets. Bound the decoded cache independently of rendered phrases. */
const cache = new Map<string, Promise<SamplerAudio>>();
const CACHE_SIZE = 32;
const resolveSampleUrl = (id: string) => resolveMediaUri(`asset://${id}`);

export function getSamplerAudio(
  ctx: BaseAudioContext,
  instrument: MidiInstrument,
  resolveUrl: (id: string) => Promise<string | undefined> = resolveSampleUrl
): Promise<SamplerSamples> {
  return loadSamplerSamples(instrument, async (id) => {
    const key = `${ctx.sampleRate}:${id}`;
    const existing = cache.get(key);
    if (existing) return existing;
    const pending = (async (): Promise<SamplerAudio> => {
      const url = await resolveUrl(id);
      if (!url) throw new Error(`Sample unavailable: ${id}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok)
        throw new Error(`Could not load sample ${id}: ${response.status}`);
      const audio = await ctx.decodeAudioData(await response.arrayBuffer());
      if (audio.duration > 60)
        throw new Error(
          "Sampler recordings must be 60 seconds or shorter. Trim this asset first."
        );
      const samples = new Float32Array(audio.length);
      for (let channel = 0; channel < audio.numberOfChannels; channel++) {
        const data = audio.getChannelData(channel);
        for (let frame = 0; frame < samples.length; frame++)
          samples[frame] += data[frame] / audio.numberOfChannels;
      }
      return { samples, sampleRate: audio.sampleRate };
    })().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, pending);
    while (cache.size > CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
    return pending;
  });
}

export function clearSamplerAudioCache(): void {
  cache.clear();
}
