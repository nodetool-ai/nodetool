/**
 * The JS-script validator and report rules.
 *
 * Every rule is shown red on a document built to violate it and green on one
 * that does not — a check that has only ever been green is indistinguishable
 * from one that examines nothing.
 */
import { describe, it, expect } from "vitest";
import {
  emptyJsScriptDocument,
  type JsScriptDocument
} from "@nodetool-ai/protocol/api-schemas/js-scripts.js";
import {
  buildJsScriptDebugReport,
  emptyDeclaredJsScriptOutputsError,
  missingDeclaredJsScriptOutputs,
  renderJsScriptReportMarkdown,
  validateJsScriptDoc
} from "../src/js-script-debug/index.js";

const SOUND: Partial<JsScriptDocument> = {
  description: "Adds one.",
  code: 'await output("total", inputs.n + 1);',
  inputs: [{ name: "n", type: "int" }],
  outputs: [{ name: "total", type: "int" }],
  tests: [{ name: "adds one", inputs: { n: 1 }, expect: { total: 2 } }]
};

const doc = (overrides: Partial<JsScriptDocument> = {}): JsScriptDocument => ({
  ...emptyJsScriptDocument(),
  ...SOUND,
  ...overrides
});

const codes = (validation: {
  errors: { code: string }[];
  warnings: { code: string }[];
}): string[] => [
  ...validation.errors.map((issue) => issue.code),
  ...validation.warnings.map((issue) => issue.code)
];

describe("validateJsScriptDoc", () => {
  it("passes a sound document with no issues", async () => {
    const validation = await validateJsScriptDoc(doc());
    expect(validation.ok).toBe(true);
    expect(codes(validation)).toEqual([]);
  });

  it("reports a document that is not a document at all", async () => {
    const validation = await validateJsScriptDoc({ nope: true });
    expect(validation.ok).toBe(false);
    expect(codes(validation)).toContain("js_script_schema");
  });

  it("flags duplicate and non-identifier port names", async () => {
    const duplicate = await validateJsScriptDoc(
      doc({
        inputs: [
          { name: "n", type: "int" },
          { name: "n", type: "int" }
        ]
      })
    );
    expect(codes(duplicate)).toContain("js_script_duplicate_port");

    const badName = await validateJsScriptDoc(
      doc({
        code: 'await output("has space", 1);',
        outputs: [{ name: "has space", type: "int" }],
        tests: []
      })
    );
    expect(codes(badName)).toContain("js_script_port_name");
  });

  it("flags a test naming a port the document does not declare", async () => {
    const validation = await validateJsScriptDoc(
      doc({
        tests: [{ name: "bad", inputs: { other: 1 }, expect: { nope: 2 } }]
      })
    );
    expect(validation.ok).toBe(false);
    expect(codes(validation)).toContain("js_script_test_input");
    expect(codes(validation)).toContain("js_script_test_output");
  });

  it("rejects a module-style export async function run body", async () => {
    const validation = await validateJsScriptDoc(
      doc({
        code:
          "export async function run(inputs) {\n" +
          '  await output("total", inputs.n + 1);\n' +
          "}"
      })
    );
    expect(validation.ok).toBe(false);
    const issue = validation.errors.find((item) => item.code === "code_module");
    expect(issue?.message).toContain("`export`");
    expect(issue?.message).not.toContain("return an object");
  });

  it("makes the return contract an error", async () => {
    const legacy = await validateJsScriptDoc(
      doc({ code: "return { total: inputs.n + 1 };" })
    );
    expect(legacy.ok).toBe(false);
    expect(legacy.errors.map((issue) => issue.code)).toContain(
      "js_script_legacy_contract"
    );

    // A body with no declared outputs has nothing to route, so the rule does
    // not fire — it is about outputs that can never be reached.
    const noOutputs = await validateJsScriptDoc(
      doc({ code: "const x = 1;", outputs: [], tests: [] })
    );
    expect(codes(noOutputs)).not.toContain("js_script_legacy_contract");
  });

  it("warns, without failing, on zero saved tests", async () => {
    const validation = await validateJsScriptDoc(doc({ tests: [] }));
    expect(validation.ok).toBe(true);
    expect(validation.warnings.map((issue) => issue.code)).toEqual([
      "js_script_no_tests"
    ]);
  });

  it("warns about a declared secret the install lacks, and not about one it has", async () => {
    const missing = await validateJsScriptDoc(doc({ secrets: ["API_KEY"] }), {
      knownSecrets: ["OTHER"]
    });
    expect(missing.ok).toBe(true);
    expect(missing.warnings.map((issue) => issue.code)).toContain(
      "js_script_secret_missing"
    );

    const present = await validateJsScriptDoc(doc({ secrets: ["API_KEY"] }), {
      knownSecrets: ["API_KEY"]
    });
    expect(codes(present)).toEqual([]);

    // With no list supplied there is no store to compare against, so the rule
    // stays silent rather than warning about every secret.
    const unknownStore = await validateJsScriptDoc(doc({ secrets: ["API_KEY"] }));
    expect(codes(unknownStore)).toEqual([]);
  });

  it("carries the shared body analysis through", async () => {
    const syntax = await validateJsScriptDoc(doc({ code: "await output(" }));
    expect(syntax.errors.map((issue) => issue.code)).toContain("code_syntax");

    const undeclaredImport = await validateJsScriptDoc(
      doc({ code: 'import yaml from "@nodetool-ai/sandbox-yaml";\nawait output("total", 1);' })
    );
    // A script has no packages setting. Without a catalog the import cannot
    // be checked offline, so it is not an error.
    expect(undeclaredImport.ok).toBe(true);

    const platformImport = await validateJsScriptDoc(
      doc({
        code:
          'import { list_models } from "@nodetool-ai/sandbox-nodetool/models";\n' +
          'await output("total", typeof list_models);'
      })
    );
    expect(platformImport.ok).toBe(true);
  });
});

