/**
 * Web worker for midi clip rendering.
 *
 * A phrase at 48 kHz is a few hundred thousand samples of per-sample oscillator,
 * envelope and filter arithmetic — enough to drop frames if it runs on the main
 * thread while the playhead is moving. The renderer itself is the shared pure
 * function, so the worker and the inline fallback produce identical samples.
 */

import { renderMidiClip } from "@nodetool-ai/timeline";
import type { MidiInstrument, MidiNote } from "@nodetool-ai/timeline";

declare const self: DedicatedWorkerGlobalScope;

export interface MidiRenderRequest {
  id: number;
  notes: MidiNote[];
  inPointMs: number;
  durationMs: number;
  bpm: number;
  instrument: MidiInstrument;
  sampleRate: number;
}

export interface MidiRenderResponse {
  id: number;
  /** Mono PCM, one Float32 per frame. */
  pcm: ArrayBuffer;
}

self.addEventListener("message", (event: MessageEvent<MidiRenderRequest>) => {
  const { id, notes, inPointMs, durationMs, bpm, instrument, sampleRate } =
    event.data;
  const samples = renderMidiClip({
    clip: { notes, inPointMs, durationMs },
    bpm,
    instrument,
    sampleRate
  });
  const pcm = samples.buffer as ArrayBuffer;
  const response: MidiRenderResponse = { id, pcm };
  self.postMessage(response, [pcm] as Transferable[]);
});
