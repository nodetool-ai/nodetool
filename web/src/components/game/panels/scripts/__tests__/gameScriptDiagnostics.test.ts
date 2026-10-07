import { runGameScriptDiagnostic } from "../gameScriptDiagnostics";

function session() {
  return {
    step: jest.fn(() => ({ scriptStats: {
      durationMs: 2, calls: 3, commands: 1,
      byEntity: { player: { durationMs: 2, calls: 3 } }
    } })),
    dispose: jest.fn()
  };
}

it("aggregates ten seconds of ticks and disposes its independent session", async () => {
  const diagnostic = session();
  const yieldBatch = jest.fn(async () => undefined);
  const report = await runGameScriptDiagnostic({
    tickRate: 4, signal: new AbortController().signal,
    openSession: async () => diagnostic, yieldBatch
  });
  expect(diagnostic.step).toHaveBeenCalledTimes(40);
  expect(report).toEqual({ ticks: 40, calls: 120, durationMs: 80,
    byEntity: [{ entityId: "player", calls: 120, durationMs: 80 }], error: null });
  expect(yieldBatch).toHaveBeenCalledTimes(1);
  expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
});

it("reports the first failing tick and disposes the failed session", async () => {
  const diagnostic = session();
  diagnostic.step.mockImplementationOnce(() => ({ scriptStats: {
    durationMs: 2, calls: 3, commands: 1, byEntity: { player: { durationMs: 2, calls: 3 } }
  } })).mockImplementationOnce(() => { throw new Error("Game script [\"scene\",\"player\",0] failed"); });
  const report = await runGameScriptDiagnostic({
    tickRate: 4, signal: new AbortController().signal,
    openSession: async () => diagnostic, yieldBatch: async () => undefined
  });
  expect(report.ticks).toBe(1);
  expect(report.error).toEqual({ tick: 2, message: "Game script [\"scene\",\"player\",0] failed" });
  expect(diagnostic.step).toHaveBeenCalledTimes(2);
  expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
});

it("disposes a session returned after preparation was cancelled", async () => {
  const controller = new AbortController();
  const diagnostic = session();
  await expect(runGameScriptDiagnostic({
    tickRate: 4, signal: controller.signal,
    openSession: async () => { controller.abort(); return diagnostic; },
    yieldBatch: async () => undefined
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(diagnostic.step).not.toHaveBeenCalled();
  expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
});

it.each([3, 6])("cancels after a batch yield before more ticks or a final report at rate %s", async (tickRate) => {
  const controller = new AbortController();
  const diagnostic = session();
  await expect(runGameScriptDiagnostic({
    tickRate, signal: controller.signal, openSession: async () => diagnostic,
    yieldBatch: async () => { controller.abort(); }
  })).rejects.toMatchObject({ name: "AbortError" });
  expect(diagnostic.step).toHaveBeenCalledTimes(30);
  expect(diagnostic.dispose).toHaveBeenCalledTimes(1);
});
