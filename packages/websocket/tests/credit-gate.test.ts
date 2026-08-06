import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { initTestDb, grantCredits, Prediction } from "@nodetool-ai/models";
import { admitSpend, creditsEnforced } from "../src/credit-gate.js";

const USER = "u1";

describe("credit gate", () => {
  beforeEach(() => {
    initTestDb();
    delete process.env.NODETOOL_CREDITS_ENFORCED;
  });

  afterEach(() => {
    delete process.env.NODETOOL_CREDITS_ENFORCED;
  });

  it("is off by default — the open platform never blocks on credits", async () => {
    expect(creditsEnforced()).toBe(false);
    const decision = await admitSpend(USER, 10_000);
    expect(decision.allowed).toBe(true);
  });

  it("when enforced, admits a funded user and refuses a drained one", async () => {
    process.env.NODETOOL_CREDITS_ENFORCED = "1";

    // First read accrues the free plan's monthly grant.
    const funded = await admitSpend(USER, 0.05);
    expect(funded.allowed).toBe(true);

    // Drain past the grant with recorded spend, then refuse.
    await grantCredits(USER, 10, "adjustment", "test");
    await Prediction.create<Prediction>({
      user_id: USER,
      node_id: "n",
      node_type: "test",
      provider: "test",
      model: "test",
      cost: 1_000
    });
    const drained = await admitSpend(USER, 0);
    expect(drained.allowed).toBe(false);
    if (!drained.allowed) {
      expect(drained.reason).toContain("credits");
    }
  });

  it("refuses an estimate beyond the balance", async () => {
    process.env.NODETOOL_CREDITS_ENFORCED = "true";
    const decision = await admitSpend(USER, 100); // $100 ≫ free grant
    expect(decision.allowed).toBe(false);
  });
});
