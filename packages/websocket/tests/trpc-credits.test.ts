import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { creditStatus, initTestDb } from "@nodetool-ai/models";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

const createCaller = createCallerFactory(appRouter);

function makeCtx(): Context {
  return {
    userId: "user-credits",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false
  };
}

describe("credits.setPlan", () => {
  const saved = process.env.NODETOOL_ENABLE_TEST_TOPUP;

  beforeEach(() => {
    initTestDb();
    delete process.env.NODETOOL_ENABLE_TEST_TOPUP;
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.NODETOOL_ENABLE_TEST_TOPUP;
    else process.env.NODETOOL_ENABLE_TEST_TOPUP = saved;
  });

  it("refuses a paid plan without a payment provider, granting nothing", async () => {
    const caller = createCaller(makeCtx());
    const before = await caller.credits.status();
    await expect(
      caller.credits.setPlan({ planId: "pro" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const after = await creditStatus("user-credits");
    expect(after.plan.id).toBe(before.plan.id);
    expect(after.grantedCredits).toBe(before.grantedCredits);
  });

  it("still switches to the free plan", async () => {
    const caller = createCaller(makeCtx());
    const status = await caller.credits.setPlan({ planId: "free" });
    expect(status.plan.id).toBe("free");
  });

  it("allows paid plans on a server that opted into test credits", async () => {
    process.env.NODETOOL_ENABLE_TEST_TOPUP = "1";
    const caller = createCaller(makeCtx());
    const status = await caller.credits.setPlan({ planId: "pro" });
    expect(status.plan.id).toBe("pro");
  });
});
