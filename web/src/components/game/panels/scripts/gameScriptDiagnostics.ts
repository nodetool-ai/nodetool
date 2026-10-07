import type { GameSession } from "@nodetool-ai/game-runtime";

export interface GameDiagnosticSession {
  readonly step: () => { readonly scriptStats?: ReturnType<GameSession["step"]>["scriptStats"] };
  readonly dispose: () => void;
}

export interface GameDiagnosticReport {
  readonly ticks: number;
  readonly calls: number;
  readonly durationMs: number;
  readonly byEntity: readonly { entityId: string; calls: number; durationMs: number }[];
  readonly error: { readonly tick: number; readonly message: string } | null;
}

export async function runGameScriptDiagnostic({ tickRate, openSession, signal, yieldBatch }: {
  readonly tickRate: number;
  readonly openSession: (signal: AbortSignal) => Promise<GameDiagnosticSession>;
  readonly signal: AbortSignal;
  readonly yieldBatch: () => Promise<void>;
}): Promise<GameDiagnosticReport> {
  let session: GameDiagnosticSession | null = null;
  let ticks = 0;
  let calls = 0;
  let durationMs = 0;
  const byEntity = new Map<string, { calls: number; durationMs: number }>();
  let error: GameDiagnosticReport["error"] = null;
  try {
    signal.throwIfAborted();
    session = await openSession(signal);
    signal.throwIfAborted();
    const targetTicks = Math.round(tickRate * 10);
    while (ticks < targetTicks) {
      signal.throwIfAborted();
      const result = session.step();
      ticks += 1;
      calls += result.scriptStats?.calls ?? 0;
      durationMs += result.scriptStats?.durationMs ?? 0;
      for (const [entityId, stats] of Object.entries(result.scriptStats?.byEntity ?? {})) {
        const previous = byEntity.get(entityId) ?? { calls: 0, durationMs: 0 };
        byEntity.set(entityId, { calls: previous.calls + stats.calls, durationMs: previous.durationMs + stats.durationMs });
      }
      if (ticks % 30 === 0) {
        await yieldBatch();
        signal.throwIfAborted();
      }
    }
    signal.throwIfAborted();
  } catch (cause) {
    signal.throwIfAborted();
    error = { tick: ticks + 1, message: cause instanceof Error ? cause.message : String(cause) };
  } finally {
    session?.dispose();
  }
  return { ticks, calls, durationMs, byEntity: [...byEntity].map(([entityId, stats]) => ({ entityId, ...stats })), error };
}
