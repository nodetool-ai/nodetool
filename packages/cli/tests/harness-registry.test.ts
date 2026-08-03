/**
 * Registry invariants for harness-first engineering (docs/HARNESS_FIRST.md).
 *
 * This test is the CI teeth behind `nodetool harness audit`: an undocumented
 * surface gap, a dangling harness reference, or a duplicate id fails the
 * build, not just a CLI run someone has to remember to make.
 */
import { describe, it, expect } from "vitest";
import {
  HARNESSES,
  SURFACES,
  auditHarnessCoverage
} from "../src/harness/registry.js";

describe("harness registry", () => {
  it("has unique harness and surface ids", () => {
    const hIds = HARNESSES.map((h) => h.id);
    const sIds = SURFACES.map((s) => s.id);
    expect(new Set(hIds).size).toBe(hIds.length);
    expect(new Set(sIds).size).toBe(sIds.length);
  });

  it("every harness has a command and a docs pointer", () => {
    for (const h of HARNESSES) {
      expect(h.command, h.id).toBeTruthy();
      expect(h.docs, h.id).toBeTruthy();
    }
  });

  it("every surface reference resolves to a registered harness", () => {
    const result = auditHarnessCoverage();
    expect(result.unknownHarnessRefs).toEqual([]);
  });

  it("every uncovered surface documents its gap", () => {
    const result = auditHarnessCoverage();
    expect(result.undocumentedGaps).toEqual([]);
  });

  it("audit catches an undocumented gap", () => {
    const result = auditHarnessCoverage(HARNESSES, [
      ...SURFACES,
      { id: "new-surface", title: "New surface", harnesses: [] }
    ]);
    expect(result.undocumentedGaps).toEqual(["new-surface"]);
  });

  it("audit catches a dangling harness reference", () => {
    const result = auditHarnessCoverage(HARNESSES, [
      { id: "s", title: "S", harnesses: ["does-not-exist"] }
    ]);
    expect(result.unknownHarnessRefs).toEqual(["s → does-not-exist"]);
  });
});
