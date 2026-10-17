/**
 * Adds FableSynth processors to a context once. The instrument processors
 * build their FX from classes `ott` and `lab` define on the worklet global
 * scope, so callers list those first and the modules are added in order.
 */

import type { FableWorkletName } from "./fableWorkletUrls";

const loaded = new WeakMap<BaseAudioContext, Map<FableWorkletName, Promise<void>>>();

export async function loadFableWorklets(
  ctx: BaseAudioContext,
  names: readonly FableWorkletName[]
): Promise<void> {
  const { FABLE_WORKLET_URLS } = await import("./fableWorkletUrls");
  let modules = loaded.get(ctx);
  if (!modules) {
    modules = new Map();
    loaded.set(ctx, modules);
  }
  for (const name of names) {
    let pending = modules.get(name);
    if (!pending) {
      pending = ctx.audioWorklet.addModule(FABLE_WORKLET_URLS[name]);
      modules.set(name, pending);
    }
    await pending;
  }
}
