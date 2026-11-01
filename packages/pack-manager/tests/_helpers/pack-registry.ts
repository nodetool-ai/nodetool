import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer, type RequestListener } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { Server } from "node:net";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { findNpmCli, runInstallerNpm, installerNpmVersion } from "../../src/npm-runner.js";
import type { InstallerOperations } from "../../src/packs/installer.js";
import { currentProject } from "../../src/packs/project.js";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core";

const exec = promisify(execFile);
const roots: string[] = [];
const servers: Server[] = [];
export function parseNpmPidMarker(output: string): number | null {
  const marker = /(?:^|\n)NPM_PID=(\d+)\r?\n/.exec(output);
  return marker ? Number(marker[1]) : null;
}
export async function disposePackRegistryFixtures(): Promise<void> {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
}

export async function setupPackRegistry(conflict = false, options: { readonly tls?: boolean; readonly optionalDependency?: boolean; readonly allowScript?: boolean; readonly globalCore?: boolean; readonly olderTransitiveDependency?: boolean; readonly commandFeature?: { readonly name: string; readonly dependencies: Record<string, string> } } = {}) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "packs-registry-"))); roots.push(directory);
  const npm = findNpmCli(); if (!npm) { throw new Error("Local npm-cli.js required for integration fixture"); }
  const tarballs = new Map<string, { name: string; version: string; bytes: Buffer; integrity: string; dependencies: Record<string, string> }>();
  for (const [name, version, dependencies] of [
    ["fixture-baseline", "1.0.0", {}], ["fixture-baseline", "2.0.0", {}],
    ["@nodetool-ai/fixture-nodes", "1.0.0", options.olderTransitiveDependency ? { "fixture-extractor": "1.0.0" } : conflict ? { "fixture-baseline": "2.0.0" } : {}],
    ["@nodetool-ai/fixture2-nodes", "1.0.0", {}],
    ["@nodetool-ai/cli", "1.0.0", { "fixture-baseline": options.olderTransitiveDependency ? "^1.0.0" : "1.0.0", ...(options.globalCore ? { "@nodetool-ai/fixture2-nodes": "1.0.0" } : {}) }],
    ["@nodetool-ai/cli", "1.1.0", { "fixture-baseline": "1.0.0" }],
    ["fixture-optional", "1.0.0", {}],
    ...(options.commandFeature ? [[options.commandFeature.name, "1.0.0", options.commandFeature.dependencies] as const] : []),
    ...(options.olderTransitiveDependency ? [
      ["fixture-baseline", "1.1.0", {}], ["fixture-extractor", "1.0.0", { "fixture-baseline": "1.0.0" }]
    ] as const : [])
  ] as const) {
    const path = join(directory, `${name.replaceAll("/", "-")}-${version}`); await mkdir(path);
    const isPack = name.endsWith("-nodes") && !options.olderTransitiveDependency;
    await writeFile(join(path, "package.json"), JSON.stringify({ name, version, main: "index.js", ...(isPack ? { peerDependencies: dependencies } : { dependencies }),
      ...(options.optionalDependency && name === "@nodetool-ai/fixture-nodes" ? { optionalDependencies: { "fixture-optional": "1.0.0" } } : {}),
      scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" } }));
    const source = name === options.commandFeature?.name
      ? `exports.feature={descriptor:{id:${JSON.stringify(name.replace("@nodetool-ai/", ""))},apiVersion:1,requires:[],capabilities:["cli:fixture"]},run:async()=>{Reflect.set(globalThis,"__nodetoolFixtureHost",require("@nodetool-ai/cli").file)}};`
      : name === "@nodetool-ai/cli" ? "module.exports = { file: __filename };\n" : "module.exports = {};\n";
    await writeFile(join(path, "index.js"), source);
    const result = await exec(process.execPath, [npm, "pack", "--json", "--ignore-scripts"], { cwd: path });
    const filename: string = JSON.parse(result.stdout)[0].filename;
    const bytes = await readFile(join(path, filename));
    tarballs.set(`${name}@${version}`, { name, version, dependencies, bytes, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}` });
  }
  let registry = "";
  const requests: string[] = [];
  const pausedRequests = new Map<string, { reached: () => void; released: Promise<void>; userAgent?: string }>();
  function pauseRequest(path: string, userAgent?: string): { reached: Promise<void>; release: () => void } {
    let reached!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { reached = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    pausedRequests.set(path, { reached, released, userAgent });
    return { reached: started, release };
  }
  const handler: RequestListener = (request, response) => {
    const url = decodeURIComponent(request.url ?? "");
    requests.push(url);
    const send = () => {
      if (response.destroyed) { return; }
      const tar = [...tarballs.values()].find((entry) => url === `/tar/${entry.name.replaceAll("/", "-")}-${entry.version}.tgz`);
      if (tar) { response.end(tar.bytes); return; }
      const name = url.slice(1); const versions = [...tarballs.values()].filter((entry) => entry.name === name);
      if (!versions.length) { response.statusCode = 404; response.end('{}'); return; }
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ name, "dist-tags": { latest: versions.at(-1)!.version }, versions: Object.fromEntries(versions.map((entry) => [entry.version, {
        name, version: entry.version, ...(name.endsWith("-nodes") && !options.olderTransitiveDependency ? { peerDependencies: entry.dependencies } : { dependencies: entry.dependencies }), scripts: { postinstall: "node -e \"require('fs').writeFileSync('SCRIPT_RAN', 'bad')\"" },
        ...(options.optionalDependency && name === "@nodetool-ai/fixture-nodes" ? { optionalDependencies: { "fixture-optional": "1.0.0" } } : {}),
        dist: { tarball: `${registry}/tar/${name.replaceAll("/", "-")}-${entry.version}.tgz`, integrity: entry.integrity }
      }])) }));
    };
    const paused = pausedRequests.get(url);
    if (paused && (!paused.userAgent || request.headers["user-agent"] === paused.userAgent)) {
      pausedRequests.delete(url);
      paused.reached();
      void paused.released.then(send);
    } else { send(); }
  };
  const caFile = new URL("../_fixtures/npm-matrix-ca.pem", import.meta.url);
  const server = options.tls ? createHttpsServer({ cert: await readFile(caFile), key: await readFile(new URL("../_fixtures/npm-matrix-key.pem", import.meta.url)) }, handler) : createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") { throw new Error("Fixture registry missing address"); }
  registry = `${options.tls ? "https" : "http"}://127.0.0.1:${address.port}`;
  // A CLI root that is never written to: packs install into their own project.
  const cliRoot = join(directory, "cli"); await mkdir(cliRoot);
  await writeFile(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.0.0" }));
  const packsRoot = join(directory, "packs", "1.0.0");
  const run: InstallerOperations["npm"] = (cwd, args, npmOptions) => runInstallerNpm(cwd, [...args, `--registry=${registry}`, `--cache=${join(directory, "cache")}`,
    ...(options.tls ? [`--cafile=${fileURLToPath(caFile)}`] : [])], npmOptions);
  const pinned = tarballs.get("@nodetool-ai/fixture-nodes@1.0.0")!;
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.0.0", owners: {}, packs: [{ id: "fixture", kind: "node-pack",
    npm: { name: pinned.name, version: pinned.version, integrity: pinned.integrity }, registrar: "register", provides: [], requires: [], runtimeLibraries: [], secrets: [],
    scriptAllowlist: options.allowScript ? [{ name: pinned.name, version: pinned.version, integrity: pinned.integrity }] : [], installBytes: 1, nodeCount: 0 }] };
  const mode = { kind: "local" as const, cliRoot, packsRoot, legacyInstallRoot: cliRoot, coreVersion: "1.0.0", pathStyle: process.platform === "win32" ? "win32" as const : "posix" as const };
  const request = { mode, packs: ["fixture"], catalog, stateFile: join(directory, "cli-packs.json") };
  const operations: InstallerOperations = { npmVersion: installerNpmVersion, npm: run,
    loadCheck: async () => { await exec(process.execPath, ["-e", "process.exit(0)"]); } };
  /** The active pack project generation. */
  const project = (): string => {
    const current = currentProject(packsRoot);
    if (!current) { throw new Error("No active pack project"); }
    return current;
  };
  return { cliRoot, packsRoot, project, request, operations, tarballs, registry, directory, npm, requests, caFile, pauseRequest, run };
}
