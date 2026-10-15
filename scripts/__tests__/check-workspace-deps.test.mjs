import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const script = fileURLToPath(new URL("../check-workspace-deps.mjs", import.meta.url));

function audit(source) {
  const root = mkdtempSync(join(tmpdir(), "workspace-deps-audit-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "node_modules"));
    mkdirSync(join(root, "packages", "websocket", "src"), { recursive: true });
    cpSync(script, join(root, "scripts", "check-workspace-deps.mjs"));
    symlinkSync(dirname(require.resolve("typescript/package.json")), join(root, "node_modules", "typescript"), "junction");
    writeFileSync(join(root, "packages", "websocket", "package.json"), JSON.stringify({ name: "@nodetool-ai/websocket" }));
    if (source !== null) {
      writeFileSync(join(root, "packages", "websocket", "src", "index.ts"), source);
    }
    const result = spawnSync(process.execPath, ["scripts/check-workspace-deps.mjs"], { cwd: root, encoding: "utf8" });
    expect(result.error).toBeUndefined();
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

it.each([
  'type Module = typeof import("@nodetool-ai/fal-nodes");',
  'const value = importPack<typeof import("@nodetool-ai/fal-nodes")>("fal");',
  'import type { Node } from "@nodetool-ai/fal-nodes";',
  'import { type Node } from "@nodetool-ai/fal-nodes";',
  'export type { Node } from "@nodetool-ai/fal-nodes";',
  'export { type Node } from "@nodetool-ai/fal-nodes";',
  'import type Pack = require("@nodetool-ai/fal-nodes");',
  '// import "@nodetool-ai/fal-nodes";\nconst example = `import("@nodetool-ai/fal-nodes")`;',
  'declare module "@nodetool-ai/facade" {}\nimport "@nodetool-ai/facade";'
])("does not require a production dependency for erased or ambient syntax: %s", (source) => {
  const result = audit(source);
  expect(result.status, result.output).toBe(0);
});

it.each([
  'import "@nodetool-ai/fal-nodes";',
  'import {} from "@nodetool-ai/fal-nodes";',
  'export {} from "@nodetool-ai/fal-nodes";',
  'import { Node, type Props } from "@nodetool-ai/fal-nodes";',
  'export { Node, type Props } from "@nodetool-ai/fal-nodes";',
  'export * from "@nodetool-ai/fal-nodes";',
  'export * as pack from "@nodetool-ai/fal-nodes";',
  'async function load() { return import("@nodetool-ai/fal-nodes"); }',
  'const pack = require("@nodetool-ai/fal-nodes");',
  'import Pack = require("@nodetool-ai/fal-nodes");',
  'const pack = import(`@nodetool-ai/fal-nodes`);'
])("rejects an undeclared production dependency: %s", (source) => {
  const result = audit(source);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain('imports "@nodetool-ai/fal-nodes"');
});

it("fails when no source files were inspected", () => {
  const result = audit(null);
  expect(result.status, result.output).toBe(1);
  expect(result.output).toContain("inspected no source files");
});
