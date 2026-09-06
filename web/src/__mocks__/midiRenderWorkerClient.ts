/**
 * Jest stand-in for `components/timeline/preview/midiRenderWorkerClient.ts`.
 *
 * The real module spawns a Vite module worker from a static `import.meta.url`,
 * which the CommonJS test transform cannot parse. This one answers a render
 * request the way the worker does — the shared renderer, a `message` event
 * carrying the PCM — so `midiRender.ts`'s worker path (post, await, terminate)
 * runs under Jest. `spawnedMidiRenderWorkers` lets a test assert the path was
 * taken.
 */
import { renderMidiClip } from "@nodetool-ai/timeline";
import type {
  MidiRenderRequest,
  MidiRenderResponse
} from "../components/timeline/preview/midiRender.worker";

class FakeMidiRenderWorker extends EventTarget {
  terminated = false;

  postMessage(request: MidiRenderRequest): void {
    const samples = renderMidiClip({
      clip: {
        notes: request.notes,
        inPointMs: request.inPointMs,
        durationMs: request.durationMs
      },
      bpm: request.bpm,
      instrument: request.instrument,
      sampleRate: request.sampleRate
    });
    const response: MidiRenderResponse = {
      id: request.id,
      pcm: samples.slice().buffer as ArrayBuffer
    };
    queueMicrotask(() => {
      this.dispatchEvent(new MessageEvent("message", { data: response }));
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

export const spawnedMidiRenderWorkers: FakeMidiRenderWorker[] = [];

export function createMidiRenderWorker(): Worker {
  const worker = new FakeMidiRenderWorker();
  spawnedMidiRenderWorkers.push(worker);
  return worker as unknown as Worker;
}
