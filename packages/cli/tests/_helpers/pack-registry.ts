import { vi } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { findNpmCli, runInstallerNpm, installerNpmVersion } from "../../src/npm-runner.js";
import type { InstallerOperations } from "../../src/packs/installer.js";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";

const exec = promisify(execFile);
const roots: string[] = [];
const servers: Server[] = [];
export async function disposePackRegistryFixtures(): Promise<void> {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function setupPackRegistry(conflict = false) {
  const directory = await mkdtemp(join(tmpdir(), "packs-registry-")); roots.push(directory);
  const npm = findNpmCli(); if (!npm) { throw new Error("Local npm-cli.js required for integration fixture"); }
  const tarballs = new Map<string, { name: string; version: string; bytes: Buffer; integrity: string; dependencies: Record<string, string> }>();
  for (const [name, version, dependencies] of [
    ["fixture-baseline", "1.0.0", {}], ["fixture-baseline", "2.0.0", {}],
    ["@nodetool-ai/fixture-nodes", "1.0.0", conflict ? { "fixture-baseline": "2.0.0" } : {}],
    ["@nodetool-ai/fixture2-nodes", "1.0.0", {}],
    ["@nodetool-ai/cli", "1.0.0", { "fixture-baseline": "1.0.0" }]
  ] as const) {
    const path = join(directory, `${name.replaceAll("/", "-")}-${version}`); await mkdir(path);
    const isPack = name.endsWith("-nodes");
    await writeFile(join(path, "package.json"), JSON.stringify({ name, version, main: "index.js", ...(isPack ? { peerDependencies: dependencies } : { dependencies }),
      scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" } }));
    await writeFile(join(path, "index.js"), "module.exports = {};\n");
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
      name, version: entry.version, ...(name.endsWith("-nodes") ? { peerDependencies: entry.dependencies } : { dependencies: entry.dependencies }), scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" },
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
    packs: ["fixture"], catalog, stateFile: join(directory, "cli-packs.json") };
  const operations: InstallerOperations = { npmVersion: installerNpmVersion, npm: run,
    loadCheck: async () => { await exec(process.execPath, ["-e", "process.exit(0)"]); } };
  return { root, request, operations, tarballs, registry, directory, npm };
}
