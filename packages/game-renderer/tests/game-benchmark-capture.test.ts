import { expect, it } from "vitest";
import { captureGameFrame3D } from "../src/node3d.js";
import { blockoutFrame } from "./fixtures/game3d.js";

it("reports browser frame latency and renderer counters through capture", async () => {
  const capture = await captureGameFrame3D(blockoutFrame(), { benchmarkFrames: 3, executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH });
  expect(capture.benchmark).toMatchObject({ frames: 3, gpuCompletion: true });
  expect(capture.benchmark?.frameMs.p50).toBeGreaterThanOrEqual(0);
  expect(capture.benchmark?.frameMs.p95).toBeLessThanOrEqual(capture.benchmark?.frameMs.p99 ?? 0);
  expect(capture.benchmark?.browser).toContain("Chrome");
  expect(capture.stats.drawCalls).toBeGreaterThan(0);
  expect(capture.stats.triangles).toBeGreaterThan(0);
}, 40_000);

it.each([0, -1, 1.5, 10001])("rejects invalid benchmark frame count %s", async (frames) => {
  await expect(captureGameFrame3D(blockoutFrame(), { benchmarkFrames: frames })).rejects.toThrow("Benchmark frames");
});
