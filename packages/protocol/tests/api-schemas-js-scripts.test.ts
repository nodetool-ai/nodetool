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
    expect(parsed.packages).toEqual([]);
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
