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
  auditHarnessCoverage,
  planGate
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
      { id: "s", title: "S", harnesses: ["does-not-exist"], paths: [] }
    ]);
    expect(result.unknownHarnessRefs).toEqual(["s → does-not-exist"]);
  });

  it("every surface declares owning paths", () => {
    for (const s of SURFACES) {
      expect(s.paths.length, s.id).toBeGreaterThan(0);
    }
  });
});

describe("harness gate", () => {
  it("maps a kernel change to workflow-execution selfchecks", () => {
    const plan = planGate(["packages/kernel/src/runner.ts"]);
    expect(plan.surfaces.map((s) => s.id)).toEqual(["workflow-execution"]);
    const ids = plan.checks.map((c) => c.harnessId).sort();
    expect(ids).toContain("validate");
    expect(ids).toContain("reliability-ring0");
    expect(ids).toContain("node-run");
    // debug has no selfcheck — it needs a target, so it lands in manual.
    expect(plan.manual.map((m) => m.harnessId)).toContain("debug");
  });

  it("dedupes a selfcheck shared by several touched surfaces", () => {
    const plan = planGate([
      "packages/kernel/src/runner.ts",
      "packages/agents/src/planner.ts"
    ]);
    const validate = plan.checks.filter((c) => c.harnessId === "validate");
    expect(validate).toHaveLength(1);
    expect(validate[0]!.surfaces.sort()).toEqual([
      "workflow-authoring",
      "workflow-execution"
    ]);
  });

  it("maps a timeline version-history change onto the timeline surface", () => {
    const plan = planGate([
      "packages/models/src/timeline-sequence-version.ts",
      "packages/cli/src/commands/timeline-versions.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("timeline");
    expect(plan.manual.map((m) => m.harnessId)).toContain("timeline-versions");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a sketch version-history change onto the sketch surface", () => {
    const plan = planGate([
      "packages/models/src/image-document-version.ts",
      "packages/cli/src/commands/sketch-versions.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("sketch");
    expect(plan.manual.map((m) => m.harnessId)).toContain("sketch-versions");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a JS-script change onto the jsscript surface and its cheap selfcheck", () => {
    const plan = planGate([
      "packages/agents/src/capabilities/js-scripts.ts",
      "packages/cli/src/commands/js-script.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("jsscript");
    expect(plan.checks.map((c) => c.harnessId)).toContain("jsscript-test");
    // validate/run/debug/versions need a target, so they land in manual.
    expect(plan.manual.map((m) => m.harnessId)).toContain("jsscript-validate");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("maps a script↔storyboard link change onto both surfaces and their selfcheck", () => {
    const plan = planGate([
      "packages/protocol/src/script-link.ts",
      "packages/timeline/src/linked.ts",
      "packages/agents/src/capabilities/storyboards.ts",
      "web/src/lib/tools/builtin/script.ts"
    ]);
    const surfaces = plan.surfaces.map((s) => s.id);
    expect(surfaces).toContain("storyboard");
    expect(surfaces).toContain("script");
    const check = plan.checks.find(
      (c) => c.harnessId === "script-storyboard-link"
    );
    expect(check).toBeDefined();
    expect(check!.surfaces.sort()).toEqual(["script", "storyboard"]);
    // timeline-validate and eval need a target or a model, so they are manual.
    expect(plan.manual.map((m) => m.harnessId)).toContain("timeline-validate");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("claims every packages/timeline file for the timeline surface", () => {
    const plan = planGate([
      "packages/timeline/src/script-link.ts",
      "packages/timeline/src/render/sceneModel.ts"
    ]);
    expect(plan.surfaces.map((s) => s.id)).toContain("timeline");
    expect(plan.unmappedFiles).toEqual([]);
  });

  it("reports files no surface claims", () => {
    const plan = planGate(["README.md"]);
    expect(plan.unmappedFiles).toEqual(["README.md"]);
    expect(plan.checks).toEqual([]);
  });

  it("reports a touched gap surface as uncovered", () => {
    const plan = planGate(["mobile/App.tsx"]);
    expect(plan.uncoveredSurfaces).toEqual(["mobile"]);
    expect(plan.checks).toEqual([]);
  });

  it("selfchecks are keyless npm/node commands from the repo root", () => {
    for (const h of HARNESSES) {
      if (!h.selfcheck) continue;
      expect(h.selfcheck.command, h.id).toMatch(/^(npm|node) /);
    }
  });
});
