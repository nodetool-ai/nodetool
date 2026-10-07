import { describe, expect, it } from "vitest";

import { plannedCodeStepProblems } from "../src/code-analysis.js";

const HANDLES = { inputs: ["input"], output: "output" };

describe("plannedCodeStepProblems", () => {
  it("passes a body that emits one value per row", () => {
    const code = [
      "for (const row of inputs.input) {",
      '  await emit("output", `A photo of ${row.name}`);',
      "}"
    ].join("\n");
    expect(plannedCodeStepProblems(code, HANDLES)).toEqual([]);
  });

  it("reports output() called once per row — the run that failed with 'already set'", () => {
    const code = [
      "const rows = inputs.input;",
      "for (const row of rows) {",
      "  const prompt = `A photo of ${row.name}`;",
      '  await output("output", prompt);',
      "}"
    ].join("\n");
    const [problem] = plannedCodeStepProblems(code, HANDLES);
    expect(problem).toContain("output() can be set only once per run");
  });

  it("reports output() inside a per-item callback", () => {
    const code = 'inputs.input.forEach((row) => output("output", row));';
    expect(plannedCodeStepProblems(code, HANDLES)[0]).toContain("once per item");
  });

  it("reports an input the build does not connect", () => {
    expect(
      plannedCodeStepProblems('await output("output", inputs.csv);', HANDLES)
    ).toEqual([
      "it reads inputs.csv, but the only connected input is inputs.input",
      "inputs.input is connected, but the body never reads it"
    ]);
  });

  it("reports a body that never sets the handle the next step reads", () => {
    expect(
      plannedCodeStepProblems('await output("rows", inputs.input);', HANDLES)
    ).toEqual(['it sets "rows", but the next step reads "output"']);
    expect(plannedCodeStepProblems("const x = inputs.input;", HANDLES)).toEqual([
      'it never sets "output", so the next step receives nothing'
    ]);
  });

  it("accepts the legacy returned object a snippet uses", () => {
    expect(
      plannedCodeStepProblems("return { output: inputs.text.split(',') };", {
        inputs: ["text"],
        output: "output"
      })
    ).toEqual([]);
  });

  it("reports a connected input the body never reads", () => {
    expect(
      plannedCodeStepProblems('await output("output", inputs.input);', {
        inputs: ["input", "input_2"],
        output: "output"
      })
    ).toEqual(["inputs.input_2 is connected, but the body never reads it"]);
  });

  it("accepts an input read through stream()", () => {
    const code = 'for await (const row of stream("input")) { await emit("output", row); }';
    expect(plannedCodeStepProblems(code, HANDLES)).toEqual([]);
  });

  it("reports a body that calls a model API itself", () => {
    const code = [
      'const res = await fetch("https://api.openai.com/v1/chat/completions", {});',
      'await output("output", inputs.input);'
    ].join("\n");
    expect(plannedCodeStepProblems(code, HANDLES)).toEqual([
      "it calls the model API at api.openai.com itself; put the model call in its own step with a model_role"
    ]);
  });

  it("reports a host call assigned without await", () => {
    const code = [
      'const key = getSecret("RESEND_API_KEY");',
      'const saved = await workspace.read("a.txt");',
      'await output("output", inputs.input + key + saved);'
    ].join("\n");
    expect(plannedCodeStepProblems(code, HANDLES)).toEqual([
      "it assigns getSecret() without await, so the variable holds a Promise"
    ]);
  });

  it("reports a body that does not parse", () => {
    expect(plannedCodeStepProblems("for (", HANDLES)[0]).toMatch(/^its code does not parse/);
  });
});
