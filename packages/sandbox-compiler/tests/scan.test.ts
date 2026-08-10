/**
 * The scan is scope-aware, and these are the cases that prove it: a shadowed
 * name is not a hit, a free one is, and the difference between a hard reference
 * and a feature-detected one decides error against warning.
 */

import { describe, expect, it } from "vitest";

import { scanBundle } from "../src/scan.js";

const names = (findings: readonly { name: string }[]): string[] =>
  [...new Set(findings.map((finding) => finding.name))].sort();

describe("scanBundle", () => {
  it("reports a free reference to a forbidden global", () => {
    const report = scanBundle("export const mode = process.env.NODE_ENV;\n");
    expect(names(report.errors)).toEqual(["process"]);
    expect(report.warnings).toHaveLength(0);
  });

  it("ignores a name a local binding shadows", () => {
    const report = scanBundle(
      "export function run(process) { return process.value; }\n" +
        "export function other() { const Buffer = 1; return Buffer; }\n"
    );
    expect(report.errors).toHaveLength(0);
  });

  it("ignores a name a module-level declaration owns", () => {
    const report = scanBundle(
      "const setTimeout = (fn) => fn();\nexport const run = (fn) => setTimeout(fn);\n"
    );
    expect(report.errors).toHaveLength(0);
  });

  it("resolves a reference above its own declaration", () => {
    const report = scanBundle(
      "export function run() { return helper(); }\nfunction helper() { return 1; }\n"
    );
    expect(report.errors).toHaveLength(0);
  });

  it("treats a bare typeof check as feature detection", () => {
    const report = scanBundle("export const has = typeof process !== \"undefined\";\n");
    expect(report.errors).toHaveLength(0);
    expect(names(report.warnings)).toEqual(["process"]);
  });

  it("treats a use guarded by a typeof check as feature detection", () => {
    const report = scanBundle(
      "export const mode = typeof process !== \"undefined\" ? process.env.NODE_ENV : \"sandbox\";\n" +
        "export const other = typeof Buffer !== \"undefined\" && Buffer.isBuffer;\n"
    );
    expect(report.errors).toHaveLength(0);
    expect(names(report.warnings)).toEqual(["Buffer", "process"]);
  });

  it("still reports a use the guard does not cover", () => {
    const report = scanBundle(
      "export const mode = typeof process !== \"undefined\" ? 1 : 2;\nexport const bad = window.location;\n"
    );
    expect(names(report.errors)).toEqual(["window"]);
    expect(names(report.warnings)).toEqual(["process"]);
  });

  it("does not treat a property name as a reference", () => {
    const report = scanBundle("export const shape = { process: 1, Buffer: 2 };\nexport const read = shape.process;\n");
    expect(report.errors).toHaveLength(0);
  });

  it("rejects a bundle that is not self-contained", () => {
    const report = scanBundle("import x from \"left-pad\";\nexport default x;\n");
    expect(report.rejection).toContain("left-pad");
  });

  it("rejects a dynamic import", () => {
    const report = scanBundle("export const load = () => import(\"./other.js\");\n");
    expect(report.rejection).toContain("dynamic import()");
  });

  it("rejects source that does not parse", () => {
    const report = scanBundle("export const = ;\n");
    expect(report.rejection).toContain("not valid JavaScript");
  });
});
