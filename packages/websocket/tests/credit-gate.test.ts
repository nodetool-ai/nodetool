import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb, grantCredits, Prediction } from "@nodetool-ai/models";
import { admitSpend } from "../src/credit-gate.js";

const USER = "u1";

describe("credit gate", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("admits a funded user", async () => {
    // First check accrues the free plan's monthly grant.
    const funded = await admitSpend(USER, 0.05);
    expect(funded.allowed).toBe(true);
  });

  it("refuses a drained balance", async () => {
    await grantCredits(USER, 10, "adjustment", "test");
    await Prediction.create<Prediction>({
      user_id: USER,
      node_id: "n",
      node_type: "test",
      provider: "nodetool",
      model: "nodetool/flux-schnell",
      cost: 1_000
    });
    const drained = await admitSpend(USER, 0);
    expect(drained.allowed).toBe(false);
    if (!drained.allowed) {
      expect(drained.reason).toContain("credits");
    }
  });

  it("refuses an estimate beyond the balance", async () => {
    const decision = await admitSpend(USER, 100); // $100 ≫ free grant
    expect(decision.allowed).toBe(false);
  });
});
