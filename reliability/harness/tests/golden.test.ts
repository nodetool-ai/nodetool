/**
 * Golden fixtures must decide the verdict (§4). Without these, a journey can
 * declare `assertions.outputs`/`assertions.streamShape`, ship the fixtures,
 * and have every surface return the same wrong answer while the report reads
 * OK.
 */
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { loadJourney, type Journey } from "../src/core/journey.js";
import { makeFrame, type RunRecord } from "../src/core/record.js";
import {
  checkGoldens,
  streamShapeOf,
  terminalOutputsOf
} from "../src/core/golden.js";
import { compareJourney, type CompareDriver } from "../src/compare.js";

const JOURNEYS_DIR = resolve(__dirname, "../../journeys");

async function loadLinear(): Promise<Journey> {
  return loadJourney(resolve(JOURNEYS_DIR, "linear-text-pipeline"));
}

/** Turns a golden's normalized placeholders (`<node:0>`) back into concrete
 * ids, so a synthesized record goes through the same normalization a driver's
 * record does instead of arriving pre-normalized. */
function deplaceholder(value: unknown): unknown {
  if (typeof value === "string") {
    return value.replace(/^<([a-z-]+):(\d+)>$/, "$1-$2");
  }
  if (Array.isArray(value)) return value.map(deplaceholder);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        deplaceholder(v)
      ])
    );
  }
  return value;
}

/** A record whose outputs and stream match a journey's shipped goldens. */
function goldenRecord(journey: Journey, surface: string): RunRecord {
  const shape = journey.expected.streamShape as Array<{
    channel: string;
    message: Record<string, unknown>;
  }>;
  const frames = shape.map((entry, index) => {
    const message = deplaceholder(entry.message) as Record<string, unknown>;
    // The golden carries the placeholder id; the channel carries the real
    // node id. Put the real one back so the record channels the same way a
    // driver's would.
    if (entry.channel.startsWith("node:")) {
      message["node_id"] = entry.channel.slice("node:".length);
    }
    return makeFrame(index, surface, "server_to_client", message);
  });
  return {
    journeyId: journey.manifest.name,
    surface,
    jobId: null,
    workflowId: null,
    startedAt: 0,
    finishedAt: frames.length,
    durationMs: null,
    status: "completed",
    error: null,
    params: {},
    frames,
    resourceCounters: [
      {
        at: "after",
        liveActors: 0,
        pendingControlResponses: 0,
        pendingTimers: 0,
        pythonBridgePendingRequests: 0,
        activeJobs: 0,
        startingJobs: 0
      }
    ]
  };
}

function fakeDriver(name: string, record: RunRecord): CompareDriver {
  return { name, run: async () => record };
}

describe("terminalOutputsOf", () => {
  it("keys output_update values by output_name, last value winning", () => {
    const record = goldenRecord(
      {
        expected: {
          streamShape: [
            {
              channel: "node:out1",
              message: {
                type: "output_update",
                node_id: "n1",
                output_name: "result",
                value: "first"
              }
            },
            {
              channel: "node:out1",
              message: {
                type: "output_update",
                node_id: "n1",
                output_name: "result",
                value: "last"
              }
            }
          ],
          outputs: null
        },
        manifest: { name: "x" }
      } as unknown as Journey,
      "kernel"
    );
    expect(terminalOutputsOf(record)).toEqual({ result: "last" });
  });
});

