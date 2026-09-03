import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { initTestDb, grantCredits, Prediction } from "@nodetool-ai/models";
import {
  admitSpend,
  releaseSpend,
  reserveSpend,
  reservedSpendUsd
} from "../src/credit-gate.js";

const USER = "u1";

describe("credit gate", () => {
  let savedSignup: string | undefined;
  let savedModels: string | undefined;

  beforeEach(() => {
    // The balance arithmetic below is stated in the free plan's grant, so the
    // welcome grant is off and the whitelist unset unless a test sets them.
    savedSignup = process.env.NODETOOL_SIGNUP_CREDITS;
    savedModels = process.env.NODETOOL_CREDIT_MODELS;
    process.env.NODETOOL_SIGNUP_CREDITS = "0";
    delete process.env.NODETOOL_CREDIT_MODELS;
    initTestDb();
  });

  afterEach(() => {
    if (savedSignup === undefined) delete process.env.NODETOOL_SIGNUP_CREDITS;
    else process.env.NODETOOL_SIGNUP_CREDITS = savedSignup;
    if (savedModels === undefined) delete process.env.NODETOOL_CREDIT_MODELS;
    else process.env.NODETOOL_CREDIT_MODELS = savedModels;
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

  it("in-flight reservations count against the balance until released", async () => {
    // Free grant = 300 credits = $3. Two concurrent $2 runs must not both
    // pass: the first reserves, the second sees the reservation and refuses.
    const first = await admitSpend(USER, 2);
    expect(first.allowed).toBe(true);
    reserveSpend(USER, "job-1", 2);

    const second = await admitSpend(USER, 2);
    expect(second.allowed).toBe(false);

    releaseSpend(USER, "job-1");
    expect(reservedSpendUsd(USER)).toBe(0);
    const afterRelease = await admitSpend(USER, 2);
    expect(afterRelease.allowed).toBe(true);
  });

  it("releasing an unknown reservation is a no-op", () => {
    releaseSpend(USER, "never-reserved");
    expect(reservedSpendUsd(USER)).toBe(0);
  });

  it("refuses a model outside the operator's whitelist", async () => {
    process.env.NODETOOL_CREDIT_MODELS = "nodetool/flux-schnell";

    const allowed = await admitSpend(USER, 0.01, ["nodetool/flux-schnell"]);
    expect(allowed.allowed).toBe(true);

    const refused = await admitSpend(USER, 0.01, ["nodetool/seedream"]);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.refusal).toBe("model_not_allowed");
      expect(refused.reason).toContain("nodetool/seedream");
    }
  });

  it("names the balance, not the model, when no whitelist is configured", async () => {
    const decision = await admitSpend(USER, 100, ["nodetool/seedream"]);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.refusal).toBe("insufficient_credits");
    }
  });
});
