import { useEffect, useRef, useState } from "react";
import { scriptFailure, type ScriptFailure } from "../../useGamePlaySession";
import { runGameScriptDiagnostic, type GameDiagnosticReport, type GameDiagnosticSession } from "./gameScriptDiagnostics";

interface DiagnosticState<TDocument> {
  readonly document: TDocument;
  readonly running: boolean;
  readonly report: GameDiagnosticReport | null;
}

interface GameScriptDiagnostics {
  readonly run: () => Promise<void>;
  readonly running: boolean;
  readonly summary: string | null;
  readonly error: ScriptFailure | null;
  readonly byEntity: GameDiagnosticReport["byEntity"];
}

export function useGameScriptDiagnostics<TDocument extends { readonly tickRate: number }>(
  document: TDocument | null,
  openSession: (document: TDocument, signal: AbortSignal) => Promise<GameDiagnosticSession>
): GameScriptDiagnostics {
  const [state, setState] = useState<DiagnosticState<TDocument> | null>(null);
  const documentRef = useRef(document);
  documentRef.current = document;
  const generation = useRef(0);
  const controller = useRef<{ document: TDocument; abort: AbortController } | null>(null);
  useEffect(() => () => {
    const owned = controller.current;
    if (owned && owned.document === document) {
      generation.current += 1;
      owned.abort.abort();
    }
  }, [document]);

  const run = async (): Promise<void> => {
    if (!document) { return; }
    controller.current?.abort.abort();
    const owner = ++generation.current;
    const abort = new AbortController();
    controller.current = { document, abort };
    const captured = structuredClone(document);
    const current = (): boolean => !abort.signal.aborted && generation.current === owner && documentRef.current === document;
    setState({ document, running: true, report: null });
    try {
      const report = await runGameScriptDiagnostic({
        tickRate: captured.tickRate, signal: abort.signal,
        openSession: (signal) => openSession(captured, signal),
        yieldBatch: () => new Promise<void>((resolve, reject) => {
          const signal = abort.signal;
          const cancel = (): void => {
            cancelAnimationFrame(frame);
            signal.removeEventListener("abort", cancel);
            reject(signal.reason);
          };
          const frame = requestAnimationFrame(() => {
            signal.removeEventListener("abort", cancel);
            resolve();
          });
          signal.addEventListener("abort", cancel, { once: true });
          if (signal.aborted) { cancel(); }
        })
      });
      setState((previous) => current() ? { document, running: false, report } : previous);
    } catch (cause) {
      if (current()) { throw cause; }
    } finally {
      if (current()) {
        setState((previous) => previous && current() && previous.document === document ? { ...previous, running: false } : previous);
      }
    }
  };
  const activeState = state && state.document === document ? state : null;
  const report = activeState?.report ?? null;
  const summary = report ? report.error
    ? `First error at tick ${report.error.tick}: ${report.error.message}`
    : `${report.ticks} ticks completed · ${report.calls} script calls · ${report.durationMs.toFixed(1)} ms total script time`
    : null;
  return {
    run, running: activeState?.running ?? false, summary,
    error: report?.error?.message.includes("Game script") ? scriptFailure(report.error.message, report.error.tick) : null,
    byEntity: report?.byEntity ?? []
  };
}
