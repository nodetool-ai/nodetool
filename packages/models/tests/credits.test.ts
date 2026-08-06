import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Prediction } from "../src/prediction.js";
import {
  CREDIT_PLANS,
  USD_PER_CREDIT,
  checkCredits,
  creditStatus,
  ensureMonthlyGrant,
  getSubscription,
  grantCredits,
  periodKeyFor,
  setSubscriptionPlan
} from "../src/credits.js";

const USER = "u1";
const FREE = CREDIT_PLANS.find((p) => p.id === "free")!;
const CREATOR = CREDIT_PLANS.find((p) => p.id === "creator")!;

const spend = (cost: number, provider = "nodetool") =>
  Prediction.create<Prediction>({
    user_id: USER,
    node_id: "n",
    node_type: "test",
    provider,
    model: "test",
    cost
  });

describe("credits", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("defaults a new user to the free plan and accrues its monthly grant once", async () => {
    const sub = await getSubscription(USER);
    expect(sub.planId).toBe("free");

    const first = await creditStatus(USER);
    expect(first.grantedCredits).toBe(FREE.monthlyCredits);
    expect(first.balanceCredits).toBe(FREE.monthlyCredits);
    expect(first.periodKey).toBe(periodKeyFor(new Date()));

    // A second read in the same month must not double-grant.
    const second = await creditStatus(USER);
    expect(second.grantedCredits).toBe(FREE.monthlyCredits);
  });

  it("accrues again in a new month", async () => {
    await creditStatus(USER);
    const nextMonth = new Date();
    nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
    await ensureMonthlyGrant(USER, nextMonth);
    const status = await creditStatus(USER);
    expect(status.grantedCredits).toBe(FREE.monthlyCredits * 2);
  });

  it("subtracts prediction spend, rounded up to whole credits", async () => {
    await creditStatus(USER);
    await spend(0.015); // 1.5 credits → counts as 2
    const status = await creditStatus(USER);
    expect(status.spentCredits).toBe(2);
    expect(status.balanceCredits).toBe(FREE.monthlyCredits - 2);
  });

  it("switching plans grants the new plan's month immediately", async () => {
    await creditStatus(USER);
    const sub = await setSubscriptionPlan(USER, "creator");
    expect(sub.planId).toBe("creator");
    const status = await creditStatus(USER);
    expect(status.plan.id).toBe("creator");
    expect(status.grantedCredits).toBe(
      FREE.monthlyCredits + CREATOR.monthlyCredits
    );
  });

  it("top-ups add to the balance", async () => {
    await creditStatus(USER);
    await grantCredits(USER, 500, "topup");
    const status = await creditStatus(USER);
    expect(status.balanceCredits).toBe(FREE.monthlyCredits + 500);
  });

  it("refuses an empty balance and an estimate beyond the balance", async () => {
    await creditStatus(USER);
    await spend(FREE.monthlyCredits * USD_PER_CREDIT); // drain exactly

    const drained = await checkCredits(USER, 0);
    expect(drained.allowed).toBe(false);

    await grantCredits(USER, 10, "topup");
    const small = await checkCredits(USER, 5 * USD_PER_CREDIT);
    expect(small.allowed).toBe(true);
    const big = await checkCredits(USER, 50 * USD_PER_CREDIT);
    expect(big.allowed).toBe(false);
    if (!big.allowed) {
      expect(big.reason).toContain("credits");
    }
  });

  it("only managed-provider spend counts — BYOK predictions never drain credits", async () => {
    await creditStatus(USER);
    await spend(0.5, "fal_ai");
    await spend(1.25, "anthropic");
    const untouched = await creditStatus(USER);
    expect(untouched.spentCredits).toBe(0);
    expect(untouched.balanceCredits).toBe(FREE.monthlyCredits);

    await spend(0.02, "nodetool");
    const managed = await creditStatus(USER);
    expect(managed.spentCredits).toBe(2);
  });

  it("credits are per user", async () => {
    await creditStatus(USER);
    await creditStatus("u2");
    await spend(0.5);
    const other = await creditStatus("u2");
    expect(other.spentCredits).toBe(0);
    expect(other.balanceCredits).toBe(FREE.monthlyCredits);
  });
});
