import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const host = pathToFileURL(resolve(import.meta.dirname, "../../src/packs/host.ts")).href;
const providers = pathToFileURL(resolve(import.meta.dirname, "../../src/providers.ts")).href;
const doctor = pathToFileURL(resolve(import.meta.dirname, "../../src/packs/doctor.ts")).href;
const serve = resolve(import.meta.dirname, "../../src/packs/serve.ts");
const installProcess = pathToFileURL(resolve(import.meta.dirname, "../../src/packs/install-process.ts")).href;
const runtimeEnv = pathToFileURL(resolve(import.meta.dirname, "../../src/runtime-env.ts")).href;

function hostFixture(body: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import assert from 'node:assert/strict';
    import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
    import { join } from 'node:path';
    import { tmpdir } from 'node:os';
    import { pathToFileURL } from 'node:url';
    import { registerHooks } from 'node:module';
    const catalog = await import('@nodetool-ai/node-catalog');
    const { NodeRegistry } = await import('@nodetool-ai/node-sdk');
    const { configureCliPackHost, loadCliPackSnapshot, getCliPackSource, registerCliPacks } = await import(${JSON.stringify(host)});
    const root = mkdtempSync(join(tmpdir(), 'nodetool-pack-host-'));
    const version = catalog.readCatalogIndex().coreVersion;
    writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: { '@nodetool-ai/cli': version } }));
    function packageAt(name, packageVersion, code = '') {
      const dir = join(root, 'node_modules', name);
      mkdirSync(join(dir, 'dist'), { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: packageVersion, type: 'module', exports: { '.': { import: './dist/index.js' } } }));
      writeFileSync(join(dir, 'dist/index.js'), code);
      return dir;
    }
    const cli = packageAt('@nodetool-ai/cli', version);
    const entry = join(cli, 'dist/index.js');
    const whisper = packageAt('@nodetool-ai/whisper-cpp', '0.0.0', 'globalThis.rejectedProviderLoads = true; export function registerWhisperCppProviders() {}');
    packageAt('@nodetool-ai/transformers-js-nodes', version, 'globalThis.rejectedProviderLoads = true; export function registerTransformersJsNodes() {}');
    const companion = packageAt('@nodetool-ai/transformers-js-provider', '0.0.0', 'globalThis.rejectedProviderLoads = true; export function registerTransformersJsProvider() {}');
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === '@nodetool-ai/whisper-cpp') return { url: pathToFileURL(join(whisper, 'dist/index.js')).href, shortCircuit: true };
      if (specifier === '@nodetool-ai/transformers-js-provider') return { url: pathToFileURL(join(companion, 'dist/index.js')).href, shortCircuit: true };
      return next(specifier, context);
    } });
    configureCliPackHost(pathToFileURL(entry).href);
    try { ${body} } finally { rmSync(root, { recursive: true, force: true }); }
  `], { cwd: resolve(import.meta.dirname, "../../../.."), encoding: "utf8", timeout: 30000 });
}

describe("CLI installed pack host", () => {
  it("prints an upgrade restore notice once without installing or admitting desired packs", () => {
    const child = hostFixture(`
      process.env.XDG_DATA_HOME = root;
      const stateDir = join(root, 'nodetool');
      mkdirSync(stateDir);
      writeFileSync(join(stateDir, 'cli-packs.json'), JSON.stringify({ [root]: {
        root, coreVersion: '0.0.0', packs: ['game'], runtimeLibraries: []
      } }));
      const first = await loadCliPackSnapshot();
      assert.equal(await loadCliPackSnapshot(), first);
      assert.equal(first.packs.some(pack => pack.id === 'game'), false);
      assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), JSON.stringify({ dependencies: { '@nodetool-ai/cli': version } }));
    `);
    expect(child.status, child.stderr).toBe(0);
    expect(child.stderr.match(/1 pack from 0\.0\.0/g)).toHaveLength(1);
    expect(child.stderr).toContain('nodetool packs add --restore');
  });

  it("shares one admitted snapshot between command and server registries", () => {
    const child = hostFixture(`
      const source = await getCliPackSource();
      assert.equal(await getCliPackSource(), source);
      const snapshot = await loadCliPackSnapshot();
      assert.equal(snapshot.mode.kind, 'local');
      const { reportPackInstallation } = await import(${JSON.stringify(doctor)});
      const report = reportPackInstallation(snapshot);
      assert.ok(report.issues.some(issue => issue.kind === 'wrong_version' && issue.pack === 'whisper-cpp' && issue.version === '0.0.0'));
      const registry = new NodeRegistry();
      await registerCliPacks(registry, { includeOptionalPacks: true });
      const serverRegistry = new NodeRegistry();
      await source.register(serverRegistry, { includeOptionalPacks: true });
      assert.deepEqual(serverRegistry.listMetadata(), registry.listMetadata());
      const whisperType = catalog.readCatalogNodes().find(node => node.pack === 'whisper-cpp').node_type;
      assert.equal(registry.availability(whisperType), 'catalog');
      assert.equal(serverRegistry.availability(whisperType), 'catalog');
      await source.registerProviders({});
      assert.equal(globalThis.rejectedProviderLoads, undefined);
      writeFileSync(join(whisper, 'package.json'), JSON.stringify({ name: '@nodetool-ai/whisper-cpp', version, type: 'module', main: './dist/index.js' }));
      assert.equal(await loadCliPackSnapshot(), snapshot);
      await assert.rejects(catalog.importPack('whisper-cpp'), error => error.name === 'MissingPackError');
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("refuses stale provider and companion imports through strict provider creation", () => {
    const child = hostFixture(`
      const { createProviderStrict } = await import(${JSON.stringify(providers)});
      for (const provider of ['whisper_cpp', 'whisper_cpp_server', 'transformers_js']) {
        await assert.rejects(createProviderStrict(provider), error => error.name === 'MissingPackError' && error.details.install.supported === true);
      }
      assert.equal(globalThis.rejectedProviderLoads, undefined);
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("initializes the actual serve entry with the same installed source", () => {
    const server = `import assert from 'node:assert/strict';
      import { getCliPackSource, loadCliPackSnapshot } from ${JSON.stringify(host)};
      export async function startServer({ packSource }) {
        assert.equal(packSource, await getCliPackSource());
        const snapshot = await loadCliPackSnapshot();
        assert.equal(snapshot.mode.kind, 'local');
        assert.ok(snapshot.wrongVersions.some(pack => pack.id === 'whisper-cpp'));
        await packSource.registerProviders({});
        assert.equal(globalThis.rejectedProviderLoads, undefined);
        process.stdout.write('serve shares the installed source');
      }`;
    const child = hostFixture(`
      const file = join(cli, 'src', 'packs', 'serve.ts');
      mkdirSync(join(cli, 'src', 'packs'), { recursive: true });
      writeFileSync(join(cli, 'src', 'nodetool.ts'), '');
      writeFileSync(file, readFileSync(${JSON.stringify(serve)}, 'utf8')
        .replace('from "../runtime-env.js"', 'from ' + ${JSON.stringify(JSON.stringify(runtimeEnv))})
        .replace('from "./host.js"', 'from ' + ${JSON.stringify(JSON.stringify(host))})
        .replace('from "./install-process.js"', 'from ' + ${JSON.stringify(JSON.stringify(installProcess))}));
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === '@nodetool-ai/websocket/server') return { url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(server)}), shortCircuit: true };
        return next(specifier, context);
      } });
      await import(pathToFileURL(file).href);
    `);
    expect(child.status, child.stderr).toBe(0);
    expect(child.stdout).toContain("serve shares the installed source");
  });
});
