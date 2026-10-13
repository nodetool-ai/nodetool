/**
 * Missing optional TypeScript reports a warning without failing validation.
 */
import { describe, expect, it, vi } from "vitest";
import { importOptionalModule } from "@nodetool-ai/config";
import { emptyJsScriptDocument } from "@nodetool-ai/protocol/api-schemas/js-scripts.js";

vi.mock("@nodetool-ai/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/config")>();
  return {
    ...actual,
    importOptionalModule: vi.fn(async (name: string) => {
      if (name === "typescript") {
        throw Object.assign(new Error("Cannot find module 'typescript'"), {
          code: "ERR_MODULE_NOT_FOUND"
        });
      }
      return actual.importOptionalModule(name);
    })
  };
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
    expect(issues[0]!.message).toContain("Type checking was skipped because typescript is not installed");
    expect(issues[0]!.message).toContain("npm install typescript@npm:@typescript/typescript6@6.0.2");
  });

  it("includes the skipped check in the debug report without failing validation", async () => {
    const { buildJsScriptDebugReport, renderJsScriptReportMarkdown } =
      await import("../src/js-script-debug/index.js");
    const report = await buildJsScriptDebugReport({
      target: { kind: "file", ref: "script.json" },
      document: {
        ...emptyJsScriptDocument(),
        code: 'await output("ok", true);',
        outputs: [{ name: "ok", type: "bool" }]
      },
      options: { packDtsSources: new Map([["pack", "/does/not/matter.d.ts"]]) }
    });
    expect(report.validation.ok).toBe(true);
    expect(report.validation.warnings).toContainEqual(expect.objectContaining({
      code: "type_check_unavailable"
    }));
    expect(renderJsScriptReportMarkdown(report)).toContain(
      "Type checking was skipped because typescript is not installed"
    );
  });

  it("reports other compiler load failures without calling them missing packages", async () => {
    vi.mocked(importOptionalModule).mockRejectedValueOnce(new Error("Compiler initialization failed"));
    const { typeCheckAgainstPackDts } = await import("../src/js-script-debug/type-check.js");
    const issues = await typeCheckAgainstPackDts(
      'await output("ok", true);',
      new Map([["pack", "/does/not/matter.d.ts"]])
    );
    expect(issues[0]?.message).toContain("Compiler initialization failed");
    expect(issues[0]?.message).not.toContain("is not installed");
  });

  it("still returns [] with no pack sources, never touching typescript", async () => {
    vi.mocked(importOptionalModule).mockClear();
    const { typeCheckAgainstPackDts } = await import("../src/js-script-debug/type-check.js");
    const issues = await typeCheckAgainstPackDts("await output('ok', true);", new Map());
    expect(issues).toEqual([]);
    expect(importOptionalModule).not.toHaveBeenCalled();
  });
});
