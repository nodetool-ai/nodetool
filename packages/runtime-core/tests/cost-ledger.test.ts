import { describe, expect, it } from "vitest";
import { CostLedger } from "../src/cost-ledger.js";

describe("CostLedger", () => {
  it("adds finite costs and counts the rest as zero", () => {
    const ledger = new CostLedger();
    ledger.add(1.5);
    ledger.add(Number.NaN);
    ledger.add(Number.POSITIVE_INFINITY);
    ledger.track("render", 0.25, { node: "n1" });
    ledger.track("broken", Number.NaN);
    expect(ledger.total).toBe(1.75);
    expect(ledger.operations).toEqual([
      expect.objectContaining({ operation: "render", cost: 0.25, node: "n1" }),
      expect.objectContaining({ operation: "broken", cost: 0 })
    ]);
  });

  it("clones into an independent ledger", () => {
    const parent = new CostLedger();
    parent.track("a", 1);
    const child = parent.clone();
    child.add(2);
    expect(parent.total).toBe(1);
    expect(child.total).toBe(3);
    expect(child.operations[0]).toEqual(parent.operations[0]);
    expect(child.operations[0]).not.toBe(parent.operations[0]);
  });

  it("resets the total and the entries", () => {
    const ledger = new CostLedger();
    ledger.track("a", 1);
    ledger.reset();
    expect(ledger.total).toBe(0);
    expect(ledger.operations).toEqual([]);
  });
});
