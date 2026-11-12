import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { findExamples } from "../validate-examples.mjs";

it("finds workflow fixtures under native example paths and excludes package manifests", () => {
  const root = mkdtempSync(join(tmpdir(), "validate-example-paths-"));
  try {
    const examples = join(root, "packages", "fixture", "examples", "nested");
    mkdirSync(examples, { recursive: true });
    const workflow = join(examples, "workflow.json");
    writeFileSync(workflow, "{}");
    writeFileSync(join(examples, "package.json"), "{}");
    writeFileSync(join(root, "unrelated.json"), "{}");
    expect(findExamples(root)).toEqual([workflow]);
    expect(() => findExamples(join(root, "missing"))).toThrow(/ENOENT/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
