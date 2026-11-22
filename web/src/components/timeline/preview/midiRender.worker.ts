/**
 * Web worker for midi clip rendering.
 *
 * A phrase at 48 kHz is a few hundred thousand samples of per-sample oscillator,
 * envelope and filter arithmetic — enough to drop frames if it runs on the main
 * thread while the playhead is moving. The renderer itself is the shared pure
 * function, so the worker and the inline fallback produce identical samples.
 */

import { renderMidiClip } from "@nodetool-ai/timeline";
import type {
  MidiControllerLane,
  MidiInstrument,
  MidiNote,
  MidiRenderControls,
  SamplerSamples,
  TimelineClip
} from "@nodetool-ai/timeline";

declare const self: DedicatedWorkerGlobalScope;

export interface MidiRenderRequest {
  id: number;
  notes: MidiNote[];
  controllers?: MidiControllerLane[];
  controls?: Partial<MidiRenderControls>;
  inPointMs: number;
  durationMs: number;
  /** Region loop window; the renderer repeats it until `durationMs`. */
  loopLengthMs?: number;
  /** The clip's place on the timeline; a region quantize reads the tempo grid from it. */
  startMs?: number;
  /** `tempo.offsetMs`, the origin of that grid. */
  gridOffsetMs?: number;
  /** Midi region parameters (CE6), applied by the renderer. */
  transpose?: number;
  velocityOffset?: number;
  quantize?: TimelineClip["quantize"];
  bpm: number;
  instrument: MidiInstrument;
  sampleRate: number;
  samples?: SamplerSamples;
}

export interface MidiRenderResponse {
  id: number;
  /** Mono PCM, one Float32 per frame. */
  pcm: ArrayBuffer;
}

self.addEventListener("message", (event: MessageEvent<MidiRenderRequest>) => {
  const { id, notes, controllers, controls, inPointMs, durationMs, loopLengthMs, startMs, gridOffsetMs, transpose, velocityOffset, quantize, bpm, instrument, sampleRate, samples: recordings } =
    event.data;
  const samples = renderMidiClip({
    clip: { notes, controllers, inPointMs, durationMs, loopLengthMs, startMs, transpose, velocityOffset, quantize },
    bpm,
    gridOffsetMs,
    controls,
    instrument,
    sampleRate,
    samples: recordings
  });
  const pcm = samples.buffer as ArrayBuffer;
  const response: MidiRenderResponse = { id, pcm };
  self.postMessage(response, [pcm] as Transferable[]);
});
