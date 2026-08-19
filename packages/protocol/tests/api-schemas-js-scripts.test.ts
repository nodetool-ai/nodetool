import { describe, it, expect } from "vitest";
import {
  assertValidJsScriptDocument,
  emptyJsScriptDocument,
  jsScriptDocument,
  validateJsScriptDocument,
  type JsScriptDocument
} from "../src/api-schemas/js-scripts.js";

function doc(overrides: Partial<JsScriptDocument> = {}): JsScriptDocument {
  return { ...emptyJsScriptDocument(), ...overrides };
}

describe("jsScriptDocument schema", () => {
  it("fills the defaults a bare document omits", () => {
    const parsed = jsScriptDocument.parse({ schemaVersion: 1 });
    expect(parsed.timeoutSeconds).toBe(30);
    expect(parsed.inputs).toEqual([]);
    expect(parsed.outputs).toEqual([]);
    expect(parsed.tests).toEqual([]);
  });

  it("rejects a timeout above the sandbox ceiling", () => {
    expect(jsScriptDocument.safeParse({ schemaVersion: 1, timeoutSeconds: 121 }).success).toBe(
      false
    );
    expect(jsScriptDocument.safeParse({ schemaVersion: 1, timeoutSeconds: 120 }).success).toBe(
      true
    );
  });

  it("round-trips a case that stages input streams", () => {
    const parsed = jsScriptDocument.parse({
      schemaVersion: 1,
      inputs: [{ name: "numbers", type: "int" }],
      tests: [
        {
          name: "streams three",
          inputs: {},
          inputStreams: { numbers: [1, 2, 3] }
        }
      ]
    });
    expect(parsed.tests[0].inputStreams).toEqual({ numbers: [1, 2, 3] });
    expect(jsScriptDocument.parse(parsed)).toEqual(parsed);
  });

  it("rejects staged items that are not an array", () => {
    expect(
      jsScriptDocument.safeParse({
        schemaVersion: 1,
        tests: [{ name: "c", inputs: {}, inputStreams: { numbers: 3 } }]
      }).success
    ).toBe(false);
  });

  it("rejects a schemaVersion the code does not know", () => {
    const issues = validateJsScriptDocument({ schemaVersion: 2 });
    expect(issues.some((issue) => issue.code === "js_script_schema")).toBe(true);
  });
});

describe("validateJsScriptDocument", () => {
  it("passes a well-formed document with a test case", () => {
    const issues = validateJsScriptDocument(
      doc({
        inputs: [{ name: "a", type: "str" }],
        outputs: [{ name: "out", type: "str" }],
        tests: [{ name: "case 1", inputs: { a: "x" }, expect: { out: "x" } }]
      })
    );
    expect(issues).toEqual([]);
  });

  it("rejects a duplicate port name", () => {
    const issues = validateJsScriptDocument(
      doc({
        inputs: [
          { name: "a", type: "str" },
          { name: "a", type: "int" }
        ],
        tests: [{ name: "c", inputs: {} }]
      })
    );
    expect(
      issues.filter((issue) => issue.code === "js_script_duplicate_port")
    ).toHaveLength(1);
  });

  it("rejects a port name that is not an identifier", () => {
    const issues = validateJsScriptDocument(
      doc({ outputs: [{ name: "not a name", type: "str" }] })
    );
    expect(issues.some((issue) => issue.code === "js_script_port_name")).toBe(
      true
    );
  });

  it("rejects a test case naming an undeclared input", () => {
    const issues = validateJsScriptDocument(
      doc({
        inputs: [{ name: "a", type: "str" }],
        tests: [{ name: "c", inputs: { a: 1, nope: 2 } }]
      })
    );
    const testIssues = issues.filter(
      (issue) => issue.code === "js_script_test_input"
    );
    expect(testIssues).toHaveLength(1);
    expect(testIssues[0]!.message).toContain("nope");
  });

  it("rejects a test case expecting an undeclared output", () => {
    const issues = validateJsScriptDocument(
      doc({
        outputs: [{ name: "out", type: "str" }],
        tests: [
          {
            name: "c",
            inputs: {},
            expect: { missing: 1 },
            expectedStreamed: [{ name: "also_missing", value: 1 }]
          }
        ]
      })
    );
    expect(
      issues.filter((issue) => issue.code === "js_script_test_output")
    ).toHaveLength(2);
  });

  it("rejects a test case staging a stream for an undeclared input", () => {
    const issues = validateJsScriptDocument(
      doc({
        inputs: [{ name: "numbers", type: "int" }],
        tests: [
          {
            name: "c",
            inputs: {},
            inputStreams: { numbers: [1], nope: [2] }
          }
        ]
      })
    );
    const staged = issues.filter(
      (issue) =>
        issue.code === "js_script_test_input" && issue.message.includes("nope")
    );
    expect(staged).toHaveLength(1);
    expect(
      issues.some((issue) => issue.message.includes('"numbers"'))
    ).toBe(false);
  });

  it("rejects two test cases sharing a name", () => {
    const issues = validateJsScriptDocument(
      doc({
        tests: [
          { name: "c", inputs: {} },
          { name: "c", inputs: {} }
        ]
      })
    );
    expect(
      issues.some((issue) => issue.code === "js_script_duplicate_test")
    ).toBe(true);
  });

  it("warns — never errors — on a document with no tests", () => {
    const issues = validateJsScriptDocument(doc());
    expect(issues).toEqual([
      {
        severity: "warning",
        code: "js_script_no_tests",
        message: "the script has no saved test cases"
      }
    ]);
  });
});

describe("palette", () => {
  it("parses and round-trips, and stays absent on an old document", () => {
    const parsed = jsScriptDocument.parse({
      schemaVersion: 1,
      palette: { category: "My API" }
    });
    expect(parsed.palette).toEqual({ category: "My API" });
    expect(jsScriptDocument.parse({ schemaVersion: 1 }).palette).toBeUndefined();
  });

  it("errors on a blank category", () => {
    const issues = validateJsScriptDocument(
      doc({
        outputs: [{ name: "out", type: "str" }],
        palette: { category: "   " }
      })
    );
    expect(
      issues.some(
        (issue) =>
          issue.code === "js_script_palette_category" &&
          issue.severity === "error"
      )
    ).toBe(true);
  });

  it("accepts a category with content", () => {
    const issues = validateJsScriptDocument(
      doc({
        outputs: [{ name: "out", type: "str" }],
        palette: { category: "Text" }
      })
    );
    expect(
      issues.some((issue) => issue.code === "js_script_palette_category")
    ).toBe(false);
  });

  it("warns when an exposed script declares no outputs", () => {
    const issues = validateJsScriptDocument(
      doc({ outputs: [], palette: { category: "Text" } })
    );
    expect(
      issues.some(
        (issue) =>
          issue.code === "js_script_palette_no_outputs" &&
          issue.severity === "warning"
      )
    ).toBe(true);
  });

  it("says nothing about the menu for a script that is not exposed", () => {
    const issues = validateJsScriptDocument(doc({ outputs: [] }));
    expect(
      issues.some((issue) => issue.code.startsWith("js_script_palette"))
    ).toBe(false);
  });
});

describe("assertValidJsScriptDocument", () => {
  it("throws naming the error, and stays quiet on warnings", () => {
    expect(() =>
      assertValidJsScriptDocument(
        doc({
          inputs: [
            { name: "a", type: "str" },
            { name: "a", type: "str" }
          ]
        })
      )
    ).toThrow(/duplicate input port "a"/);
    expect(() => assertValidJsScriptDocument(doc())).not.toThrow();
  });
});
