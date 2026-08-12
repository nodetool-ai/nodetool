/**
 * Tests for the JS-script harness (src/js-script-debug/): target resolution,
 * the `--interact` script parser, and the orchestrator with the validator
 * core, the sandbox executor and the headless bridge injected — neither the
 * execution core nor `@nodetool-ai/agents` is loaded here.
 */
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  normalizeToolName,
  parseInteractionScript
} from "../src/js-script-debug/interactions.js";
import { resolveJsScriptTarget } from "../src/js-script-debug/target.js";
import {
  runJsScriptDebug,
  runJsScriptOnce,
  runJsScriptTests,
  runJsScriptValidate,
  type JsScriptDebugCore
} from "../src/js-script-debug/harness.js";

const document = {
  schemaVersion: 1,
  description: "Adds one.",
  code: 'await output("total", inputs.n + 1);',
  inputs: [{ name: "n", type: "int" }],
  outputs: [{ name: "total", type: "int" }],
  packages: [],
  secrets: [],
  timeoutSeconds: 10,
  tests: [{ name: "adds one", inputs: { n: 1 }, expect: { total: 2 } }]
};

const scriptFile = (body: unknown = { name: "Adder", document }): string => {
  const file = join(
    mkdtempSync(join(tmpdir(), "jsscript-harness-")),
    "script.json"
  );
  writeFileSync(file, JSON.stringify(body), "utf8");
  return file;
};

const outDir = (): string =>
  join(mkdtempSync(join(tmpdir(), "jsscript-out-")), "bundle");

const okValidation = { ok: true, errors: [], warnings: [] };

const core = (): JsScriptDebugCore => ({
  validateJsScriptDoc: vi.fn(async () => okValidation),
  buildJsScriptDebugReport: vi.fn(async (input) => ({
    target: input.target,
    meta: {
      inputCount: 1,
      outputCount: 1,
      packageCount: 0,
      secretCount: 0,
      testCount: 1,
      timeoutSeconds: 10,
      codeLength: 10
    },
    validation: okValidation,
    interactions: input.interactions ?? [],
    ...(input.finalState !== undefined ? { finalState: input.finalState } : {}),
    notSimulated: [],
    verdict: { ok: true, headline: "fine", issues: [] }
  })),
  renderJsScriptReportMarkdown: () => "# report"
});

const noLoader = { loadScript: async () => null };

describe("parseInteractionScript", () => {
  it("normalizes bare, ui_ and full tool names alike", () => {
    expect(normalizeToolName("set_code")).toBe("ui_jsscript_set_code");
    expect(normalizeToolName("ui_set_code")).toBe("ui_jsscript_set_code");
    expect(normalizeToolName("ui_jsscript_set_code")).toBe(
      "ui_jsscript_set_code"
    );
  });

  it("parses a step list and defaults an omitted input", () => {
    expect(parseInteractionScript('[{"tool":"get_state"}]')).toEqual([
      { tool: "ui_jsscript_get_state", input: {} }
    ]);
  });

  it("names the offending step on bad input", () => {
    expect(() => parseInteractionScript("{")).toThrow(/not valid JSON/);
    expect(() => parseInteractionScript('{"tool":"x"}')).toThrow(
      /must be a JSON array/
    );
    expect(() => parseInteractionScript("[{}]")).toThrow(/step 1 has no/);
    expect(() =>
      parseInteractionScript('[{"tool":"a","input":[]}]')
    ).toThrow(/step 1: `input` must be an object/);
  });
});

describe("resolveJsScriptTarget", () => {
  it("reads a wrapper carrying the document, keeping the name", async () => {
    const resolved = await resolveJsScriptTarget(scriptFile(), noLoader);
    expect(resolved.target).toMatchObject({ kind: "file", name: "Adder" });
    expect(resolved.raw).toMatchObject({ code: document.code });
  });

  it("reads a bare document too", async () => {
    const resolved = await resolveJsScriptTarget(scriptFile(document), noLoader);
    expect(resolved.raw).toMatchObject({ code: document.code });
  });

  it("refuses a JSON file that is not a script document", async () => {
    await expect(
      resolveJsScriptTarget(scriptFile({ hello: "world" }), noLoader)
    ).rejects.toThrow(/not a JS script document/);
  });

  it("falls back to the loader for an id, and says so when it misses", async () => {
    const loaded = await resolveJsScriptTarget("abc", {
      loadScript: async (id) => ({
        id,
        name: "Stored",
        document: JSON.stringify(document)
      })
    });
    expect(loaded.target).toEqual({ kind: "id", ref: "abc", name: "Stored" });
    expect(loaded.raw).toMatchObject({ code: document.code });

    await expect(resolveJsScriptTarget("abc", noLoader)).rejects.toThrow(
      /JS script not found/
    );
  });
});

