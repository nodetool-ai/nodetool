/**
 * The ledger row a chat turn's provider call writes.
 *
 * A provider that could not price a call keeps its token counts and reports
 * why. The row then carries a null cost and the reason, so `nodetool costs`
 * counts it as unpriced — a zero would sum as free, which is the one thing a
 * billed call is not.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { initTestDb, Prediction } from "@nodetool-ai/models";
import type { BaseProvider } from "@nodetool-ai/runtime";

import { UnifiedWebSocketRunner } from "../src/unified-websocket-runner.js";

const provider = (cost: number, unpricedReason: string | null): BaseProvider =>
  ({ cost, unpricedReason }) as unknown as BaseProvider;

const logCall = (runner: UnifiedWebSocketRunner, p: BaseProvider) =>
  (
    runner as unknown as {
      _logProviderCall(
        userId: string,
        provider: BaseProvider,
        providerId: string,
        model: string,
        workflowId: string | null
      ): Promise<void>;
    }
  )._logProviderCall("1", p, "openai", "gpt-4o", null);

describe("provider call cost row", () => {
  let runner: UnifiedWebSocketRunner;

  beforeEach(() => {
    initTestDb();
    runner = new UnifiedWebSocketRunner({
      resolveExecutor: () => undefined as never
    });
  });

  const onlyRow = async (): Promise<Prediction> => {
    const [rows] = await Prediction.paginate("1", { provider: "openai" });
    expect(rows).toHaveLength(1);
    return rows[0];
  };

  it("records a priced call at its cost", async () => {
    await logCall(runner, provider(0.12, null));
    const row = await onlyRow();
    expect(row.cost).toBeCloseTo(0.12);
    expect(row.metadata).toBeNull();
  });

  it("records an unpriced call as null, with the reason", async () => {
    await logCall(runner, provider(0, "No unit price for openai/gpt-4o: boom"));
    const row = await onlyRow();
    expect(row.cost).toBeNull();
    expect(row.metadata).toMatchObject({
      unpriced_reason: "No unit price for openai/gpt-4o: boom"
    });
  });

  it("keeps a total that did price part of the turn", async () => {
    // One unpriced call among several priced ones: the money that was measured
    // still counts, and the reason says the figure is a floor.
    await logCall(runner, provider(0.3, "No unit price for openai/gpt-4o: boom"));
    const row = await onlyRow();
    expect(row.cost).toBeCloseTo(0.3);
    expect(row.metadata).toMatchObject({ unpriced_reason: expect.any(String) });
  });
});
