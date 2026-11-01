import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const CHILD_TIMEOUT_MS = 30_000;
// Allow child startup and cleanup to finish before the outer test deadline.
const SUBPROCESS_TEST_TIMEOUT_MS = CHILD_TIMEOUT_MS + 5_000;

function fixture(body: string, version: "matching" | "wrong"): ReturnType<typeof spawnSync> {
  const inventory = pathToFileURL(resolve(import.meta.dirname, "../../pack-manager/src/packs/installed.ts")).href;
  const mode = pathToFileURL(resolve(import.meta.dirname, "../../pack-manager/src/packs/mode.ts")).href;
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { join } from 'node:path';
    import { pathToFileURL } from 'node:url';
    import { registerHooks } from 'node:module';
    const catalog = await import('@nodetool-ai/node-catalog');
    const { NodeRegistry } = await import('@nodetool-ai/node-sdk');
    const { readInstalledPacks } = await import(${JSON.stringify(inventory)});
    const { classifyInstallLayout } = await import(${JSON.stringify(mode)});
    const root = mkdtempSync(join(tmpdir(), 'nodetool-installed-loader-'));
    const coreVersion = catalog.readCatalogIndex().coreVersion;
    const generation = 'g-0-0000000000000000';
    const packsRoot = join(root, 'packs', coreVersion);
    const packRoot = join(packsRoot, generation, 'node_modules', '@nodetool-ai', 'fal-nodes');
    mkdirSync(packRoot, { recursive: true });
    writeFileSync(join(packsRoot, 'current.json'), JSON.stringify({ schemaVersion: 1, generation }));
    const version = ${JSON.stringify(version)} === 'matching' ? coreVersion : '0.0.0';
    const nodeType = catalog.readCatalogNodes().find(node => node.pack === 'fal').node_type;
    const sdk = import.meta.resolve('@nodetool-ai/node-sdk');
    writeFileSync(join(packRoot, 'package.json'), JSON.stringify({ name: '@nodetool-ai/fal-nodes', version, type: 'module',
      exports: { '.': { import: './index.js', require: './require.cjs' }, './subpath': { import: './subpath.js', require: './require.cjs' } } }));
    writeFileSync(join(packRoot, 'index.js'), 'import { BaseNode } from ' + JSON.stringify(sdk) + '; globalThis.falLoads = (globalThis.falLoads ?? 0) + 1; class Fixture extends BaseNode { static nodeType = ' + JSON.stringify(nodeType) + '; static title = "Fixture"; static description = ""; async process() { return {}; } } export function registerFalNodes(registry) { registry.register(Fixture); } export const marker = "admitted";');
    writeFileSync(join(packRoot, 'subpath.js'), 'export const marker = "admitted-subpath";');
    writeFileSync(join(packRoot, 'require.cjs'), 'throw new Error("require condition must not load");');
    const alternate = join(root, 'ancestor.js');
    writeFileSync(alternate, 'export const marker = "ancestor";');
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === '@nodetool-ai/fal-nodes') return { url: pathToFileURL(join(packRoot, 'index.js')).href, shortCircuit: true };
      if (specifier.startsWith('@nodetool-ai/fal-nodes/')) return { url: pathToFileURL(alternate).href, shortCircuit: true };
      return next(specifier, context);
    } });
    const snapshot = readInstalledPacks(classifyInstallLayout({ cliRoot: join(root, 'node_modules', '@nodetool-ai', 'cli'), coreVersion, projectHasCli: true, packsHome: join(root, 'packs') }), catalog.readCatalogIndex());
    catalog.setPackLoaderContext({ coreVersion, packs: snapshot.packs.map(pack => ({ id: pack.id, packages: [pack, ...pack.providedPackages] })), install: { supported: true, reason: null, command: null } });
    try { ${body} } finally { rmSync(root, { recursive: true, force: true }); }
  `], { cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8", timeout: CHILD_TIMEOUT_MS });
}

describe("installed pack loader", () => {
  it("keeps a rejected version catalog-only and refuses direct imports", () => {
    const child = fixture(`
      assert.equal(snapshot.wrongVersions[0].version, '0.0.0');
      const registry = new NodeRegistry();
      await catalog.registerAvailablePacks(registry, { includeOptionalPacks: true });
      assert.equal(registry.availability(nodeType), 'catalog');
      await assert.rejects(catalog.importPack('fal'), error => error.name === 'MissingPackError' && error.details.install.supported);
      await assert.rejects(catalog.importPack('fal', 'subpath'), error => error.name === 'MissingPackError');
      assert.equal(globalThis.falLoads, undefined);
    `, "wrong");
    expect(child.status, child.stderr?.toString()).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);

  it("anchors import-only exports and subpaths to the admitted package", () => {
    const child = fixture(`
      assert.equal((await catalog.importPack('fal')).marker, 'admitted');
      assert.equal((await catalog.importPack('fal', 'subpath')).marker, 'admitted-subpath');
    `, "matching");
    expect(child.status, child.stderr?.toString()).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);

  it("honors ESM condition order and refuses private subpaths", () => {
    const child = fixture(`
      writeFileSync(join(packRoot, 'package.json'), JSON.stringify({ name: '@nodetool-ai/fal-nodes', version: coreVersion, type: 'module',
        exports: { '.': { node: { import: './subpath.js', require: './require.cjs' }, import: './index.js' }, './private': null } }));
      assert.equal((await catalog.importPack('fal')).marker, 'admitted-subpath');
      await assert.rejects(catalog.importPack('fal', 'private'), error => error.name !== 'MissingPackError' && error.message.includes('does not export'));
    `, "matching");
    expect(child.status, child.stderr?.toString()).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);

  it("preserves admitted package initialization and transitive resolution failures", () => {
    const child = fixture(`
      writeFileSync(join(packRoot, 'index.js'), 'throw new Error("fixture initialization failure");');
      await assert.rejects(catalog.importPack('fal'), error => error.name !== 'MissingPackError' && error.message === 'fixture initialization failure');
      writeFileSync(join(packRoot, 'subpath.js'), 'import "nodetool-fixture-missing-transitive";');
      await assert.rejects(catalog.importPack('fal', 'subpath'), error => error.code === 'ERR_MODULE_NOT_FOUND' && error.message.includes('nodetool-fixture-missing-transitive'));
    `, "matching");
    expect(child.status, child.stderr?.toString()).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);

  it("rejects export symlinks escaping the admitted package", () => {
    const child = fixture(`
      rmSync(join(packRoot, 'subpath.js'));
      symlinkSync(alternate, join(packRoot, 'subpath.js'));
      await assert.rejects(catalog.importPack('fal', 'subpath'), error => error.message.includes('escapes admitted package'));
    `, "matching");
    expect(child.status, child.stderr?.toString()).toBe(0);
  }, SUBPROCESS_TEST_TIMEOUT_MS);
});
