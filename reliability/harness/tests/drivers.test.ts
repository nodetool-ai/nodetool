/**
 * C2 done-when (docs/RELIABILITY_TASKS.md Track C): journeys 1, 3, 6, 13 run
 * green on both the kernel and ws-server drivers, and each journey's
 * normalized kernel-vs-ws-server diff is clean.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../src/core/journey.js";
import { normalizeRunRecord } from "../src/core/normalize.js";
import { diffNormalizedRecords, streamDiffIsEmpty, formatStreamDiff } from "../src/core/diff.js";
import { KernelDriver } from "../src/drivers/kernel.js";
import { WsServerDriver } from "../src/drivers/ws-server.js";
import type { RunDriver } from "../src/drivers/types.js";

const JOURNEYS_DIR = resolve(__dirname, "../../journeys");

const kernelDriver: RunDriver = new KernelDriver();
const wsServerDriver: RunDriver = new WsServerDriver();

async function load(name: string): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, name));
}

describe.each([
  { name: "linear-text-pipeline", expectedStatus: "completed" },
  { name: "fan-out-fan-in-dag", expectedStatus: "completed" },
  { name: "fan-in-shared-list-handle", expectedStatus: "completed" },
  { name: "error-in-one-branch", expectedStatus: "failed" },
  { name: "mid-run-cancel-node", expectedStatus: "cancelled" },
  { name: "mid-run-cancel-streaming", expectedStatus: "cancelled" }
])("journey $name", ({ name, expectedStatus }) => {
  it(
    "runs green on the kernel driver",
    { timeout: 30000 },
    async () => {
      const journey = await load(name);
      const record = await kernelDriver.run(journey);
      expect(record.surface).toBe("kernel");
      expect(record.status).toBe(expectedStatus);
    }
  );

  it(
    "runs green on the ws-server driver",
    { timeout: 30000 },
    async () => {
      const journey = await load(name);
      const record = await wsServerDriver.run(journey);
      expect(record.surface).toBe("ws-server");
      expect(record.status).toBe(expectedStatus);
    }
  );

  it(
    "diffs clean between kernel and ws-server",
    { timeout: 30000 },
    async () => {
      const journey = await load(name);
      const [kernelRecord, wsRecord] = await Promise.all([
        kernelDriver.run(journey),
        wsServerDriver.run(journey)
      ]);

      const kernelNormalized = normalizeRunRecord(kernelRecord);
      const wsNormalized = normalizeRunRecord(wsRecord);

      // The ws-server record carries client_to_server command frames the
      // kernel driver has no wire to produce (§12: "the ws-server driver is
      // the one surface where that distinction is real"). Comparing only
      // server_to_client frames is the apples-to-apples diff — both drivers
      // built server_to_client from the exact same ProcessingMessage stream.
      const onlyServerToClient = (record: typeof kernelNormalized) => ({
        ...record,
        frames: record.frames.filter((f) => f.direction === "server_to_client")
      });

      const diff = diffNormalizedRecords(
        onlyServerToClient(kernelNormalized),
        onlyServerToClient(wsNormalized)
      );

      expect(streamDiffIsEmpty(diff), formatStreamDiff(diff)).toBe(true);
    }
  );
});
