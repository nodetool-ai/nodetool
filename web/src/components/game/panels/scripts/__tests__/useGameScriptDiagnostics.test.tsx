import { act, renderHook } from "@testing-library/react";
import { useGameScriptDiagnostics } from "../useGameScriptDiagnostics";
import type { GameDiagnosticSession } from "../gameScriptDiagnostics";

function pendingSession() {
  let release: (session: GameDiagnosticSession) => void = jest.fn();
  const promise = new Promise<GameDiagnosticSession>((resolve) => { release = resolve; });
  return { promise, release };
}
function session(): GameDiagnosticSession {
  return { step: jest.fn(() => ({})), dispose: jest.fn() };
}

it("captures assets and does not let stale preparation clear a newer run", async () => {
  const first = pendingSession();
  const second = pendingSession();
  const open = jest.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const document = { tickRate: 3, assets: { collider: "old" } };
  const { result, rerender } = renderHook(({ document }) => useGameScriptDiagnostics(document, open), {
    initialProps: { document }
  });
  let firstRun: Promise<void> = Promise.resolve();
  act(() => { firstRun = result.current.run(); });
  expect(open).toHaveBeenCalledWith(document, expect.any(AbortSignal));
  expect(open.mock.calls[0][0]).not.toBe(document);
  document.assets.collider = "mutated after capture";
  expect(open.mock.calls[0][0].assets.collider).toBe("old");
  rerender({ document: { tickRate: 3, assets: { collider: "new" } } });
  let secondRun: Promise<void> = Promise.resolve();
  act(() => { secondRun = result.current.run(); });
  const stale = session();
  await act(async () => { first.release(stale); await firstRun; });
  expect(stale.dispose).toHaveBeenCalledTimes(1);
  expect(stale.step).not.toHaveBeenCalled();
  expect(result.current.running).toBe(true);
  expect(result.current.summary).toBeNull();
  const newest = session();
  rerender({ document: { tickRate: 3, assets: { collider: "third" } } });
  await act(async () => {
    second.release(newest);
    await secondRun;
  });
  expect(newest.dispose).toHaveBeenCalledTimes(1);
  expect(result.current.running).toBe(false);
  expect(result.current.summary).toBeNull();
});

it("disposes preparation that completes after unmount", async () => {
  const preparation = pendingSession();
  const open = jest.fn(() => preparation.promise);
  const document = { tickRate: 3 };
  const { result, unmount } = renderHook(() => useGameScriptDiagnostics(document, open));
  let run: Promise<void> = Promise.resolve();
  act(() => { run = result.current.run(); });
  unmount();
  const diagnostic = session();
  await act(async () => { preparation.release(diagnostic); await run; });
  expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
  expect(diagnostic.step).not.toHaveBeenCalled();
});

it.each(["document change", "unmount"])("disposes a batch yield on %s without waiting for another animation frame", async (cancellation) => {
  const frame = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
  const cancel = jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  try {
    const diagnostic = session();
    const open = jest.fn(async () => diagnostic);
    const { result, rerender, unmount } = renderHook(({ document }) => useGameScriptDiagnostics(document, open), {
      initialProps: { document: { tickRate: 3 } }
    });
    let run: Promise<void> = Promise.resolve();
    await act(async () => { run = result.current.run(); });
    expect(diagnostic.step).toHaveBeenCalledTimes(30);
    expect(frame).toHaveBeenCalledTimes(1);
    if (cancellation === "unmount") { unmount(); }
    else { rerender({ document: { tickRate: 4 } }); }
    await act(async () => { await run; });
    expect(cancel).toHaveBeenCalledWith(1);
    expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
    if (cancellation !== "unmount") {
      expect(result.current.summary).toBeNull();
      expect(result.current.running).toBe(false);
    }
  } finally { frame.mockRestore(); cancel.mockRestore(); }
});

it("keeps asset preparation errors out of the script error details", async () => {
  const document = { tickRate: 3 };
  const open = jest.fn(async (): Promise<GameDiagnosticSession> => { throw new Error("Collider asset fetch failed"); });
  const { result } = renderHook(() => useGameScriptDiagnostics(document, open));
  await act(async () => { await result.current.run(); });
  expect(result.current.summary).toBe("First error at tick 1: Collider asset fetch failed");
  expect(result.current.error).toBeNull();
  expect(result.current.running).toBe(false);
});
