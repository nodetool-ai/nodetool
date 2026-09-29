/**
 * `typeCheckAgainstPackDts` when `typescript` cannot be loaded — the install
 * this package's `typescript` runtime dependency didn't ship into (e.g. a
 * pruned bundle). It must not fail the calling `validate`; it reports one
 * explicit `type_check_unavailable` warning instead of silently finding
 * nothing, which would read as "the script's imports are fine" when really
 * nothing was checked at all.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("typescript", () => {
  throw new Error("Cannot find module 'typescript'");
});

describe("typeCheckAgainstPackDts without typescript", () => {
  it("reports type_check_unavailable rather than finding nothing", async () => {
    const { typeCheckAgainstPackDts } = await import("../src/js-script-debug/type-check.js");
    const issues = await typeCheckAgainstPackDts(
      'import { video } from "@nodetool-ai/sandbox-timeline";\nvideo({});',
      new Map([["@nodetool-ai/sandbox-timeline", "/does/not/matter.d.ts"]])
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ severity: "warning", code: "type_check_unavailable" });
    expect(issues[0]!.message).toContain("TypeScript compiler");
  });

  it("still returns [] with no pack sources, never touching typescript", async () => {
    const { typeCheckAgainstPackDts } = await import("../src/js-script-debug/type-check.js");
    const issues = await typeCheckAgainstPackDts("await output('ok', true);", new Map());
    expect(issues).toEqual([]);
  });
});