describe("runJsScriptValidate", () => {
  it("validates the document the target carries", async () => {
    const deps = { ...noLoader, core: core() };
    const { target, validation } = await runJsScriptValidate(
      scriptFile(),
      deps
    );
    expect(target.kind).toBe("file");
    expect(validation.ok).toBe(true);
    expect(deps.core.validateJsScriptDoc).toHaveBeenCalledOnce();
  });
});

describe("runJsScriptOnce", () => {
  it("executes the parsed document with the injected executor", async () => {
    const execute = vi.fn(async () => ({
      ok: true,
      outputs: { total: 2 },
      logs: [],
      duration_ms: 1
    }));
    const { result } = await runJsScriptOnce(
      scriptFile(),
      { n: 1 },
      { ...noLoader, execute }
    );
    expect(result.outputs).toEqual({ total: 2 });
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({ code: document.code }),
      { n: 1 }
    );
  });
});

describe("runJsScriptTests", () => {
  it("grades the document's saved cases", async () => {
    const report = {
      ok: false,
      passed: 0,
      failed: 1,
      results: [{ name: "adds one", ok: false, logs: [], mismatches: [] }]
    };
    const { report: got } = await runJsScriptTests(scriptFile(), {
      ...noLoader,
      execute: vi.fn(),
      grade: async () => report
    });
    expect(got).toEqual(report);
  });

  it("refuses a document with no saved cases instead of passing vacuously", async () => {
    const file = scriptFile({ ...document, tests: [] });
    await expect(
      runJsScriptTests(file, { ...noLoader, execute: vi.fn() })
    ).rejects.toThrow(/no saved test cases/);
  });
});

describe("runJsScriptDebug", () => {
  const bridge = () => {
    const calls: string[] = [];
    const doc = { ...document };
    return {
      calls,
      create: () => ({
        tools: [
          {
            name: "ui_jsscript_set_code",
            execute: async (args: Record<string, unknown>) => {
              calls.push("ui_jsscript_set_code");
              doc.code = String(args["code"]);
              return { ok: true };
            }
          },
          {
            name: "ui_jsscript_boom",
            execute: async () => {
              throw new Error("boom");
            }
          }
        ],
        document: () => doc,
        finalState: () => ({ code: doc.code })
      })
    };
  };

  it("replays the script, writes the bundle and reports the session", async () => {
    const dir = outDir();
    const harness = bridge();
    const { report, bundleDir } = await runJsScriptDebug(
      scriptFile(),
      {
        interact: parseInteractionScript(
          '[{"tool":"set_code","input":{"code":"x"}}]'
        ),
        outDir: dir
      },
      { ...noLoader, core: core(), createBridge: harness.create }
    );

    expect(harness.calls).toEqual(["ui_jsscript_set_code"]);
    expect(report.interactions).toHaveLength(1);
    expect(report.interactions[0]?.ok).toBe(true);
    expect(bundleDir).toBe(dir);
    for (const file of ["report.json", "report.md", "jsscript.json"]) {
      expect(existsSync(join(dir, file)), file).toBe(true);
    }
    expect(readFileSync(join(dir, "report.md"), "utf8")).toContain("# report");
  });

  it("records a failing step and keeps going", async () => {
    const dir = outDir();
    const harness = bridge();
    const { report } = await runJsScriptDebug(
      scriptFile(),
      {
        interact: parseInteractionScript(
          '[{"tool":"boom"},{"tool":"nope"},{"tool":"set_code","input":{"code":"y"}}]'
        ),
        outDir: dir
      },
      { ...noLoader, core: core(), createBridge: harness.create }
    );

    expect(report.interactions.map((step) => step.ok)).toEqual([
      false,
      false,
      true
    ]);
    expect(report.interactions[0]?.error).toBe("boom");
    expect(report.interactions[1]?.error).toContain("No JS script tool named");
    // The last step still ran, so a failure early does not hide what follows.
    expect(harness.calls).toEqual(["ui_jsscript_set_code"]);
  });

  it("runs no bridge at all when there is no script", async () => {
    const dir = outDir();
    const createBridge = vi.fn();
    const { report } = await runJsScriptDebug(
      scriptFile(),
      { outDir: dir },
      { ...noLoader, core: core(), createBridge }
    );
    expect(createBridge).not.toHaveBeenCalled();
    expect(report.interactions).toEqual([]);
  });
});
