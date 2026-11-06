import type { GenerationBatchItem } from "@nodetool-ai/protocol";
import { generationBatchProgress } from "../generationBatchProgress";

const item = (status: GenerationBatchItem["status"], estimate: number, startedAt?: number): GenerationBatchItem => ({
  id: String(Math.random()), label: "x", tool: "generate_image", status, estimate_seconds: estimate,
  ...(startedAt !== undefined && { started_at: startedAt })
});

describe("generationBatchProgress", () => {
  it("places queued requests on the lane that frees first", () => {
    // Two lanes: one running request has 10s left, the other is free.
    // Queued 30s goes to the free lane, queued 20s after the 10s one: 30s total.
    const progress = generationBatchProgress(
      [item("running", 20, 0), item("queued", 30), item("queued", 20)],
      2,
      10_000
    );
    expect(progress.remainingSeconds).toBe(30);
    expect(progress.done).toBe(0);
    expect(progress.percent).toBeCloseTo((10 / 70) * 100);
  });

  it("caps an overdue request below done and ends at 100 when all settle", () => {
    const overdue = generationBatchProgress([item("running", 10, 0)], 1, 60_000);
    expect(overdue.percent).toBeCloseTo(95);
    expect(overdue.remainingSeconds).toBe(1);
    const finished = generationBatchProgress([item("completed", 10), item("failed", 10)], 1, 0);
    expect(finished).toMatchObject({ done: 1, failed: 1, percent: 100, remainingSeconds: null });
  });
});
