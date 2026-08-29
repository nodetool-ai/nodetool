/**
 * The one place Mediabunny is booted and an `Input` is opened from bytes.
 *
 * Node has no WebCodecs, so Mediabunny's official server adapter has to be
 * registered before any decode — once per process, and only on Node, where the
 * adapter exists. Both the sandbox's audio/video bridge and the analysis
 * capabilities need that, and registering twice from two copies of the same
 * bootstrap is the kind of thing that works until it does not.
 */

import { importHidden, IS_NODE } from "@nodetool-ai/config";
import { ALL_FORMATS, BufferSource, Input } from "mediabunny";

interface MediabunnyServerModule {
  registerMediabunnyServer(): void;
}

let serverReady: Promise<void> | undefined;

/** Register Mediabunny's Node codec adapter, at most once per process. */
export async function ensureCodecs(): Promise<void> {
  if (!IS_NODE) return;
  serverReady ??= (async () => {
    const server =
      await importHidden<MediabunnyServerModule>("@mediabunny/server");
    if (!server) {
      throw new Error("Mediabunny's server codec adapter is unavailable");
    }
    server.registerMediabunnyServer();
  })();
  await serverReady;
}

/** Open an in-memory media file. The caller owns disposing the result. */
export function inputFrom(bytes: Uint8Array): Input {
  return new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
}
