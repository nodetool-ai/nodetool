/**
 * The ledger row a direct media generation writes.
 *
 * The row's own invariant is `cost = unit_price × quantity`. The path used to
 * record a quantity and no unit price at all, and priced the model with no
 * parameters — so a five-second clip was estimated (and gated) at one second
 * of output.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { getModelUnitPrice } from "@nodetool-ai/model-pricing";
import { initTestDb, Prediction } from "@nodetool-ai/models";
import type { TextToVideoParams } from "@nodetool-ai/runtime";

import { WebSocketClientSession } from "../src/websocket-client-session.js";

vi.mock("../src/lib/thumbnail.js", () => ({
  storeAssetWithThumbnail: vi.fn(async () => undefined)
}));

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  class FakeAsset {
    id = "asset-1";
    size = 0;
    user_id = "1";
    constructor(fields: Record<string, unknown>) {
      Object.assign(this, fields);
    }
    async save(): Promise<void> {}
    static find = vi.fn();
  }
  return { ...actual, Asset: FakeAsset };
});

/** A curated video model whose delegate the catalog bills per second. */
const MODEL = "nodetool/kling-turbo";
const SECONDS = 5;

const makeRunner = (totalCost: number): WebSocketClientSession =>
  new WebSocketClientSession({
    userId: "1",
    resolveExecutor: () => undefined as never,
    resolveProvider: (async () => ({
      provider: "fake",
      getTotalCost: () => totalCost,
      async textToVideo(_params: TextToVideoParams): Promise<Uint8Array> {
        return new Uint8Array([0x00, 0x00, 0x00, 0x18]);
      }
    })) as never
  });

const generate = async (
  runner: WebSocketClientSession
): Promise<{ asset_ids: string[] }> =>
  runner.inference.runDirectMediaGeneration({
    mode: "video",
    provider: "nodetool",
    model: MODEL,
    prompt: "slow push in",
    durationSeconds: SECONDS,
    variations: 1
  });

describe("direct media generation cost row", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("prices the clip the request asked for, and records the unit behind it", async () => {
    const perSecond = getModelUnitPrice(
      { id: MODEL, provider: "nodetool" },
      { seconds: SECONDS }
    );
    const perRun = getModelUnitPrice({ id: MODEL, provider: "nodetool" });
    // The duration is what separates them — without it the row prices 1 s.
    expect(perSecond?.unit_price).toBeGreaterThan(perRun?.unit_price ?? 0);

    await generate(makeRunner(0));

    const [rows] = await Prediction.paginate("1", { provider: "nodetool" });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.cost).toBeCloseTo(perSecond?.unit_price ?? 0);
    expect(row.billing_unit).toBe("seconds");
    expect(row.quantity).toBe(1);
    // The row reproduces its own total.
    expect((row.unit_price ?? 0) * (row.quantity ?? 0)).toBeCloseTo(
      row.cost ?? 0
    );
  });

  it("keeps the invariant when the delegate tracked more than the estimate", async () => {
    await generate(makeRunner(9));
    const [rows] = await Prediction.paginate("1", { provider: "nodetool" });
    const row = rows[0];
    expect(row.cost).toBeCloseTo(9);
    expect((row.unit_price ?? 0) * (row.quantity ?? 0)).toBeCloseTo(9);
  });
});