describe("validateJsScriptDoc — input streams", () => {
  const STREAMING: Partial<JsScriptDocument> = {
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
        inputStreams: { numbers: [1, 2] },
        expect: { total: 3 }
      }
    ]
  };
  const streaming = (overrides: Partial<JsScriptDocument> = {}) =>
    doc({ ...STREAMING, ...overrides });

  it("passes a streaming script whose cases stage items", async () => {
    const validation = await validateJsScriptDoc(streaming());
    expect(codes(validation)).toEqual([]);
  });

  it("never warns that a declared input is unconnected", async () => {
    const validation = await validateJsScriptDoc(streaming());
    expect(codes(validation)).not.toContain("code_unconnected_stream");
  });

  it("errors on a stream name the document does not declare", async () => {
    const validation = await validateJsScriptDoc(
      streaming({
        code: 'for await (const n of stream("nope")) { await emit("running", n); }\nawait output("total", 0);'
      })
    );
    expect(validation.ok).toBe(false);
    expect(codes(validation)).toContain("code_undefined_stream");
  });

  it("errors when a streaming body reads a declared input through `inputs`", async () => {
    const validation = await validateJsScriptDoc(
      streaming({
        code:
          'let total = inputs.numbers;\nfor await (const n of stream("numbers")) { total += n; }\n' +
          'await emit("running", total);\nawait output("total", total);'
      })
    );
    expect(validation.ok).toBe(false);
    const issue = [...validation.errors].find(
      (i) => i.code === "code_stream_input_read"
    );
    expect(issue?.message).toContain('stream("numbers")');
  });

  it("errors on a streaming body still returning its outputs", async () => {
    const validation = await validateJsScriptDoc(
      streaming({
        code: 'let total = 0;\nfor await (const n of stream("numbers")) total += n;\nreturn { total };'
      })
    );
    expect(validation.ok).toBe(false);
    expect(codes(validation)).toContain("code_stream_return_contract");
  });

  it("warns when a case stages streams for a body that does not stream", async () => {
    const validation = await validateJsScriptDoc(
      doc({
        tests: [
          {
            name: "adds one",
            inputs: { n: 1 },
            inputStreams: { n: [1] },
            expect: { total: 2 }
          }
        ]
      })
    );
    expect(validation.ok).toBe(true);
    expect(codes(validation)).toContain("js_script_test_streams_unused");
  });

  it("warns when a streaming body's cases stage nothing", async () => {
    const validation = await validateJsScriptDoc(
      streaming({
        tests: [{ name: "empty inbox", inputs: {}, expect: { total: 0 } }]
      })
    );
    expect(validation.ok).toBe(true);
    expect(codes(validation)).toContain("js_script_tests_no_streams");
  });
});

