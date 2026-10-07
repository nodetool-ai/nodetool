import { createGameSession, createScriptedGameSession, createTopDownRoomGame } from "@nodetool-ai/game-runtime";
import { afterEach, expect, it, vi } from "vitest";
import { benchmarkNativeGame } from "../src/commands/game-benchmark.js";

vi.mock("@nodetool-ai/game-runtime", async (importOriginal) => {
  const original = await importOriginal<typeof import("@nodetool-ai/game-runtime")>();
  return { ...original, createScriptedGameSession: vi.fn() };
});

afterEach(() => { vi.clearAllMocks(); });

it("aggregates only measured stage durations, excluding warmup and allocation ticks", async () => {
  const document = createTopDownRoomGame("timing-samples");
  const session = createGameSession(document, 7);
  const dispose = vi.fn(() => session.dispose());
  let index = 0;
  vi.mocked(createScriptedGameSession).mockResolvedValue({
    ...session,
    dispose,
    step(input) {
      const measured = index >= 2 && index < 7;
      const duration = measured ? index - 1 : 10_000;
      index++;
      return { ...session.step(input), timings: {
        systems: [{ system: "input", durationMs: duration }, { system: "scripts", durationMs: duration * 2 }],
        totalMs: duration * 3
      } };
    }
  });
  const report = await benchmarkNativeGame(document, 5, 2, 7);
  expect(report.perSystemMs).toEqual({
    input: { p50: 3, p95: 5, p99: 5 },
    scripts: { p50: 6, p95: 10, p99: 10 }
  });
  expect(index).toBe(12);
  expect(dispose).toHaveBeenCalledOnce();
  expect(createScriptedGameSession).toHaveBeenCalledWith(document, 7, undefined, undefined, { recordTimings: true });
});

it("rejects a missing measured timing result and disposes the session", async () => {
  const document = createTopDownRoomGame("missing-timings");
  const session = createGameSession(document, 7);
  const dispose = vi.fn(() => session.dispose());
  vi.mocked(createScriptedGameSession).mockResolvedValue({ ...session, dispose });
  await expect(benchmarkNativeGame(document, 3, 1, 7)).rejects.toThrow("Missing system timings");
  expect(dispose).toHaveBeenCalledOnce();
});
