/**
 * Invocation-scoped accounting and the resolved-secret registry — the two
 * pieces of run state the supervisor's retry-safety rule and its redaction
 * layer are built on.
 *
 * See docs/workflow-supervisor-design.md §5.3 and §6.1.
 */

import { describe, it, expect } from "vitest";
import {
  createInvocationAccount,
  inInvocationAccount,
  recordInvocationAsset,
  recordInvocationCost,
  currentInvocationAccount
} from "../src/invocation-account.js";
import { ProcessingContext } from "../src/context.js";

describe("invocation accounting", () => {
  it("attributes concurrent invocations that finish in reverse order", async () => {
    // The failure this rules out: actor A's charge landing on actor B because
    // A completed first. A stack on the shared context would do exactly that.
    const slow = createInvocationAccount();
    const fast = createInvocationAccount();

    await Promise.all([
      inInvocationAccount(slow, async () => {
        recordInvocationCost(1);
        await new Promise((r) => setTimeout(r, 20));
        recordInvocationCost(0.5);
      }),
      inInvocationAccount(fast, async () => {
        recordInvocationCost(2);
      })
    ]);

    expect(slow.costUsd).toBe(1.5);
    expect(fast.costUsd).toBe(2);
  });

  it("records an asset write even when the invocation then throws", async () => {
    const account = createInvocationAccount();
    await expect(
      inInvocationAccount(account, async () => {
        recordInvocationAsset();
        throw new Error("published, then died");
      })
    ).rejects.toThrow("published, then died");
    expect(account.createdAssets).toBe(true);
  });

  it("treats an unusable cost as spending, not as free", async () => {
    // "We cannot add this up" must not read as "this was free": a NaN dropped
    // silently would leave the invocation looking cost-free and re-earn a
    // retry after a real charge.
    const account = createInvocationAccount();
    await inInvocationAccount(account, async () => {
      recordInvocationCost(Number.NaN);
    });
    expect(account.costUsd).toBeGreaterThan(0);
    expect(Number.isFinite(account.costUsd)).toBe(true);
  });

  it("ignores an absent cost", async () => {
    const account = createInvocationAccount();
    await inInvocationAccount(account, async () => {
      recordInvocationCost(undefined);
      recordInvocationCost(null);
      recordInvocationCost(0);
    });
    expect(account.costUsd).toBe(0);
  });

  it("is inert outside an invocation", () => {
    expect(currentInvocationAccount()).toBeUndefined();
    expect(() => recordInvocationCost(1)).not.toThrow();
    expect(() => recordInvocationAsset()).not.toThrow();
  });

  it("charges the enclosing invocation when a node reports a provider cost", async () => {
    const context = new ProcessingContext({ jobId: "j1" });
    const account = createInvocationAccount();
    await inInvocationAccount(account, async () => {
      context.setProviderCost("fal", 0.42, "usd");
    });
    expect(account.costUsd).toBe(0.42);
  });
});

describe("resolved-secret registry", () => {
  it("records every value the resolver hands out", async () => {
    const context = new ProcessingContext({ jobId: "j1" });
    context.setSecretResolver((key) =>
      key === "OPENAI_API_KEY" ? "sk-live-0123456789" : null
    );

    expect(context.getResolvedSecretValues().size).toBe(0);
    await context.getSecret("OPENAI_API_KEY");
    expect([...context.getResolvedSecretValues()]).toEqual([
      "sk-live-0123456789"
    ]);

    await context.getSecret("MISSING");
    expect(context.getResolvedSecretValues().size).toBe(1);
  });

  it("ignores values too short to mask without collateral damage", async () => {
    const context = new ProcessingContext({ jobId: "j1" });
    context.setSecretResolver(() => "on");
    await context.getSecret("FLAG");
    expect(context.getResolvedSecretValues().size).toBe(0);
  });
});