describe("missingDeclaredJsScriptOutputs", () => {
  it("returns [] when nothing is declared", () => {
    expect(missingDeclaredJsScriptOutputs([], {})).toEqual([]);
    expect(missingDeclaredJsScriptOutputs([], undefined)).toEqual([]);
  });

  it("returns every name when the bag is empty of all of them", () => {
    expect(
      missingDeclaredJsScriptOutputs(
        [{ name: "palette" }, { name: "hex" }],
        {}
      )
    ).toEqual(["palette", "hex"]);
    expect(
      missingDeclaredJsScriptOutputs([{ name: "out" }], undefined)
    ).toEqual(["out"]);
  });

  it("returns [] when any declared name is present", () => {
    expect(
      missingDeclaredJsScriptOutputs(
        [{ name: "palette" }, { name: "hex" }],
        { palette: [] }
      )
    ).toEqual([]);
  });

  it("names the missing ports in the shared error", () => {
    expect(emptyDeclaredJsScriptOutputsError(["palette", "hex"])).toBe(
      "The run produced none of the declared outputs: palette, hex. " +
        "Leave values with `await output(name, value)` or `await emit(name, value)` — " +
        "an empty output bag is not success."
    );
  });
});

describe("buildJsScriptDebugReport", () => {
  const target = { kind: "file" as const, ref: "script.json" };

  it("is ok with a sound document and clean interactions", async () => {
    const report = await buildJsScriptDebugReport({
      target,
      document: doc(),
      interactions: [
        { tool: "ui_jsscript_get_state", input: {}, ok: true, result: {} }
      ]
    });
    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.headline).toContain("1 interaction(s) ran clean");
    expect(report.meta).toMatchObject({
      inputCount: 1,
      outputCount: 1,
      testCount: 1
    });
    expect(report.notSimulated.length).toBeGreaterThan(0);
  });

  it("fails on a failed interaction even when the document is sound", async () => {
    const report = await buildJsScriptDebugReport({
      target,
      document: doc(),
      interactions: [
        {
          tool: "ui_jsscript_set_code",
          input: {},
          ok: false,
          error: "boom"
        }
      ]
    });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues[0]).toContain("boom");
  });

  it("validates the document the session left behind and describes it", async () => {
    const report = await buildJsScriptDebugReport({
      target,
      document: doc(),
      finalDocument: doc({ code: "return { total: 1 };", tests: [] })
    });
    expect(report.verdict.ok).toBe(false);
    expect(report.verdict.issues.join("\n")).toContain("After edits");
    // The meta describes the post-session document, not the input.
    expect(report.meta.testCount).toBe(0);
  });

  it("keeps warnings out of the verdict's issues", async () => {
    const report = await buildJsScriptDebugReport({
      target,
      document: doc({ tests: [] })
    });
    expect(report.verdict.ok).toBe(true);
    expect(report.verdict.issues).toEqual([]);
    expect(report.verdict.warnings?.[0]).toContain("js_script_no_tests");
  });
});

describe("renderJsScriptReportMarkdown", () => {
  it("renders the verdict, the issue tables and the interaction log", async () => {
    const report = await buildJsScriptDebugReport({
      target: { kind: "id", ref: "abc", name: "Adder" },
      document: doc({ code: "return { total: 1 };" }),
      interactions: [
        { tool: "ui_jsscript_run", input: { inputs: {} }, ok: true, result: {} }
      ]
    });
    const markdown = renderJsScriptReportMarkdown(report);
    expect(markdown).toContain("# JS script debug: Adder");
    expect(markdown).toContain("js_script_legacy_contract");
    expect(markdown).toContain("`ui_jsscript_run`");
    expect(markdown).toContain("## Not simulated");
  });
});
