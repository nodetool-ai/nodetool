import type { AnyGameDocument, GameDiagnostic, GameDocument3D, GameEvent, GameEvent3D, GameSnapshot, GameSnapshot3D } from "@nodetool-ai/protocol";
import { createScriptedGameSession, type GameSession } from "./session.js";
import type { GameSession3D, GameSession3DOptions } from "./session3d.js";
import { validateAnyGame } from "./validate3d.js";

export type { GameSession3D, GameSession3DOptions } from "./session3d.js";

export type OpenedGameSession =
  | { readonly dimension: "2d"; readonly session: GameSession }
  | { readonly dimension: "3d"; readonly session: GameSession3D };

export interface OpenGameSessionOptions extends Omit<GameSession3DOptions, "eventSink"> {
  readonly eventSink?: (event: GameEvent | GameEvent3D) => void;
  readonly seed: number;
  readonly snapshot?: GameSnapshot | GameSnapshot3D;
}

export type OpenGameResult = { readonly ok: true; readonly opened: OpenedGameSession } |
  { readonly ok: false; readonly diagnostics: readonly GameDiagnostic[] };

/** Prepare a spatial session without loading 3D dependencies for legacy games. */
export async function openGameSession(value: AnyGameDocument, options: OpenGameSessionOptions): Promise<OpenGameResult> {
  options.signal?.throwIfAborted();
  const validated = validateAnyGame(value);
  if (!validated.valid) {
    return { ok: false, diagnostics: validated.diagnostics };
  }
  const document = validated.document;
  const snapshot = options.snapshot;
  if (snapshot && (document.schemaVersion === 3) !== (snapshot.engineVersion === "2")) {
    return { ok: false, diagnostics: [{ code: "snapshot_dimension_mismatch", path: ["snapshot"], message: "Snapshot dimension does not match the game" }] };
  }
  try {
    if (document.schemaVersion === 3) {
      const session = await createGameSession3D(document, options.seed,
        snapshot?.engineVersion === "2" ? snapshot : undefined, options);
      if (options.signal?.aborted) {
        session.dispose();
        options.signal.throwIfAborted();
      }
      return { ok: true, opened: { dimension: "3d", session } };
    }
    const session = await createScriptedGameSession(document, options.seed,
      snapshot?.engineVersion === "1" ? snapshot : undefined, options.eventSink);
    if (options.signal?.aborted) {
      session.dispose();
      options.signal.throwIfAborted();
    }
    return { ok: true, opened: { dimension: "2d", session } };
  } catch (error) {
    options.signal?.throwIfAborted();
    return { ok: false, diagnostics: [{ code: "session_preparation_failed", path: [], message: error instanceof Error ? error.message : String(error) }] };
  }
}

/** Load the 3D simulation only when opening a 3D game. */
export async function createGameSession3D(document: GameDocument3D, seed: number, snapshot?: GameSnapshot3D,
  options?: GameSession3DOptions): Promise<GameSession3D> {
  const runtime = await import("./session3d.js");
  return runtime.createGameSession3D(document, seed, snapshot, options);
}

/** Replay normalized tick inputs through the same public 3D session. */
export async function replayGame3D(...args: Parameters<typeof import("./session3d.js").replayGame3D>): ReturnType<typeof import("./session3d.js").replayGame3D> {
  const runtime = await import("./session3d.js");
  return runtime.replayGame3D(...args);
}

/** Hash committed simulation data independently of renderer state. */
export async function hashGameSnapshot3D(snapshot: GameSnapshot3D): Promise<string> {
  const { digestGame3D } = await import("./spatial3d/digest.js");
  return digestGame3D(snapshot);
}
