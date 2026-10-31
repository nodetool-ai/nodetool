import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("builds catalog registries without packs and reports missing packs at feature boundaries", () => {
  const dir = mkdtempSync(join(tmpdir(), "cli-optional-packs-"));
  try {
    const script = join(dir, "check.mjs");
    const source = (file: string) => JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src", file)).href);
    const siblingSource = (name: string, file: string) => JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../../", name, "src", file)).href);
    writeFileSync(script, `
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
const { readCatalogIndex, readCatalogNodes } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../../node-catalog/src/index.ts")).href)});
const names = readCatalogIndex().packs.flatMap(pack => [pack.npm.name, ...pack.provides]);
let mode = 'missing';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@nodetool-ai/base-nodes/builtin-packs' || names.some(name => specifier === name || specifier.startsWith(name + '/'))) {
    if (mode === 'transitive') {
      return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify("const error = new Error(\"Cannot find package 'broken-transitive'\"); error.code = 'ERR_MODULE_NOT_FOUND'; throw error;")}), shortCircuit: true };
    }
    const error = new Error("Cannot find package '" + specifier + "'");
    error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return next(specifier, context);
} });
const { buildFullRegistry } = await import(${source("node-registry.ts")});
const registry = await buildFullRegistry();
const image = readCatalogNodes().find(node => node.pack === 'image');
assert.ok(image);
assert.equal(registry.availability(image.node_type), 'catalog');
assert.equal(registry.has(image.node_type), false);
for (const pack of ['kie', 'topaz', 'higgsfield', 'together']) {
  const node = readCatalogNodes().find(entry => entry.pack === pack);
  assert.ok(node);
  assert.equal(registry.availability(node.node_type), 'unknown');
}
const { createProviderStrict, availableProviders } = await import(${siblingSource("cli-providers", "index.ts")});
assert.ok(availableProviders().includes('ollama'));
await assert.rejects(createProviderStrict('transformers_js'), error => error.name === 'MissingPackError' && error.details.packs.some(pack => pack.id === 'transformers-js'));
await assert.rejects(createProviderStrict('whisper_cpp'), error => error.name === 'MissingPackError' && error.details.packs.some(pack => pack.id === 'whisper-cpp'));
const { runTimelineRender } = await import(${siblingSource("cli-timeline", "commands/timeline-render.ts")});
await assert.rejects(runTimelineRender('missing.json', {}, async () => null), error => error.name === 'MissingPackError' && error.details.packs.some(pack => pack.id === 'video'));
const { registerGameSmokeCommand } = await import(${siblingSource("cli-game", "commands/game-smoke.ts")});
const { Command } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../../../node_modules/commander/index.js")).href)});
const program = new Command();
registerGameSmokeCommand(program);
let output = '';
const write = process.stdout.write;
process.stdout.write = chunk => { output += String(chunk); return true; };
await program.parseAsync(['node', 'game', 'smoke', 'missing', '--json']);
process.stdout.write = write;
const report = JSON.parse(output);
assert.equal(report.error, 'missing_pack');
assert.ok(report.packs.some(pack => pack.id === 'game'));
assert.equal(report.restartRequired, false);
assert.equal(process.exitCode, 3);
process.exitCode = 0;
mode = 'transitive';
await assert.rejects(buildFullRegistry(), error => error.name !== 'MissingPackError' && error.message.includes('broken-transitive'));
`);
    const result = spawnSync(process.execPath, ["--conditions=nodetool-dev", "--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, NODETOOL_HOST: "cli", SECRETS_MASTER_KEY: "a".repeat(64) },
      encoding: "utf8", timeout: 30000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 40000);
