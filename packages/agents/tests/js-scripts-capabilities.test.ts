/**
 * The `js-scripts` capability module.
 *
 * Real QuickJS sandbox and a real in-memory database, no network: the guest
 * gets the Code-node toolbelt, a script reads only the secrets its envelope
 * allows, the recursion gate refuses a cycle and a run too deep,
 * `test_js_script` grades a document's saved cases exactly the way
 * `test_code` grades the same cases, and every validation rule is shown red
 * on a fixture built to violate it and green on one that does not.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  ProcessingContext,
  refuseSandboxDelivery
} from "@nodetool-ai/runtime";
import { JsScript, ModelObserver, initTestDb } from "@nodetool-ai/models";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import { toolForCapabilityName } from "../src/capabilities/lazy-tool.js";
import {
  enterJsScript,
  resolveSecretScope,
  JS_SCRIPT_CHAIN_KEY,
  JS_SCRIPT_DEPTH_KEY,
  JS_SCRIPT_SECRET_ALLOWANCE_KEY,
  MAX_JS_SCRIPT_DEPTH
} from "../src/capabilities/js-scripts.js";
import { permissionCategoryFor } from "../src/tools/tool-permissions.js";
import { BUILTIN_TOOL_NAMES } from "../src/tools/builtin-tools.js";
import { assembleSandboxToolbelt } from "../src/sandbox-toolbelt.js";

const USER = "u1";

function context(
  overrides: {
    secretResolver?: (name: string, userId: string) => Promise<string | null>;
  } = {}
): ProcessingContext {
  return new ProcessingContext({
    jobId: `job-${Math.random()}`,
    userId: USER,
    ...(overrides.secretResolver
      ? { secretResolver: overrides.secretResolver }
      : {})
  });
}

function document(overrides: Partial<JsScriptDocument> = {}): JsScriptDocument {
  return { ...emptyJsScriptDocument(), ...overrides };
}

async function makeScript(
  doc: Partial<JsScriptDocument>,
  overrides: Record<string, unknown> = {}
): Promise<JsScript> {
  const script = new JsScript({
    user_id: USER,
    name: "Script",
    document: JSON.stringify(document(doc)),
    ...overrides
  });
  await script.save();
  return script;
}

beforeEach(async () => {
  await initTestDb();
});

afterEach(() => {
  ModelObserver.clear();
});

describe("run_js_script", () => {
  it("runs a saved script and reports outputs, emits and logs", async () => {
    const script = await makeScript({
      code: 'console.log("hi");\nawait emit("step", 1);\nawait output("sum", inputs.a + inputs.b);',
      inputs: [
        { name: "a", type: "int" },
        { name: "b", type: "int" }
      ],
      outputs: [
        { name: "step", type: "int" },
        { name: "sum", type: "int" }
      ]
    });

    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id, inputs: { a: 2, b: 3 } }
    )) as {
      ok: boolean;
      outputs: Record<string, unknown>;
      streamed: unknown[];
      logs: string[];
    };

    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ sum: 5 });
    expect(result.streamed).toEqual([{ name: "step", value: 1 }]);
    expect(result.logs.join("\n")).toContain("hi");
  });

  it("imports an installed pack without a packages list", async () => {
    const { GEO_MODULE } = await import("../src/sandbox-module-fixtures.js");
    const catalog = {
      summaries: () => [
        {
          specifier: "@acme/geo",
          packName: "@acme/nodetool-geo",
          kind: "js" as const
        }
      ],
      diagnostics: () => [],
      authorizeDelivery: async (moduleId: string) =>
        refuseSandboxDelivery(moduleId),
      resolveForExecution: (
        declarations: readonly { specifier: string }[]
      ) => {
        const wanted = declarations.some((d) => d.specifier === "@acme/geo");
        return wanted
          ? { modules: [GEO_MODULE], statuses: [] }
          : {
              modules: [],
              statuses: declarations.map((declaration) => ({
                packName: declaration.specifier,
                specifier: declaration.specifier,
                status: "error" as const,
                code: "module-not-found" as const,
                message: `Sandbox module ${declaration.specifier} is not installed.`
              }))
            };
      }
    };
    const script = await makeScript({
      code:
        'import { haversine } from "@acme/geo";\n' +
        'await output("km", haversine(1, 2));',
      outputs: [{ name: "km", type: "float" }]
    });

    const result = (await toolForCapabilityName("run_js_script").execute(
      new ProcessingContext({
        jobId: `job-${Math.random()}`,
        userId: USER,
        sandboxModuleCatalog: catalog
      }),
      { js_script_id: script.id, inputs: {} }
    )) as { ok: boolean; outputs?: Record<string, unknown>; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ km: 111 });
  });

  it("imports @nodetool-ai/sandbox-nodetool without a packages list", async () => {
    const script = await makeScript({
      code:
        'import { list_models } from "@nodetool-ai/sandbox-nodetool/models";\n' +
        'await output("kind", typeof list_models);',
      outputs: [{ name: "kind", type: "str" }]
    });

    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id, inputs: {} }
    )) as { ok: boolean; outputs?: Record<string, unknown>; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ kind: "function" });
  });

  // The running-total body from docs/code-node-input-streaming-design.md: one
  // invocation that drains its inbox, emitting as it goes.
  it("stages input_streams for a body that reads them with stream()", async () => {
    const script = await makeScript({
      code:
        'let total = 0;\nfor await (const n of stream("numbers")) {\n' +
        '  total += n;\n  await emit("running", total);\n}\n' +
        'await output("total", total);',
      inputs: [{ name: "numbers", type: "int" }],
      outputs: [
        { name: "running", type: "int" },
        { name: "total", type: "int" }
      ]
    });

    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id, input_streams: { numbers: [1, 2, 3] } }
    )) as {
      ok: boolean;
      outputs: Record<string, unknown>;
      streamed: unknown[];
      error?: string;
    };

    expect(result.error).toBeUndefined();
    expect(result.outputs).toEqual({ total: 6 });
    expect(result.streamed).toEqual([
      { name: "running", value: 1 },
      { name: "running", value: 3 },
      { name: "running", value: 6 }
    ]);
  });

  it("refuses input_streams naming a handle the script does not declare", async () => {
    const script = await makeScript({
      code: 'for await (const n of stream("numbers")) { await emit("n", n); }',
      inputs: [{ name: "numbers", type: "int" }],
      outputs: [{ name: "n", type: "int" }]
    });

    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id, input_streams: { nope: [1] } }
    )) as { error?: string };

    expect(result.error).toContain('"nope"');
  });

  it("finds a script by name when the name is unambiguous", async () => {
    await makeScript(
      { code: 'await output("v", 1);', outputs: [{ name: "v", type: "int" }] },
      { name: "Only One" }
    );
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { name: "only one" }
    )) as { ok: boolean; outputs: Record<string, unknown> };
    expect(result.outputs).toEqual({ v: 1 });
  });

  it("refuses an ambiguous name instead of guessing", async () => {
    await makeScript({ code: "" }, { name: "Twin" });
    await makeScript({ code: "" }, { name: "Twin" });
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { name: "Twin" }
    )) as { error: string };
    expect(result.error).toContain("2 JS scripts are named");
  });

  it("reads another user's script as missing", async () => {
    const script = await makeScript({ code: "" }, { user_id: "someone-else" });
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { error: string };
    expect(result.error).toContain("was not found");
  });

  it("gives the guest the Code-node toolbelt", async () => {
    const script = await makeScript({
      code:
        'import { list_js_scripts } from "@nodetool-ai/sandbox-nodetool/js-scripts";\n' +
        "const caps = nodetool.capabilities();\n" +
        'await output("tools", typeof tools);\n' +
        'await output("nodetool", typeof nodetool);\n' +
        'await output("hasList", typeof list_js_scripts);\n' +
        'await output("hasWorkflows", Boolean(caps.workflows));\n' +
        "const listed = await list_js_scripts();\n" +
        'await output("count", listed.js_scripts.length);',
      outputs: [
        { name: "tools", type: "str" },
        { name: "nodetool", type: "str" },
        { name: "hasList", type: "str" },
        { name: "hasWorkflows", type: "bool" },
        { name: "count", type: "int" }
      ]
    });
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { ok: boolean; outputs: Record<string, unknown>; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({
      tools: "object",
      nodetool: "object",
      hasList: "function",
      hasWorkflows: true,
      count: 1
    });
  });

  it("refuses a nested run_js_script of the same script, naming the cycle", async () => {
    const script = await makeScript({
      code:
        'import { run_js_script } from "@nodetool-ai/sandbox-nodetool/js-scripts";\n' +
        "try {\n" +
        "  await run_js_script({ js_script_id: inputs.id });\n" +
        '  await output("err", "");\n' +
        "} catch (e) {\n" +
        '  await output("err", String(e.message));\n' +
        "}",
      inputs: [{ name: "id", type: "str" }],
      outputs: [{ name: "err", type: "str" }]
    });
    const result = (await toolForCapabilityName("run_js_script").execute(
      context(),
      { js_script_id: script.id, inputs: { id: script.id } }
    )) as { ok: boolean; outputs: Record<string, unknown>; error?: string };

    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(String(result.outputs.err)).toContain("already running");
  });
});

describe("run_js_script secret scoping", () => {
  it("lets the body read a secret the document declares", async () => {
    const script = await makeScript({
      code: 'await output("key", await getSecret("API_KEY"));',
      outputs: [{ name: "key", type: "str" }],
      secrets: ["API_KEY"]
    });
    const result = (await toolForCapabilityName("run_js_script").execute(
      context({ secretResolver: async () => "s3cret" }),
      { js_script_id: script.id }
    )) as { ok: boolean; outputs: Record<string, unknown> };

    expect(result.ok).toBe(true);
    expect(result.outputs).toEqual({ key: "s3cret" });
  });

  it("narrows the declared secrets by the caller's allowance", async () => {
    const script = await makeScript({
      code: 'await output("key", await getSecret("API_KEY"));',
      outputs: [{ name: "key", type: "str" }],
      secrets: ["API_KEY"]
    });
    const ctx = context({ secretResolver: async () => "s3cret" });
    ctx.set(JS_SCRIPT_SECRET_ALLOWANCE_KEY, ["SOMETHING_ELSE"]);

    const result = (await toolForCapabilityName("run_js_script").execute(ctx, {
      js_script_id: script.id
    })) as { ok: boolean; error?: string };

    expect(result.ok).toBe(false);
    expect(result.error).toContain("API_KEY");
  });

  it("intersects rather than replaces, in both directions", () => {
    const ctx = context();
    expect(resolveSecretScope(ctx, ["A", "B"])).toEqual(["A", "B"]);
    ctx.set(JS_SCRIPT_SECRET_ALLOWANCE_KEY, ["B", "C"]);
    // "C" is allowed but not declared, so it stays out: a caller narrows.
    expect(resolveSecretScope(ctx, ["A", "B"])).toEqual(["B"]);
  });
});

describe("run_js_script recursion accounting", () => {
  it("refuses a script already on the call chain, naming the cycle", async () => {
    const script = await makeScript({
      code: 'await output("v", 1);',
      outputs: [{ name: "v", type: "int" }]
    });
    const ctx = context();
    ctx.set(JS_SCRIPT_CHAIN_KEY, ["outer", script.id]);

    const result = (await toolForCapabilityName("run_js_script").execute(ctx, {
      js_script_id: script.id
    })) as { error: string; message: string; chain: string[] };

    expect(result.error).toBe("js_script_cycle");
    expect(result.chain).toEqual(["outer", script.id, script.id]);
    expect(result.message).toContain(`outer → ${script.id} → ${script.id}`);
  });

  it("refuses a run past the depth cap", async () => {
    const script = await makeScript({
      code: 'await output("v", 1);',
      outputs: [{ name: "v", type: "int" }]
    });
    const ctx = context();
    ctx.set(JS_SCRIPT_DEPTH_KEY, MAX_JS_SCRIPT_DEPTH);

    const result = (await toolForCapabilityName("run_js_script").execute(ctx, {
      js_script_id: script.id
    })) as { error: string; max_depth: number };

    expect(result.error).toBe("max_js_script_depth_reached");
    expect(result.max_depth).toBe(MAX_JS_SCRIPT_DEPTH);
  });

  it("bumps depth and chain onto the child context, leaving the parent alone", () => {
    const ctx = context();
    const gate = enterJsScript(ctx, "s1");
    expect(gate.ok).toBe(true);
    expect(gate.childContext?.get(JS_SCRIPT_DEPTH_KEY)).toBe(1);
    expect(gate.childContext?.get(JS_SCRIPT_CHAIN_KEY)).toEqual(["s1"]);
    expect(ctx.get(JS_SCRIPT_DEPTH_KEY)).toBeUndefined();
  });

  it("allows a chain right up to the cap", () => {
    let ctx = context();
    for (let i = 0; i < MAX_JS_SCRIPT_DEPTH; i++) {
      const gate = enterJsScript(ctx, `s${i}`);
      expect(gate.ok, `depth ${i}`).toBe(true);
      ctx = gate.childContext!;
    }
    expect(enterJsScript(ctx, "one-too-many").ok).toBe(false);
  });
});

describe("test_js_script", () => {
  const CODE =
    'await emit("step", inputs.n);\nawait output("doubled", inputs.n * 2);';
  const CASES = [
    { name: "passes", inputs: { n: 2 }, expect: { doubled: 4 } },
    { name: "fails", inputs: { n: 3 }, expect: { doubled: 99 } },
    {
      name: "streams",
      inputs: { n: 5 },
      expectedStreamed: [{ name: "step", value: 5 }]
    }
  ];

  it("grades a case that stages input streams", async () => {
    const script = await makeScript({
      code:
        'let total = 0;\nfor await (const n of stream("numbers")) {\n' +
        '  total += n;\n  await emit("running", total);\n}\n' +
        'await output("total", total);',
      inputs: [{ name: "numbers", type: "int" }],
      outputs: [
        { name: "running", type: "int" },
        { name: "total", type: "int" }
      ],
      tests: [
        {
          name: "sums what arrives",
          inputs: {},
          inputStreams: { numbers: [1, 2, 3] },
          expect: { total: 6 },
          expectedStreamed: [
            { name: "running", value: 1 },
            { name: "running", value: 3 },
            { name: "running", value: 6 }
          ]
        },
        {
          // Fails on purpose: zero is what the body would report if the staged
          // items never reached it, so a green run here would mean nothing.
          name: "an unread stream would total zero",
          inputs: {},
          inputStreams: { numbers: [2, 2] },
          expect: { total: 0 }
        }
      ]
    });

    const report = (await toolForCapabilityName("test_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as {
      passed: number;
      failed: number;
      results: { name: string; ok: boolean }[];
    };

    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.results.find((c) => c.ok)?.name).toBe("sums what arrives");
  });

  it("grades a document's saved cases exactly the way test_code grades them", async () => {
    const script = await makeScript({
      code: CODE,
      inputs: [{ name: "n", type: "int" }],
      outputs: [
        { name: "step", type: "int" },
        { name: "doubled", type: "int" }
      ],
      tests: CASES
    });

    const scriptReport = (await toolForCapabilityName(
      "test_js_script"
    ).execute(context(), { js_script_id: script.id })) as {
      ok: boolean;
      passed: number;
      failed: number;
      results: { name: string; ok: boolean; mismatches: unknown[] }[];
    };

    const codeReport = (await toolForCapabilityName("test_code").execute(
      context(),
      {
        code: CODE,
        cases: CASES.map((entry) => ({
          name: entry.name,
          inputs: entry.inputs,
          ...(entry.expect ? { expect: entry.expect } : {}),
          ...(entry.expectedStreamed
            ? { expected_streamed: entry.expectedStreamed }
            : {})
        }))
      }
    )) as typeof scriptReport;

    expect(scriptReport.ok).toBe(false);
    expect(scriptReport.passed).toBe(2);
    expect(scriptReport.failed).toBe(1);
    expect(scriptReport.results.map((r) => [r.name, r.ok])).toEqual(
      codeReport.results.map((r) => [r.name, r.ok])
    );
    expect(scriptReport.results.map((r) => r.mismatches)).toEqual(
      codeReport.results.map((r) => r.mismatches)
    );
  });

  it("says so rather than passing vacuously when a script has no cases", async () => {
    const script = await makeScript({ code: 'await output("v", 1);' });
    const result = (await toolForCapabilityName("test_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { error: string };
    expect(result.error).toContain("no saved test cases");
  });
});

describe("validate_js_script", () => {
  const validate = async (doc: Partial<JsScriptDocument>) =>
    (await toolForCapabilityName("validate_js_script").execute(context(), {
      document: document(doc)
    })) as {
      ok: boolean;
      errors: { code: string; message: string }[];
      warnings: { code: string; message: string }[];
    };

  /** A document that violates nothing: the green half of every pair below. */
  const SOUND: Partial<JsScriptDocument> = {
    code: 'await output("total", inputs.n + 1);',
    inputs: [{ name: "n", type: "int" }],
    outputs: [{ name: "total", type: "int" }],
    tests: [{ name: "adds one", inputs: { n: 1 }, expect: { total: 2 } }]
  };

  it("passes a sound document with no issues at all", async () => {
    const result = await validate(SOUND);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("flags a duplicate port name", async () => {
    const result = await validate({
      ...SOUND,
      inputs: [
        { name: "n", type: "int" },
        { name: "n", type: "int" }
      ]
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(
      "js_script_duplicate_port"
    );
  });

  it("flags a port name that is not an identifier", async () => {
    const result = await validate({
      ...SOUND,
      code: 'await output("not a name", 1);',
      outputs: [{ name: "not a name", type: "int" }],
      tests: []
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain("js_script_port_name");
  });

  it("flags a test naming a port the script does not declare", async () => {
    const result = await validate({
      ...SOUND,
      tests: [{ name: "bad", inputs: { nope: 1 }, expect: { missing: 2 } }]
    });
    expect(result.ok).toBe(false);
    const codes = result.errors.map((e) => e.code);
    expect(codes).toContain("js_script_test_input");
    expect(codes).toContain("js_script_test_output");
  });

  it("makes the return contract an error, not a deprecation warning", async () => {
    const result = await validate({
      ...SOUND,
      code: "return { total: inputs.n + 1 };"
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain(
      "js_script_legacy_contract"
    );
  });

  it("warns — not errors — when a script has no saved tests", async () => {
    const result = await validate({ ...SOUND, tests: [] });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("js_script_no_tests");
  });

  it("warns about a declared secret this install does not carry", async () => {
    const result = await validate({ ...SOUND, secrets: ["NOT_INSTALLED"] });
    expect(result.ok).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain(
      "js_script_secret_missing"
    );
  });

  it("carries the body analysis through: syntax, unknown inputs, unreachable outputs", async () => {
    const syntax = await validate({ ...SOUND, code: "return {" });
    expect(syntax.errors.map((e) => e.code)).toContain("code_syntax");

    const unknownInput = await validate({
      ...SOUND,
      code: 'await output("total", inputs.missing);',
      tests: []
    });
    expect(unknownInput.errors.map((e) => e.code)).toContain(
      "code_undefined_input"
    );

    const unreached = await validate({
      ...SOUND,
      code: 'await output("total", 1);',
      outputs: [
        { name: "total", type: "int" },
        { name: "never", type: "int" }
      ],
      tests: []
    });
    expect(
      [...unreached.errors, ...unreached.warnings].map((issue) => issue.code)
    ).toContain("code_missing_output");
  });

  it("validates a saved script by id", async () => {
    const script = await makeScript(SOUND);
    const result = (await toolForCapabilityName("validate_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { ok: boolean; js_script_id: string; summary: string };
    expect(result.ok).toBe(true);
    expect(result.js_script_id).toBe(script.id);
    expect(result.summary).toBe("No issues found.");
  });
});

describe("save_js_script", () => {
  /** A minimal sound document, so a save is refused for the reason under test. */
  const V_SCRIPT: Partial<JsScriptDocument> = {
    code: 'await output("v", 1);',
    outputs: [{ name: "v", type: "int" }]
  };

  it("creates a script and returns its validation", async () => {
    const result = (await toolForCapabilityName("save_js_script").execute(
      context(),
      {
        name: "Adder",
        document: document({
          code: 'await output("total", inputs.n + 1);',
          inputs: [{ name: "n", type: "int" }],
          outputs: [{ name: "total", type: "int" }]
        })
      }
    )) as { ok: boolean; created: boolean; id: string };

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    const saved = await JsScript.findById(result.id);
    expect(saved?.name).toBe("Adder");
  });

  it("refuses to save a document carrying errors", async () => {
    const result = (await toolForCapabilityName("save_js_script").execute(
      context(),
      { name: "Broken", document: document({ code: "return {" }) }
    )) as { saved: boolean; error: string };

    expect(result.saved).toBe(false);
    expect(result.error).toContain("validation errors");
  });

  it("refuses an update whose base_updated_at has moved on", async () => {
    const script = await makeScript(V_SCRIPT);
    const result = (await toolForCapabilityName("save_js_script").execute(
      context(),
      {
        js_script_id: script.id,
        base_updated_at: "1999-01-01T00:00:00.000Z",
        document: document({ ...V_SCRIPT, code: 'await output("v", 2);' })
      }
    )) as { error: string };

    expect(result.error).toContain("optimistic concurrency conflict");
  });

  it("updates in place when the CAS token still matches", async () => {
    const script = await makeScript(V_SCRIPT);
    const result = (await toolForCapabilityName("save_js_script").execute(
      context(),
      {
        js_script_id: script.id,
        base_updated_at: script.updated_at,
        document: document({ ...V_SCRIPT, code: 'await output("v", 2);' })
      }
    )) as { ok: boolean; created: boolean };

    expect(result.ok).toBe(true);
    expect(result.created).toBe(false);
    const reloaded = await JsScript.findById(script.id);
    expect(reloaded?.toDocument().code).toContain('"v", 2');
  });
});

describe("list_js_scripts and get_js_script", () => {
  it("lists id, name, description and ports, filtered by query", async () => {
    await makeScript(
      { description: "Sums numbers.", inputs: [{ name: "n", type: "int" }] },
      { name: "Summer" }
    );
    await makeScript({ description: "Formats a date." }, { name: "Dater" });

    const all = (await toolForCapabilityName("list_js_scripts").execute(
      context(),
      {}
    )) as { js_scripts: { name: string }[] };
    expect(all.js_scripts).toHaveLength(2);

    const filtered = (await toolForCapabilityName("list_js_scripts").execute(
      context(),
      { query: "sums" }
    )) as {
      js_scripts: { name: string; description: string; inputs: unknown[] }[];
    };
    expect(filtered.js_scripts).toHaveLength(1);
    expect(filtered.js_scripts[0]?.name).toBe("Summer");
    expect(filtered.js_scripts[0]?.inputs).toHaveLength(1);
  });

  it("returns the full document", async () => {
    const script = await makeScript({ description: "Does a thing." });
    const result = (await toolForCapabilityName("get_js_script").execute(
      context(),
      { js_script_id: script.id }
    )) as { document: JsScriptDocument };
    expect(result.document.description).toBe("Does a thing.");
  });
});

describe("permission categories", () => {
  it("classifies reads, writes and executions", () => {
    expect(permissionCategoryFor("list_js_scripts")).toBe("read");
    expect(permissionCategoryFor("get_js_script")).toBe("read");
    expect(permissionCategoryFor("validate_js_script")).toBe("read");
    expect(permissionCategoryFor("save_js_script")).toBe("write");
    expect(permissionCategoryFor("run_js_script")).toBe("execute");
    expect(permissionCategoryFor("test_js_script")).toBe("execute");
  });

  it("is on the builtin belt the Code node and a script share", () => {
    for (const name of [
      "list_js_scripts",
      "get_js_script",
      "save_js_script",
      "validate_js_script",
      "run_js_script",
      "test_js_script"
    ]) {
      expect(BUILTIN_TOOL_NAMES).toContain(name);
    }
    const belt = assembleSandboxToolbelt().map((tool) => tool.name);
    expect(belt).toContain("run_js_script");
    expect(belt).toContain("list_workflows");
  });
});
