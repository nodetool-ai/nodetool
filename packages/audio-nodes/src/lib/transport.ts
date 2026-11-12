import {
  AUDIO_BLOCK_FRAMES,
  AUDIO_RUN_KEY,
  AUDIO_SAMPLE_RATE,
  type AudioRun
} from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { abortableSleep } from "./cv.js";

const TRANSPORT_KEY = "__nodetool_audio_transport";

export class AudioTransport {
  readonly sampleRate = AUDIO_SAMPLE_RATE;
  readonly blockFrames = AUDIO_BLOCK_FRAMES;
  private start: number | undefined;

  constructor(readonly run: AudioRun | undefined) {}

  get mode(): AudioRun["mode"] {
    return this.run?.mode ?? "free";
  }
  get endFrame(): number | null {
    return this.run?.endFrame ?? null;
  }

  async until(frame: number, signal?: AbortSignal): Promise<void> {
    if (this.mode === "render" || signal?.aborted) {
      return;
    }
    this.start ??= Date.now();
    const delay = this.start + (frame * 1000) / this.sampleRate - Date.now();
    if (delay > 0) {
      await abortableSleep(delay, signal);
    }
  }
}

export function getTransport(context?: ProcessingContext): AudioTransport {
  const run = context?.get<AudioRun | undefined>(AUDIO_RUN_KEY);
  const cached = context?.get<AudioTransport | undefined>(TRANSPORT_KEY);
  if (cached && cached.run === run) {
    return cached;
  }
  const transport = new AudioTransport(run);
  context?.set(TRANSPORT_KEY, transport);
  return transport;
}
