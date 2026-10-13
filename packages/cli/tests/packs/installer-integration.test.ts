import { afterEach, expect, it, vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findNpmCli, runInstallerNpm, installerNpmVersion } from "../../src/npm-runner.js";
import { installPacks, type InstallerOperations } from "../../src/packs/installer.js";
import { snapshotInstallTree } from "../../src/packs/install-tree.js";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";

const exec = promisify(execFile);
const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup(conflict = false) {
  const directory = await mkdtemp(join(tmpdir(), "packs-registry-")); roots.push(directory);
  const npm = findNpmCli(); if (!npm) { throw new Error("Local npm-cli.js required for integration fixture"); }
  const tarballs = new Map<string, { name: string; version: string; bytes: Buffer; integrity: string; dependencies: Record<string, string> }>();
  for (const [name, version, dependencies] of [
    ["fixture-baseline", "1.0.0", {}], ["fixture-baseline", "2.0.0", {}],
    ["@nodetool-ai/fixture-nodes", "1.0.0", conflict ? { "fixture-baseline": "2.0.0" } : {}],
    ["@nodetool-ai/fixture2-nodes", "1.0.0", {}]
  ] as const) {
    const path = join(directory, `${name.replaceAll("/", "-")}-${version}`); await mkdir(path);
    const isPack = name.startsWith("@nodetool-ai/");
    await writeFile(join(path, "package.json"), JSON.stringify({ name, version, ...(isPack ? { peerDependencies: dependencies } : { dependencies }),
      scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" } }));
    const result = await exec(process.execPath, [npm, "pack", "--json", "--ignore-scripts"], { cwd: path });
    const filename: string = JSON.parse(result.stdout)[0].filename;
    const bytes = await readFile(join(path, filename));
    tarballs.set(`${name}@${version}`, { name, version, dependencies, bytes, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` });
  }
  let registry = "";
  const server = createServer((request, response) => {
    const url = decodeURIComponent(request.url ?? "");
    const tar = [...tarballs.values()].find((entry) => url === `/tar/${entry.name.replaceAll("/", "-")}-${entry.version}.tgz`);
    if (tar) { response.end(tar.bytes); return; }
    const name = url.slice(1); const versions = [...tarballs.values()].filter((entry) => entry.name === name);
    if (!versions.length) { response.statusCode = 404; response.end('{}'); return; }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ name, "dist-tags": { latest: versions.at(-1)!.version }, versions: Object.fromEntries(versions.map((entry) => [entry.version, {
      name, version: entry.version, ...(name.startsWith("@nodetool-ai/") ? { peerDependencies: entry.dependencies } : { dependencies: entry.dependencies }), scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" },
      dist: { tarball: `${registry}/tar/${name.replaceAll("/", "-")}-${entry.version}.tgz`, integrity: entry.integrity }
    }])) }));
  }); servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") { throw new Error("Fixture registry missing address"); }
  registry = `http://127.0.0.1:${address.port}`;
  const root = join(directory, "project"); await mkdir(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-project", version: "1.0.0", dependencies: { "fixture-baseline": "1.0.0" } }));
  const run: InstallerOperations["npm"] = (cwd, args, options) => runInstallerNpm(cwd, [...args, `--registry=${registry}`, `--cache=${join(directory, "cache")}`], options);
  await run(root, ["install"], { mode: "local" });
  if (conflict) {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-project", version: "1.0.0", dependencies: { "fixture-baseline": "*" } }));
  }
  const pinned = tarballs.get("@nodetool-ai/fixture-nodes@1.0.0")!;
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.0.0", owners: {}, packs: [{ id: "fixture", kind: "node-pack",
    npm: { name: pinned.name, version: pinned.version, integrity: pinned.integrity }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 1, nodeCount: 0 }] };
  vi.stubEnv("NODETOOL_PACKS_INSTALLER", "1");
  const request = { mode: { kind: "local" as const, installRoot: root, nodeModulesRoot: join(root, "node_modules"), cliRoot: root, coreVersion: "1.0.0", pathStyle: "posix" as const },
    authorized: true, packs: ["fixture"], catalog, stateFile: join(directory, "cli-packs.json") };
  const operations: InstallerOperations = { npmVersion: installerNpmVersion, npm: run,
    loadCheck: async () => { await exec(process.execPath, ["-e", "process.exit(0)"]); } };
  return { root, request, operations, tarballs };
}

it("real local registry additive install ignores scripts and saves exact dependency", async () => {
  const f = await setup(); await installPacks(f.request, f.operations);
  expect(JSON.parse(await readFile(join(f.root, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBe("1.0.0");
  await expect(readFile(join(f.root, "node_modules/@nodetool-ai/fixture-nodes/SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
}, 30000);
it("real conflicting dependency plan is refused before mutation", async () => {
  const f = await setup(true); const before = await snapshotInstallTree(f.root);
  await expect(installPacks(f.request, f.operations)).rejects.toThrow(/changes|removes/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
it("real failing child load check rolls back the installed tree", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root);
  const manifest = await readFile(join(f.root, "package.json"));
  const lock = await readFile(join(f.root, "package-lock.json"));
  const operations = { ...f.operations, loadCheck: async () => { await exec(process.execPath, ["-e", "throw new Error('fixture load failed')"]); } };
  await expect(installPacks(f.request, operations)).rejects.toThrow(/fixture load failed/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
  expect(await readFile(join(f.root, "package.json"))).toEqual(manifest);
  expect(await readFile(join(f.root, "package-lock.json"))).toEqual(lock);
}, 30000);
it("real wrong catalog integrity fails before child imports and rolls back", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root); const load = vi.fn(async () => {});
  const catalog = { ...f.request.catalog, packs: f.request.catalog.packs.map((pack) => ({ ...pack, npm: { ...pack.npm, integrity: "sha512-wrong" } })) };
  await expect(installPacks({ ...f.request, catalog }, { ...f.operations, loadCheck: load })).rejects.toThrow(/integrity/);
  expect(load).not.toHaveBeenCalled(); expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
it("real global same-version reinstallation plan is refused without changing the prior pack", async () => {
  const f = await setup(); const mode = { ...f.request.mode, kind: "global" as const };
  const pin = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  const catalog = { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "fixture2", npm: { name: pin.name, version: pin.version, integrity: pin.integrity } }] };
  const manifest = await readFile(join(f.root, "package.json"));
  await installPacks({ ...f.request, mode, catalog }, f.operations);
  const before = await snapshotInstallTree(f.root);
  await expect(installPacks({ ...f.request, mode, catalog, packs: ["fixture2"] }, f.operations)).rejects.toThrow(/changes/);
  expect(await snapshotInstallTree(f.root)).toEqual(before);
  expect(await readFile(join(f.root, "package.json"))).toEqual(manifest);
}, 30000);
it("real empty-global-desired rollback explicitly prunes additions and restores the snapshot", async () => {
  const f = await setup(); const before = await snapshotInstallTree(f.root);
  await expect(installPacks({ ...f.request, mode: { ...f.request.mode, kind: "global" } }, {
    ...f.operations, loadCheck: async () => { throw new Error("global child failed"); }
  })).rejects.toThrow("global child failed");
  expect(await snapshotInstallTree(f.root)).toEqual(before);
}, 30000);
