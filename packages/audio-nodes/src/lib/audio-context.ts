/// <reference lib="dom" />
/**
 * Environment seam for WebAudio's `OfflineAudioContext`.
 *
 * On Node the constructor comes from `node-web-audio-api`, loaded via a
 * bundler-hidden import so the web bundle never tries to resolve the native
 * addon. In the browser it is the global — when present: the browser workflow
 * runner executes inside a Web Worker, where `OfflineAudioContext` is not
 * guaranteed (absent in Firefox/Safari workers), so callers must handle the
 * `null` case with a pure-JS fallback (see `lib/biquad.ts`).
 */
import { IS_NODE, importHidden } from "@nodetool-ai/config";

export type OfflineAudioContextCtor = typeof OfflineAudioContext;

let cached: Promise<OfflineAudioContextCtor | null> | null = null;

/**
 * Resolve the `OfflineAudioContext` constructor for the current environment,
 * or `null` when WebAudio is unavailable (e.g. a Web Worker without it).
 */
export async function loadOfflineAudioContext(): Promise<OfflineAudioContextCtor | null> {
  if (!cached) {
    cached = (async () => {
      if (IS_NODE) {
        try {
          const mod = await importHidden<{
            OfflineAudioContext: OfflineAudioContextCtor;
          }>("node-web-audio-api");
          return mod?.OfflineAudioContext ?? null;
        } catch {
          // The native addon can be missing or fail to load on some Node
          // targets (musl, unbundled serverless like Vercel functions). Treat
          // that as "WebAudio unavailable" — resolving null, never rejecting —
          // so callers fall back to ffmpeg / pure-JS WAV instead of crashing
          // with an opaque module-load error. null is cached: the addon won't
          // appear later in the same process.
          return null;
        }
      }
      return (
        (globalThis as { OfflineAudioContext?: OfflineAudioContextCtor })
          .OfflineAudioContext ?? null
      );
    })();
  }
  return cached;
}
