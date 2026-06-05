import { describe, it, expect, beforeEach } from "vitest";

let registerCostReconciler: typeof import("../src/cost-reconciler.js").registerCostReconciler;
let getCostReconciler: typeof import("../src/cost-reconciler.js").getCostReconciler;

beforeEach(async () => {
  const mod = await import("../src/cost-reconciler.js");
  registerCostReconciler = mod.registerCostReconciler;
  getCostReconciler = mod.getCostReconciler;
});

describe("cost-reconciler registry", () => {
  it("returns undefined for unregistered provider", () => {
    expect(getCostReconciler("nonexistent-provider")).toBeUndefined();
  });

  it("registers and retrieves a reconciler", () => {
    const reconciler = async () => ({ cost: 0.42 });
    registerCostReconciler("test-provider", reconciler);
    expect(getCostReconciler("test-provider")).toBe(reconciler);
  });

  it("last registration wins for the same provider", () => {
    const first = async () => ({ cost: 1.0 });
    const second = async () => ({ cost: 2.0 });
    registerCostReconciler("dup-provider", first);
    registerCostReconciler("dup-provider", second);
    expect(getCostReconciler("dup-provider")).toBe(second);
  });

  it("supports multiple providers independently", () => {
    const providerA = async () => ({ cost: 10 });
    const providerB = async () => ({ cost: 20 });
    registerCostReconciler("provider-a", providerA);
    registerCostReconciler("provider-b", providerB);
    expect(getCostReconciler("provider-a")).toBe(providerA);
    expect(getCostReconciler("provider-b")).toBe(providerB);
  });

  it("reconciler returns expected cost structure", async () => {
    const reconciler = async (input: { requestId: string }) => ({
      cost: 0.05,
      currency: "USD",
      quantity: 1,
      unit_price: 0.05
    });
    registerCostReconciler("structured", reconciler);
    const resolved = getCostReconciler("structured")!;
    const result = await resolved({ requestId: "req-123" });
    expect(result).toEqual({
      cost: 0.05,
      currency: "USD",
      quantity: 1,
      unit_price: 0.05
    });
  });

  it("reconciler can return null for unknown requests", async () => {
    const reconciler = async () => null;
    registerCostReconciler("nullable", reconciler);
    const resolved = getCostReconciler("nullable")!;
    expect(await resolved({ requestId: "unknown" })).toBeNull();
  });
});
