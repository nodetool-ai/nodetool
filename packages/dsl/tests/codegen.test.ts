import { describe, test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const generatedDir = path.resolve(import.meta.dirname, "../src/generated");
const flowDir = path.resolve(import.meta.dirname, "../src/flow/generated");

const readFlow = (file: string): string =>
  fs.readFileSync(path.join(flowDir, file), "utf-8");

describe("codegen output", () => {
  test("generated directory exists with files", () => {
    expect(fs.existsSync(generatedDir)).toBe(true);
    const files = fs.readdirSync(generatedDir).filter((f) => f.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(10);
  });

  test("index.ts barrel exists with namespace exports", () => {
    const indexPath = path.join(generatedDir, "index.ts");
    expect(fs.existsSync(indexPath)).toBe(true);
    const content = fs.readFileSync(indexPath, "utf-8");
    expect(content).toContain("export * as");
    expect(content).toMatch(/export \* as code/);
  });

  test("nodetool.code.ts has code factory", async () => {
    const mod = await import("../src/generated/nodetool.code.js");
    expect(typeof mod.code).toBe("function");
  });

  test("nodetool.constant.ts has integer factory", async () => {
    const mod = await import("../src/generated/nodetool.constant.js");
    expect(typeof mod.integer).toBe("function");
  });

  test("factory returns correct nodeType", async () => {
    const { workflow } = await import("../src/core.js");
    const { integer } = await import("../src/generated/nodetool.constant.js");
    const node = integer({ value: 5 });
    expect(node.nodeType).toBe("nodetool.constant.Integer");
    workflow(node);
  });

  test("multi-output node exposes named output() access", async () => {
    const { workflow, isOutputHandle } = await import("../src/core.js");
    const control = await import("../src/generated/nodetool.control.js");
    const node = control.if_({ condition: true, value: "test" });
    expect(isOutputHandle(node.output("if_true"))).toBe(true);
    expect(isOutputHandle(node.output("if_false"))).toBe(true);
    expect(() => node.output()).toThrow("requires an explicit output slot");
    workflow(node);
  });

  test("generated files use Connectable wrapper for inputs", () => {
    const constantPath = path.join(generatedDir, "nodetool.constant.ts");
    expect(fs.existsSync(constantPath)).toBe(true);
    const content = fs.readFileSync(constantPath, "utf-8");
    expect(content).toContain("Connectable<");
  });

  test("generated files import from core.js", () => {
    const controlPath = path.join(generatedDir, "nodetool.control.ts");
    expect(fs.existsSync(controlPath)).toBe(true);
    const content = fs.readFileSync(controlPath, "utf-8");
    expect(content).toContain('from "../core.js"');
    expect(content).toContain("createNode");
  });

  test("kie.dynamic_schema uses string model_info input", () => {
    const kiePath = path.join(generatedDir, "kie.dynamic_schema.ts");
    expect(fs.existsSync(kiePath)).toBe(true);
    const content = fs.readFileSync(kiePath, "utf-8");
    expect(content).toContain("model_info?: Connectable<string>;");
  });

  test("generated files declare output metadata", () => {
    const controlPath = path.join(generatedDir, "nodetool.control.ts");
    const content = fs.readFileSync(controlPath, "utf-8");
    expect(content).toContain("outputNames:");
  });
});

describe("flow codegen output", () => {
  test("every flow module names a graph namespace", () => {
    // Both trees come from one metadata pass, so the flow tree can only hold
    // namespaces the graph tree holds. It is not the same set on every
    // machine: an optional pack absent here (lib.apple, macOS-only) leaves its
    // graph file checked in with nothing to regenerate it from.
    const graph = new Set(
      fs
        .readdirSync(generatedDir)
        .filter((f) => f.endsWith(".ts") && f !== "index.ts")
    );
    const flow = fs.readdirSync(flowDir).filter((f) => f.endsWith(".ts"));
    expect(flow.length).toBeGreaterThan(10);
    expect(flow.filter((f) => !graph.has(f))).toEqual([]);
  });

  test("inputs carry plain values, not Connectable handles", () => {
    const content = readFlow("nodetool.text.ts");
    expect(content).not.toContain("Connectable<");
    expect(content).toContain("encoding?: \"cl100k_base\"");
  });

  test("a call delegates to the guest runtime with its node type", () => {
    const content = readFlow("nodetool.text.ts");
    expect(content).toContain('from "../guest-core.js"');
    expect(content).toContain(
      'return callNode<CountTokensOutputs>("nodetool.text.CountTokens", inputs);'
    );
  });

  test("a streaming-output node yields partial outputs", () => {
    const content = readFlow("nodetool.agents.ts");
    expect(content).toContain(
      "agent.stream = function (inputs: AgentInputs): AsyncIterable<Partial<AgentOutputs>>"
    );
  });

  test("a run-contract node yields {slot, value} and widens inputs to arrays", () => {
    const content = readFlow("nodetool.control.ts");
    expect(content).toContain(
      "take.stream = function (inputs: TakeInputs): AsyncIterable<{ slot: keyof TakeOutputs & string; value: unknown }>"
    );
    expect(content).toContain("n?: number | number[];");
  });

  test("a one-shot node has no stream member", () => {
    const content = readFlow("nodetool.constant.ts");
    expect(content).toContain("export function integer(");
    expect(content).not.toContain("integer.stream");
  });

  test("only namespaces with a streaming node import streamNode", () => {
    const oneShot = readFlow("nodetool.constant.ts");
    expect(oneShot).toContain('import { callNode } from "../guest-core.js";');
    const streaming = readFlow("nodetool.agents.ts");
    expect(streaming).toContain(
      'import { callNode, streamNode } from "../guest-core.js";'
    );
  });

  test("media ref types resolve from the package root", () => {
    const content = readFlow("nodetool.image.ts");
    expect(content).toContain('from "../../types.js"');
  });
});
