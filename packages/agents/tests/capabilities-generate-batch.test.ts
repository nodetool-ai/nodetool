/**
 * `generate_batch`: requests run through `run.invoke`, a failed request does
 * not stop the others, and every change is reported as one
 * `generation_batch_update` naming the call's own tool-call id.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { initTestDb } from "@nodetool-ai/models";
import type { GenerationBatchUpdate, ProcessingMessage } from "@nodetool-ai/protocol";
import { ProcessingContext } from "@nodetool-ai/runtime";
import { module as media } from "../src/capabilities/media.js";
import type { CapabilityRun } from "../src/capabilities/types.js";

const batch = media.exports.find((c) => c.spec.name === "generate_batch")!;

function harness(invoke: (name: string, args: Record<string, unknown>) => Promise<unknown>) {
  const context = new ProcessingContext({ jobId: "job-1", userId: "u1" });
  const updates: GenerationBatchUpdate[] = [];
  context.addMessageListener((message: ProcessingMessage) => {
    if (message.type === "generation_batch_update") updates.push(message);
  });
  const run = { context, invoke } as unknown as CapabilityRun;
  return { run, updates };
}

describe("generate_batch", () => {
  beforeEach(() => initTestDb());

  it("runs every request, reports progress, and keeps going past a failure", async () => {
    let inFlight = 0;
    let peak = 0;
    const calls: string[] = [];
    const { run, updates } = harness(async (name, args) => {
      calls.push(`${name}:${String(args["prompt"])}`);
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      if (args["prompt"] === "bad") return { error: "provider refused" };
      return { type: "image", asset_id: `a-${String(args["prompt"])}`, asset_uri: `asset://a-${String(args["prompt"])}.png` };
    });

    const result = (await batch.impl(run, {
      _tool_call_id: "call-7",
      concurrency: 2,
      requests: [
        { tool: "generate_image", label: "Shot 1", args: { provider: "p", model: "m", prompt: "one" } },
        { tool: "generate_image", args: { provider: "p", model: "m", prompt: "bad" } },
        { tool: "animate_image", label: "Shot 1 clip", args: { provider: "p", model: "v", prompt: "two" } }
      ]
    })) as { completed: number; failed: number; results: Array<Record<string, unknown>> };

    expect(calls).toHaveLength(3);
    expect(peak).toBeLessThanOrEqual(2);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.results.map((r) => r["status"])).toEqual(["completed", "failed", "completed"]);
    expect(result.results[0]).toMatchObject({ label: "Shot 1", uri: "asset://a-one.png", asset_id: "a-one" });
    expect(result.results[1]).toMatchObject({ label: "generate image 2", error: "provider refused" });

    expect(updates.every((u) => u.tool_call_id === "call-7" && u.concurrency === 2)).toBe(true);
    expect(updates[0]!.items.map((i) => i.status)).toEqual(["queued", "queued", "queued"]);
    // No history for these models: the per-tool default applies.
    expect(updates[0]!.items.map((i) => i.estimate_seconds)).toEqual([20, 20, 120]);
    const last = updates[updates.length - 1]!;
    expect(last.items.map((i) => i.status)).toEqual(["completed", "failed", "completed"]);
    expect(last.items.every((i) => i.started_at && i.finished_at)).toBe(true);
  });

  it("refuses a request naming a tool outside the media set", async () => {
    const { run, updates } = harness(async () => ({}));
    const result = await batch.impl(run, { requests: [{ tool: "delete_workflow", args: {} }] });
    expect(result).toMatchObject({ error: expect.stringContaining("requests[0]") });
    expect(updates).toHaveLength(0);
  });
});
