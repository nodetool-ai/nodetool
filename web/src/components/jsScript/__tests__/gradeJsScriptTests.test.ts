import {
  gradeJsScriptCase,
  gradeJsScriptTests,
  streamMismatches,
  summarizeJsScriptTests
} from "../gradeJsScriptTests";
import type {
  JsScriptRunOutcome,
  JsScriptTestCase
} from "../../../stores/jsScript/JsScriptStore";

const outcome = (
  overrides: Partial<JsScriptRunOutcome> = {}
): JsScriptRunOutcome => ({
  ok: true,
  logs: [],
  duration_ms: 3,
  ...overrides
});

const testCase = (overrides: Partial<JsScriptTestCase> = {}): JsScriptTestCase => ({
  name: "case",
  inputs: {},
  ...overrides
});

describe("gradeJsScriptCase", () => {
  it("passes when every expected output matches", () => {
    const report = gradeJsScriptCase(
      testCase({ expect: { out: [1, 2] } }),
      outcome({ outputs: { out: [1, 2] } })
    );
    expect(report.ok).toBe(true);
    expect(report.mismatches).toEqual([]);
  });

  it("fails and names the handle when an expected output differs", () => {
    const report = gradeJsScriptCase(
      testCase({ expect: { out: "hello" } }),
      outcome({ outputs: { out: "goodbye" } })
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([
      { output: "out", expected: "hello", actual: "goodbye" }
    ]);
  });

  it("fails when an expected output was never produced", () => {
    const report = gradeJsScriptCase(
      testCase({ expect: { out: 1 } }),
      outcome({ outputs: {} })
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([
      { output: "out", expected: 1, actual: undefined }
    ]);
  });

  it("fails on a failed run without inventing output mismatches", () => {
    const report = gradeJsScriptCase(
      testCase({ expect: { out: 1 } }),
      outcome({ ok: false, error: "ReferenceError: x is not defined" })
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([]);
    expect(report.error).toBe("ReferenceError: x is not defined");
  });

  it("compares the emitted stream in order", () => {
    const report = gradeJsScriptCase(
      testCase({
        expectedStreamed: [
          { name: "out", value: 1 },
          { name: "out", value: 2 }
        ]
      }),
      outcome({
        streamed: [
          { name: "out", value: 1 },
          { name: "out", value: 9 }
        ]
      })
    );
    expect(report.ok).toBe(false);
    expect(report.mismatches).toEqual([
      {
        output: "streamed[1]",
        expected: { name: "out", value: 2 },
        actual: { name: "out", value: 9 }
      }
    ]);
  });

  it("reports one mismatch when the stream length differs", () => {
    expect(streamMismatches([1, 2], [1])).toEqual([
      { output: "streamed", expected: [1, 2], actual: [1] }
    ]);
  });

  it("passes a case with no expectations as long as the run succeeded", () => {
    expect(gradeJsScriptCase(testCase(), outcome()).ok).toBe(true);
    expect(gradeJsScriptCase(testCase(), outcome({ ok: false })).ok).toBe(false);
  });
});

describe("gradeJsScriptTests", () => {
  it("runs every case in order and rolls the results up", async () => {
    const seen: Record<string, unknown>[] = [];
    const report = await gradeJsScriptTests(
      [
        testCase({ name: "good", inputs: { a: 1 }, expect: { out: 2 } }),
        testCase({ name: "bad", inputs: { a: 2 }, expect: { out: 99 } })
      ],
      async (inputs) => {
        seen.push(inputs);
        return outcome({ outputs: { out: (inputs.a as number) + 1 } });
      }
    );

    expect(seen).toEqual([{ a: 1 }, { a: 2 }]);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    expect(report.cases.map((c) => [c.name, c.ok])).toEqual([
      ["good", true],
      ["bad", false]
    ]);
  });

  it("turns a transport failure into a failed case rather than throwing", async () => {
    const report = await gradeJsScriptTests([testCase()], async () => {
      throw new Error("network down");
    });
    expect(report.failed).toBe(1);
    expect(report.cases[0].error).toBe("network down");
  });

  it("summarizes an empty run as all-green with no cases", () => {
    expect(summarizeJsScriptTests([])).toEqual({
      passed: 0,
      failed: 0,
      cases: []
    });
  });
});
