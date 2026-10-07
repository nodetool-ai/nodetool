import type { GameDocument3D } from "@nodetool-ai/protocol";
import { createGameSession3D, type GameSession3D, type GameSession3DOptions } from "@nodetool-ai/game-runtime";
import { resolveMediaUri } from "../../../utils/resolveMediaUri";

export async function readGameAssetBytes3D(document: GameDocument3D, slot: string, signal: AbortSignal,
  cache: Map<string, Uint8Array>): Promise<Uint8Array | null> {
  signal.throwIfAborted();
  const binding = document.assets[slot];
  if (!binding) { return null; }
  const key = JSON.stringify(binding);
  const cached = cache.get(key);
  if (cached) { return cached; }
  const url = await resolveMediaUri(binding.assetId.startsWith("package://") ? binding.assetId : `asset://${binding.assetId}`);
  signal.throwIfAborted();
  if (!url) { return null; }
  const response = await fetch(url, { signal });
  if (!response.ok) { throw new Error(`Game asset ${slot} failed to load`); }
  const bytes = new Uint8Array(await response.arrayBuffer());
  signal.throwIfAborted();
  cache.set(key, bytes);
  return bytes;
}

export function gameSessionOptions3D(document: GameDocument3D, signal: AbortSignal,
  cache: Map<string, Uint8Array>): GameSession3DOptions {
  return {
    signal,
    resolveCollider: async (binding) => {
      const slot = Object.entries(document.assets).find(([, value]) => value.assetId === binding.assetId
        && value.mediaKind === binding.mediaKind && value.digest === binding.digest)?.[0];
      if (!slot) { throw new Error("Collider binding is unavailable"); }
      const bytes = await readGameAssetBytes3D(document, slot, signal, cache);
      if (!bytes) { throw new Error(`Collider ${slot} is unavailable`); }
      const { decodePreparedGameCollider3D } = await import("@nodetool-ai/game-runtime");
      signal.throwIfAborted();
      return decodePreparedGameCollider3D(bytes, binding);
    }
  };
}

export async function openGameDiagnosticSession3D(document: GameDocument3D, signal: AbortSignal): Promise<GameSession3D> {
  signal.throwIfAborted();
  const session = await createGameSession3D(document, 1, undefined,
    gameSessionOptions3D(document, signal, new Map()));
  if (signal.aborted) {
    session.dispose();
    signal.throwIfAborted();
  }
  return session;
}
