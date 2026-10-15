import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const fixtureDirectory = mkdtempSync(join(root, "packages", "websocket", "src", ".pack-import-test-"));
const oxlint = join(root, "node_modules", ".bin", "oxlint");
const config = join(root, ".oxlintrc.json");

afterAll(() => { rmSync(fixtureDirectory, { recursive: true, force: true }); });

function lint(source: string): { status: number | null; errors: string[] } {
  const file = join(fixtureDirectory, "fixture.ts");
  writeFileSync(file, source);
  const result = spawnSync(oxlint, [file, "--config", config, "--format=json"], { cwd: root, encoding: "utf8" });
  expect(result.error).toBeUndefined();
  const report = JSON.parse(result.stdout);
  const errors = report.diagnostics.filter((item: { code: string }) => item.code === "pack-boundaries(no-direct-pack-imports)");
  return { status: result.status, errors: errors.map((item: { message: string }) => item.message) };
}

describe("core pack import migration ratchet", () => {
  it.each([
    'import "@nodetool-ai/fal-nodes";',
    'export { registerFalNodes } from "@nodetool-ai/fal-nodes";',
    'void import("@nodetool-ai/fal-nodes");',
    'void import(`@nodetool-ai/fal-nodes/${name}`);',
    'void import("@nodetool-ai/" + "fal-nodes");',
    'void importOptionalModule("@nodetool-ai/fal-nodes");',
    'import.meta.resolve("@nodetool-ai/fal-nodes");',
    'import "@nodetool-ai/base-nodes/builtin-packs";',
    'void import("@nodetool-ai/game-renderer/preparation3d");'
  ])("rejects a new import site: %s", (source) => {
    const result = lint(source);
    expect(result.status).toBe(1);
    expect(result.errors).toHaveLength(1);
  });

  it("allows erased type imports and the catalog helper", () => {
    const result = lint('import type { Metadata } from "@nodetool-ai/fal-nodes"; import { importPack } from "@nodetool-ai/node-catalog"; void importPack("fal");');
    expect(result.status).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects duplicate imports and requires removal of obsolete baseline entries", () => {
    const isolatedRoot = realpathSync(mkdtempSync(join(tmpdir(), "pack-ratchet-")));
    try {
      const pluginDirectory = join(isolatedRoot, "tools/oxlint/pack-boundaries");
      mkdirSync(pluginDirectory, { recursive: true });
      mkdirSync(join(isolatedRoot, "scripts/node-catalog"), { recursive: true });
      mkdirSync(join(isolatedRoot, "packages/websocket/src"), { recursive: true });
      cpSync(join(root, "tools/oxlint/pack-boundaries/index.mjs"), join(pluginDirectory, "index.mjs"));
      cpSync(join(root, "scripts/node-catalog/tiers.mjs"), join(isolatedRoot, "scripts/node-catalog/tiers.mjs"));
      symlinkSync(join(root, "node_modules"), join(isolatedRoot, "node_modules"));
      const statement = 'import("@nodetool-ai/fal-nodes")';
      writeFileSync(join(pluginDirectory, "migration-baseline.json"), JSON.stringify({
        "packages/websocket/src/fixture.ts": [{ kind: "dynamic", specifier: "@nodetool-ai/fal-nodes", statement, count: 1 }]
      }));
      const isolatedConfig = join(isolatedRoot, ".oxlintrc.json");
      writeFileSync(isolatedConfig, JSON.stringify({ jsPlugins: [join(pluginDirectory, "index.mjs")], rules: { "pack-boundaries/no-direct-pack-imports": "error" } }));
      const fixture = join(isolatedRoot, "packages/websocket/src/fixture.ts");
      for (const [source, status, message] of [
        [`// Unicode before the import: →\nvoid ${statement};`, 0, ""],
        [`void ${statement}; void ${statement};`, 1, "directly"],
        ['void importPack("fal");', 1, "unused migration baseline"]
      ] as const) {
        writeFileSync(fixture, source);
        const result = spawnSync(oxlint, [fixture, "--config", isolatedConfig, "--format=json"], { cwd: isolatedRoot, encoding: "utf8" });
        expect(result.error).toBeUndefined();
        expect(result.status, result.stdout + result.stderr).toBe(status);
        if (message) { expect(result.stdout).toContain(message); }
      }
    } finally {
      rmSync(isolatedRoot, { recursive: true, force: true });
    }
  });

  it("permits no legacy import exceptions after the dependency cuts", () => {
    const baseline = JSON.parse(readFileSync(join(root, "tools", "oxlint", "pack-boundaries", "migration-baseline.json"), "utf8"));
    expect(baseline).toEqual({});
  });
});
