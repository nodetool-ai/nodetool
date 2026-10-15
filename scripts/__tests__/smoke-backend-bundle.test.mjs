import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { copyBackendBundleForSmoke } from "../smoke-backend-bundle.mjs";

test("backend smoke cannot resolve an unstaged dependency from the checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "backend-smoke-resolution-"));
  try {
    const project = join(root, "checkout");
    const dependency = join(project, "node_modules", "fixture-ancestor");
    const bundle = join(project, "backend-bundle");
    const temporary = join(root, "isolated");
    await Promise.all([mkdir(dependency, { recursive: true }), mkdir(bundle, { recursive: true }), mkdir(temporary)]);
    await writeFile(join(dependency, "package.json"), JSON.stringify({ name: "fixture-ancestor", main: "index.cjs" }));
    await writeFile(join(dependency, "index.cjs"), "module.exports = 7;");
    await writeFile(join(bundle, "server.cjs"), 'module.exports = require("fixture-ancestor");');
    expect(createRequire(join(bundle, "entry.cjs"))("./server.cjs")).toBe(7);

    const isolated = await copyBackendBundleForSmoke(bundle, temporary);
    expect(() => createRequire(join(isolated, "entry.cjs"))("./server.cjs")).toThrow("Cannot find module 'fixture-ancestor'");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
