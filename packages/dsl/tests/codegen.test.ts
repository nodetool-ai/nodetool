import { describe, test, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const generatedDir = path.resolve(import.meta.dirname, "../src/generated");

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
