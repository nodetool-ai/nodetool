/**
 * Prompt construction: the guidance the plan asks for, the slots, and the rule
 * that sample values only travel when the caller passes them.
 */
import { describe, it, expect } from "vitest";
import {
  buildCodeGenSystemPrompt,
  buildCodeGenUserPrompt,
  buildCodeGenRetryPrompt
} from "../src/code-gen/prompt.js";

const STR = { type: "str" };

describe("buildCodeGenSystemPrompt", () => {
  const prompt = buildCodeGenSystemPrompt();

  it("carries the sandbox reference rendered from the manifest", () => {
    expect(prompt).toContain("Sandbox API");
    expect(prompt).toContain("workspace.read");
    expect(prompt).toContain("format.number");
  });

  it("states the authoring guidance", () => {
    expect(prompt).toContain("every declared output on every return path");
    expect(prompt).toContain("Prefer pure data reshaping");
    expect(prompt).toMatch(/`state`.*`yield`/s);
    expect(prompt).toContain("base64");
    expect(prompt).toContain("submit_code");
  });

  it("is a pure function of the manifest", () => {
    expect(buildCodeGenSystemPrompt()).toBe(prompt);
  });
});

describe("buildCodeGenUserPrompt", () => {
  it("renders the instruction and typed input slots", () => {
    const prompt = buildCodeGenUserPrompt({
      instruction: "Count the words",
      inputs: [
        { name: "text", type: STR, description: "the source text" },
        { name: "limit", type: { type: "int" }, required: false }
      ]
    });

    expect(prompt).toContain("Count the words");
    expect(prompt).toContain("- text: str — the source text");
    expect(prompt).toContain("- limit: int [optional]");
  });

  it("names the expected output when launched from a handle", () => {
    const prompt = buildCodeGenUserPrompt({
      instruction: "Build the caption",
      inputs: [],
      expectedOutput: { name: "caption", type: STR }
    });

    expect(prompt).toContain("- caption: str");
    expect(prompt).toContain("exact name and type");
  });

  it("attaches the current node on the edit path", () => {
    const prompt = buildCodeGenUserPrompt({
      instruction: "Also return the count",
      inputs: [{ name: "text", type: STR }],
      currentCode: "return { words: text.split(' ') };",
      currentOutputs: [{ name: "words", type: { type: "list" } }]
    });

    expect(prompt).toContain("Revise this existing node");
    expect(prompt).toContain("return { words: text.split(' ') };");
    expect(prompt).toContain("Current outputs:");
  });

  it("omits sample values unless they are supplied", () => {
    const base = {
      instruction: "Count the words",
      inputs: [{ name: "text", type: STR }]
    };
    expect(buildCodeGenUserPrompt(base)).not.toContain("Sample values");
    expect(
      buildCodeGenUserPrompt({ ...base, sampleValues: { text: "hello there" } })
    ).toContain('- text = "hello there"');
  });

  it("truncates an oversized sample value", () => {
    const prompt = buildCodeGenUserPrompt({
      instruction: "Reshape",
      inputs: [{ name: "blob", type: STR }],
      sampleValues: { blob: "x".repeat(5000) }
    });
    expect(prompt).toContain("…");
    expect(prompt.length).toBeLessThan(3000);
  });
});

describe("buildCodeGenRetryPrompt", () => {
  it("carries the errors and the rejected attempt", () => {
    const prompt = buildCodeGenRetryPrompt(
      ["A return path omits the declared output \"count\"."],
      "return { words: [] };"
    );
    expect(prompt).toContain('omits the declared output "count"');
    expect(prompt).toContain("return { words: [] };");
    expect(prompt).toContain("full corrected node");
  });
});
