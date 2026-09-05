/**
 * midiRender — a midi clip's window as an AudioBuffer.
 *
 * A midi clip has no asset to fetch: its notes are rendered to PCM by the
 * shared voice renderer and then travel the ordinary {@link AudioGraph} path,
 * so clip gain, fades, the track's DSP chain, mute/solo and the offline export
 * all treat it exactly as they treat a decoded audio file.
 *
 * The render is cached by {@link midiRenderKey}, which reads every input the
 * samples depend on — the notes, the window over them, the tempo, the
 * instrument and the sample rate. Edit any of those and the key changes, so a
 * stale render can never be handed back.
 */

import { midiRenderKey, renderMidiClip } from "@nodetool-ai/timeline";
import type {
  MidiInstrument,
  MidiNote,
  TimelineClip
} from "@nodetool-ai/timeline";
import type {
  MidiRenderRequest,
  MidiRenderResponse
} from "./midiRender.worker";

/** The slice of a clip a render reads. */
export type MidiRenderClip = Pick<
  TimelineClip,
  "notes" | "inPointMs" | "durationMs"
>;

/**
 * LRU cap on rendered midi buffers. A rendered phrase is mono and typically a
 * few seconds (~1 MB at 48 kHz), so a larger working set than the decoded-asset
 * cache is cheap.
 */
const RENDER_CACHE_MAX = 32;

const cache = new Map<string, AudioBuffer>();
const inFlight = new Map<string, Promise<AudioBuffer>>();

let nextRequestId = 1;

/** Render off the main thread when the host has workers; inline otherwise
 *  (Jest's jsdom, and any environment that blocks module workers). */
function renderSamples(request: Omit<MidiRenderRequest, "id">): Promise<Float32Array> {
  if (typeof Worker === "undefined") {
    return Promise.resolve(
      renderMidiClip({
        clip: {
          notes: request.notes,
          inPointMs: request.inPointMs,
          durationMs: request.durationMs
        },
        bpm: request.bpm,
        instrument: request.instrument,
        sampleRate: request.sampleRate
      })
    );
  }

  return new Promise<Float32Array>((resolve, reject) => {
    // In ts-jest (CommonJS) `import.meta` is unavailable; fall back to the
    // origin, mirroring `utils/histogram/histogramAsync.ts`.
    let metaUrl: string;
    try {
      metaUrl = new Function("return import.meta.url")() as string;
    } catch {
      metaUrl = typeof location !== "undefined" ? location.href : "file:///";
    }
    const worker = new Worker(new URL("./midiRender.worker.ts", metaUrl), {
      type: "module"
    });
    const done = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      worker.terminate();
    };
    const onMessage = (event: MessageEvent<MidiRenderResponse>) => {
      done();
      resolve(new Float32Array(event.data.pcm));
    };
    const onError = (event: ErrorEvent) => {
      done();
      reject(
        event.error instanceof Error
          ? event.error
          : new Error(event.message || "MIDI render worker failed")
      );
    };
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    const message: MidiRenderRequest = { id: nextRequestId++, ...request };
    worker.postMessage(message);
  });
}

/**
 * The clip's window as a mono {@link AudioBuffer} on `ctx`.
 *
 * `renderMidiClip` already sizes the buffer to the window (it accounts for
 * `inPointMs` / `durationMs`), so the caller schedules it from offset 0.
 */
export async function getMidiClipBuffer(
  ctx: BaseAudioContext,
  clip: MidiRenderClip,
  bpm: number,
  instrument: MidiInstrument
): Promise<AudioBuffer> {
  const sampleRate = ctx.sampleRate;
  const key = midiRenderKey({ clip, bpm, instrument, sampleRate });

  const cached = cache.get(key);
  if (cached) {
    // LRU touch, only when eviction is imminent.
    if (cache.size >= RENDER_CACHE_MAX) {
      cache.delete(key);
      cache.set(key, cached);
    }
    return cached;
  }
  const running = inFlight.get(key);
  if (running) return running;

  const notes: MidiNote[] = clip.notes ?? [];
  const promise = renderSamples({
    notes,
    inPointMs: clip.inPointMs ?? 0,
    durationMs: clip.durationMs,
    bpm,
    instrument,
    sampleRate
  })
    .then((samples) => {
      const buffer = ctx.createBuffer(
        1,
        Math.max(1, samples.length),
        sampleRate
      );
      // `set` rather than `copyToChannel`: the renderer's Float32Array is
      // typed over ArrayBufferLike, which copyToChannel's signature refuses.
      buffer.getChannelData(0).set(samples);
      cache.set(key, buffer);
      inFlight.delete(key);
      while (cache.size > RENDER_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest === undefined || oldest === key) break;
        cache.delete(oldest);
      }
      return buffer;
    })
    .catch((error) => {
      inFlight.delete(key);
      throw error;
    });

  inFlight.set(key, promise);
  return promise;
}

/** Drop every cached render. Exported for tests and teardown. */
export function clearMidiRenderCache(): void {
  cache.clear();
  inFlight.clear();
}
