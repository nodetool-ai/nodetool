import { describe, it, expect, beforeEach } from "vitest";

import { initTestDb } from "../src/db.js";
import { Application } from "../src/application.js";
import {
  applicationUsage,
  checkApplicationBudget,
  getApplicationBudget,
  listInvocations,
  periodStart,
  recordInvocation,
  reserveInvocation,
  setApplicationBudget,
  settleInvocation
} from "../src/application-budget.js";

const APP = "app-1";
const OTHER_APP = "app-2";

/**
 * Budgets and ledger rows are children of an application row — the foreign key
 * is what keeps a deleted app's spend from being inherited — so the parents
 * exist before anything is booked against them.
 */
const seedApps = async () => {
  for (const id of [APP, OTHER_APP]) {
    await Application.create<Application>({ id, user_id: "u1" });
  }
};

const run = (invocationId: string, estimatedUsd: number) =>
  recordInvocation({ applicationId: APP, invocationId, estimatedUsd });

describe("application budgets", () => {
  beforeEach(async () => {
    initTestDb();
    await seedApps();
  });

  it("allows any run when no budget is configured", async () => {
    const decision = await checkApplicationBudget(APP, 1000);
    expect(decision.allowed).toBe(true);
  });

  it("creates then updates a budget in place", async () => {
    await setApplicationBudget(APP, { period: "day", maxUsd: 5 });
    const updated = await setApplicationBudget(APP, { maxInvocations: 10 });
    expect(updated).toMatchObject({
      period: "day",
      maxUsd: 5,
      maxInvocations: 10
    });
    expect(await getApplicationBudget(APP)).toMatchObject({ maxUsd: 5 });
  });

  it("refuses a run that would cross the spend ceiling", async () => {
    await setApplicationBudget(APP, { period: "total", maxUsd: 1 });
    await run("job-1", 0.8);

    const ok = await checkApplicationBudget(APP, 0.1);
    expect(ok.allowed).toBe(true);

    const refused = await checkApplicationBudget(APP, 0.5);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.reason).toMatch(/budget/);
    }
  });

  it("refuses a run that would cross the invocation ceiling", async () => {
    await setApplicationBudget(APP, { period: "total", maxInvocations: 2 });
    await run("job-1", 0);
    await run("job-2", 0);
    const refused = await checkApplicationBudget(APP, 0);
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) expect(refused.reason).toMatch(/2 of its 2/);
  });

  it("counts an unsettled run at its estimate, then at its actual", async () => {
    await run("job-1", 2);
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(2);

    await settleInvocation(APP, "job-1", 0.25);
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(0.25);
  });

  it("settling an unknown invocation reports nothing rather than throwing", async () => {
    expect(await settleInvocation(APP, "ghost", 1)).toBeNull();
  });

  it("leaves an invocation belonging to another application untouched", async () => {
    await run("job-1", 2);

    expect(await settleInvocation(OTHER_APP, "job-1", 0)).toBeNull();

    const [row] = await listInvocations(APP);
    expect(row).toMatchObject({ actualUsd: null, status: "running" });
    expect(row.settledAt).toBeNull();
    // The reservation still stands, so the spend was not handed back.
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(2);
  });

  it("keeps the estimate standing when nothing measured the cost", async () => {
    await run("job-1", 2);
    const settled = await settleInvocation(APP, "job-1", null);
    expect(settled).toMatchObject({ status: "completed", actualUsd: null });
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(2);
  });

  it("scopes usage to another application's ledger", async () => {
    await run("job-1", 3);
    await recordInvocation({
      applicationId: OTHER_APP,
      invocationId: "job-2",
      estimatedUsd: 9
    });
    expect((await applicationUsage(APP, "total")).spentUsd).toBe(3);
    expect((await listInvocations(APP)).map((r) => r.invocationId)).toEqual([
      "job-1"
    ]);
  });

  it("records the run's telemetry keys", async () => {
    const record = await recordInvocation({
      applicationId: APP,
      version: 3,
      invocationId: "job-x",
      operationId: "publish",
      estimatedUsd: 0.5
    });
    expect(record).toMatchObject({
      applicationId: APP,
      version: 3,
      invocationId: "job-x",
      operationId: "publish",
      status: "running",
      actualUsd: null
    });
  });

  it("keeps one invocation id per application", async () => {
    await run("job-unique", 0);

    await expect(run("job-unique", 0)).rejects.toThrow();
    expect(await listInvocations(APP)).toHaveLength(1);
  });

  it("fails a public reservation closed without a finite limit", async () => {
    const missing = await reserveInvocation({
      applicationId: APP,
      invocationId: "job-public-missing",
      requireFiniteBudget: true
    });
    expect(missing).toMatchObject({
      allowed: false,
      reason: /finite invocation or USD budget/
    });

    await setApplicationBudget(APP, {
      maxUsd: null,
      maxInvocations: null
    });
    const unbounded = await reserveInvocation({
      applicationId: APP,
      invocationId: "job-public-unbounded",
      requireFiniteBudget: true
    });
    expect(unbounded).toMatchObject({
      allowed: false,
      reason: /finite invocation or USD budget/
    });
    expect(await listInvocations(APP)).toEqual([]);
  });
});

describe("periodStart", () => {
  const now = new Date("2026-07-25T13:45:00.000Z");

  it("floors to the UTC day, the UTC month, or nothing", () => {
    expect(periodStart("day", now)).toBe("2026-07-25T00:00:00.000Z");
    expect(periodStart("month", now)).toBe("2026-07-01T00:00:00.000Z");
    expect(periodStart("total", now)).toBeNull();
  });
});
