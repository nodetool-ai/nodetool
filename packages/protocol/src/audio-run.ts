import { z } from "zod";

const durationSchema = z.number().finite().positive();
/** Run-wide audio settings, resolved from top-level sinks before execution. */
export const AUDIO_RUN_KEY = "__nodetool_audio_run";
export const AUDIO_SAMPLE_RATE = 44100;
export const AUDIO_BLOCK_FRAMES = 1024;
export const MAX_AUDIO_RENDER_SECONDS = 600;

export interface AudioRun {
  readonly mode: "live" | "render" | "free";
  readonly endFrame: number | null;
}

export function resolveAudioRun(
  nodes: readonly {
    readonly audio_sink?: "live" | "render";
    readonly properties?: Readonly<Record<string, unknown>>;
  }[]
): AudioRun {
  let duration = 0;
  for (const node of nodes) {
    if (node.audio_sink === "live") {
      return { mode: "live", endFrame: null };
    }
    const value = durationSchema.safeParse(node.properties?.duration);
    if (node.audio_sink === "render" && value.success) {
      duration = Math.max(
        duration,
        Math.min(value.data, MAX_AUDIO_RENDER_SECONDS)
      );
    }
  }
  return duration > 0
    ? { mode: "render", endFrame: Math.round(duration * AUDIO_SAMPLE_RATE) }
    : { mode: "free", endFrame: null };
}