describe("checkGoldens", () => {
  it("passes when a record matches the journey's shipped fixtures", async () => {
    const journey = await loadLinear();
    const results = checkGoldens(journey, goldenRecord(journey, "kernel"));
    expect(results.map((r) => r.kind).sort()).toEqual(["outputs", "streamShape"]);
    expect(results.flatMap((r) => r.failures)).toEqual([]);
  });

  it("fails on a wrong output value", async () => {
    const journey = await loadLinear();
    const record = goldenRecord(journey, "kernel");
    const output = record.frames.find(
      (f) => (f.message as Record<string, unknown>)["type"] === "output_update"
    )!;
    (output.message as Record<string, unknown>)["value"] = "WRONG";

    const outputs = checkGoldens(journey, record).find((r) => r.kind === "outputs")!;
    expect(outputs.checked).toBe(true);
    expect(outputs.failures.join(" ")).toMatch(/output "result"/);
  });

  it("fails on a missing frame in the stream shape", async () => {
    const journey = await loadLinear();
    const record = goldenRecord(journey, "kernel");
    record.frames = record.frames.filter(
      (f) => (f.message as Record<string, unknown>)["type"] !== "edge_update"
    );

    const shape = checkGoldens(journey, record).find((r) => r.kind === "streamShape")!;
    expect(shape.failures.length).toBeGreaterThan(0);
  });

  it("tolerates cross-channel interleaving, comparing per channel", async () => {
    const journey = await loadLinear();
    const record = goldenRecord(journey, "kernel");
    // Move one node's last frame to the end of the run: the global frame
    // order changes, each channel's own order does not. (Which node id is
    // seen first is unchanged, so the normalizer's placeholders still line
    // up — see `golden.ts` on that limit.)
    const moved = record.frames.filter((f) => f.channel === "node:upper1").pop()!;
    record.frames = [...record.frames.filter((f) => f !== moved), moved];

    const shape = checkGoldens(journey, record).find((r) => r.kind === "streamShape")!;
    expect(shape.failures).toEqual([]);
  });

  it("skips (and says so) under an injected fault rather than comparing a broken run", async () => {
    const journey = await loadLinear();
    const record = goldenRecord(journey, "kernel");
    record.frames = [];

    const results = checkGoldens(journey, record, { faultsApplied: ["provider-429"] });
    expect(results.every((r) => !r.checked)).toBe(true);
    expect(results.every((r) => r.failures.length === 0)).toBe(true);
    expect(results[0].skipReason).toMatch(/provider-429/);
  });
});

describe("compareJourney golden integration", () => {
  it("fails the verdict when both surfaces agree on the wrong output", async () => {
    const journey = await loadLinear();
    const makeWrong = (surface: string): RunRecord => {
      const record = goldenRecord(journey, surface);
      for (const frame of record.frames) {
        const message = frame.message as Record<string, unknown>;
        if (message["type"] === "output_update") message["value"] = "WRONG";
      }
      return record;
    };

    const report = await compareJourney(journey, [
      fakeDriver("kernel", makeWrong("kernel")),
      fakeDriver("ws-server", makeWrong("ws-server"))
    ]);

    // The surfaces agree — the cross-surface diff is clean, which is exactly
    // why the golden has to be the thing that catches this.
    expect(report.surfaces.every((s) => s.diffVsOracleEmpty)).toBe(true);
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.some((i) => i.includes("outputs golden"))).toBe(true);
  });

  it("passes and reports the goldens as checked when both surfaces match", async () => {
    const journey = await loadLinear();
    const report = await compareJourney(journey, [
      fakeDriver("kernel", goldenRecord(journey, "kernel")),
      fakeDriver("ws-server", goldenRecord(journey, "ws-server"))
    ]);

    expect(report.verdict.ok).toBe(true);
    for (const surface of report.surfaces) {
      expect(surface.goldens.map((g) => g.checked)).toEqual([true, true]);
    }
  });
});

describe("streamShapeOf", () => {
  it("drops client_to_server frames — goldens describe what a client receives", async () => {
    const journey = await loadLinear();
    const record = goldenRecord(journey, "kernel");
    record.frames.push(
      makeFrame(999, "kernel", "client_to_server", {
        command: "cancel_job",
        data: {}
      })
    );
    expect(
      streamShapeOf(record).some((e) => "command" in e.message)
    ).toBe(false);
  });
});
