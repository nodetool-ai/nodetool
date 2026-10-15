import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it("loads 3D physics from the managed runtime root when the local peer is absent", () => {
  const dir = mkdtempSync(join(tmpdir(), "game-rapier-managed-"));
  try {
    const optionalRoot = join(dir, "node_modules");
    const pkg = join(optionalRoot, "@dimforge", "rapier3d-compat");
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, "package.json"), JSON.stringify({
      name: "@dimforge/rapier3d-compat", type: "module", exports: { import: "./index.mjs" }
    }));
    writeFileSync(join(pkg, "index.mjs"), "export default { init() {}, managedRuntime: true };\n");
    const script = join(dir, "check.mjs");
    writeFileSync(script, `
      import assert from 'node:assert/strict';
      import { registerHooks } from 'node:module';
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === '@dimforge/rapier3d-compat') {
          const error = new Error("Cannot find package '@dimforge/rapier3d-compat'");
          error.code = 'ERR_MODULE_NOT_FOUND';
          throw error;
        }
        return next(specifier, context);
      } });
      const { prepareRapier3D } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/spatial3d/world.ts")).href)});
      assert.equal((await prepareRapier3D()).managedRuntime, true);
    `);
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, NODETOOL_HOST: "cli", NODETOOL_OPTIONAL_NODE_MODULES: optionalRoot },
      encoding: "utf8", timeout: 30_000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 40_000);

it("loads 2D games without Rapier and retries a failed optional 3D physics load", () => {
  const dir = mkdtempSync(join(tmpdir(), "game-optional-"));
  try {
    const script = join(dir, "check.mjs");
    writeFileSync(script, `
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
let mode = 'missing';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@dimforge/rapier3d-compat' && mode !== 'ready') {
    const error = new Error(mode === 'missing' ? "Cannot find package '@dimforge/rapier3d-compat'" : "Cannot find package 'broken-transitive'");
    error.code = 'ERR_MODULE_NOT_FOUND';
    throw error;
  }
  return next(specifier, context);
} });
const { createGameSession, createTopDownRoomGame } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/index.ts")).href)});
const session = createGameSession(createTopDownRoomGame('a'.repeat(32)), 23);
session.step({ pressed: ['right'], justPressed: [] });
assert.equal(session.snapshot().tick, 1);
session.dispose();
const { prepareRapier3D } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/spatial3d/world.ts")).href)});
for (let attempt = 0; attempt < 2; attempt++) {
  await assert.rejects(prepareRapier3D(), error => error.name === 'MissingRuntimePackageError' && error.details.runtimePackage === 'rapier' && error.details.missing === '@dimforge/rapier3d-compat');
}
mode = 'transitive';
await assert.rejects(prepareRapier3D(), error => error.name !== 'MissingRuntimePackageError' && error.message.includes('broken-transitive'));
mode = 'ready';
const rapier = await prepareRapier3D();
const world = new rapier.World({ x: 0, y: -9.81, z: 0 });
world.step();
world.free();
assert.equal(await prepareRapier3D(), rapier);
`);
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."),
      env: { ...process.env, NODETOOL_HOST: "cli" },
      encoding: "utf8", timeout: 30000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 40000);

it("preserves initialization failures and permits another Rapier initialization attempt", () => {
  const dir = mkdtempSync(join(tmpdir(), "game-rapier-init-"));
  try {
    const fixture = join(dir, "rapier.mjs");
    writeFileSync(fixture, "let attempts = 0; export default { init() { attempts++; if (attempts === 1) throw new Error('broken initialization'); }, attempts: () => attempts };");
    const script = join(dir, "check.mjs");
    writeFileSync(script, `
import { registerHooks } from 'node:module';
import assert from 'node:assert/strict';
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@dimforge/rapier3d-compat') {
    return { url: ${JSON.stringify(pathToFileURL(fixture).href)}, shortCircuit: true };
  }
  return next(specifier, context);
} });
const { prepareRapier3D } = await import(${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "../src/spatial3d/world.ts")).href)});
await assert.rejects(prepareRapier3D(), error => error.name === 'Error' && error.message === 'broken initialization');
const rapier = await prepareRapier3D();
assert.equal(rapier.attempts(), 2);
assert.equal(await prepareRapier3D(), rapier);
assert.equal(rapier.attempts(), 2);
`);
    const result = spawnSync(process.execPath, ["--import", "tsx", script], {
      cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8", timeout: 30000
    });
    expect(result.status, result.stderr).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 40000);
