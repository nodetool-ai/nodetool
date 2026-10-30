import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { installWithCommandAuthorization } from "../../src/commands/authorized-pack-install.js";
import { prepareInstallSelection } from "../../src/packs/install-selection.js";
import { authorizePackInstallCommand, assertInstallAuthorizationScope, StaleInstallAuthorizationError } from "../../src/commands/pack-install-authorization.js";
import { installPacks, type InstallerOperations } from "../../src/packs/installer.js";

const roots: string[] = [];
const stdinTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
afterEach(async () => {
  vi.unstubAllEnvs();
  for (const [stream, descriptor] of [[process.stdin, stdinTTY], [process.stderr, stderrTTY]] as const) {
    if (descriptor) { Object.defineProperty(stream, "isTTY", descriptor); } else { Reflect.deleteProperty(stream, "isTTY"); }
  }
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "packs-auth-")); roots.push(root);
  await mkdir(join(root, "node_modules"));
  await writeFile(join(root, "package.json"), '{"name":"fixture","version":"1"}');
  await writeFile(join(root, "node_modules/.package-lock.json"), '{"packages":{}}');
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1", owners: {}, packs: [{
    id: "fixture", kind: "node-pack", npm: { name: "@nodetool-ai/fixture-nodes", version: "1", integrity: "sha512-fixture" },
    registrar: "register", provides: [], requires: [], runtimeLibraries: [], scriptAllowlist: [], secrets: [], installBytes: 12345, nodeCount: 0
  }] };
  const request = { mode: { kind: "local" as const, installRoot: root, nodeModulesRoot: join(root, "node_modules"), cliRoot: root, coreVersion: "1", pathStyle: "posix" as const },
    packs: ["fixture"], catalog, stateFile: join(root, "cli-packs.json") };
  const operations: InstallerOperations = { npmVersion: vi.fn(async () => "11.16.0"), npm: vi.fn(async () => ""), loadCheck: vi.fn(async () => {}) };
  return { root, request, catalog, operations };
}
function terminal(): void {
  Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  Object.defineProperty(process.stderr, "isTTY", { value: true, configurable: true });
  vi.stubEnv("CI", undefined);
}
describe("CLI install authorization", () => {
  it.each(["packs-add", "packs-restore"] as const)("explicit %s issues a live token", async (command) => {
    const f = await fixture();
    expect(await authorizePackInstallCommand({ request: f.request, command })).not.toBeNull();
  });
  it.each(["run", "debug", "node-run", "workflows-run"] as const)("%s accepts only its flag or exact AUTO value", async (command) => {
    const f = await fixture(); vi.stubEnv("NODETOOL_AUTO_INSTALL", "0");
    expect(await authorizePackInstallCommand({ request: f.request, command })).toBeNull();
    expect(await authorizePackInstallCommand({ request: f.request, command, installMissing: true })).not.toBeNull();
    vi.stubEnv("NODETOOL_AUTO_INSTALL", "true");
    expect(await authorizePackInstallCommand({ request: f.request, command })).toBeNull();
    vi.stubEnv("NODETOOL_AUTO_INSTALL", "1");
    expect(await authorizePackInstallCommand({ request: f.request, command })).not.toBeNull();
  });
  it.each(["serve", "mcp-serve", "headless-job", "chat", "agent-tool"] as const)("%s ignores AUTO, flags, and prompts", async (command) => {
    const f = await fixture(); vi.stubEnv("NODETOOL_AUTO_INSTALL", "1"); terminal();
    const prompt = vi.fn(async () => true);
    expect(await authorizePackInstallCommand({ request: f.request, command, installMissing: true, prompt })).toBeNull();
    expect(prompt).not.toHaveBeenCalled(); expect(f.operations.npmVersion).not.toHaveBeenCalled();
  });
  it("TTY prompt defaults No and describes versions, estimates, scripts and local files", async () => {
    const f = await fixture(); terminal();
    const catalog = { ...f.catalog, packs: f.catalog.packs.map((pack) => ({ ...pack, runtimeLibraries: ["typescript"], scriptAllowlist: [{ name: "native", version: "2", integrity: "sha512-native" }] })) };
    const prompt = vi.fn(async () => false);
    expect(await authorizePackInstallCommand({ request: { ...f.request, catalog }, command: "run", prompt })).toBeNull();
    expect(prompt.mock.calls[0][0]).toMatchObject({ default: false });
    const message = prompt.mock.calls[0][0].message;
    for (const value of ["fixture-nodes@1", "12,345 bytes", "typescript@npm:", "native@2", "package.json", "package-lock.json", "not final disk usage"]) { expect(message).toContain(value); }
    const yes = await authorizePackInstallCommand({ request: f.request, command: "run", prompt: async () => true }); expect(yes).not.toBeNull();
  });
  it("CI and missing either TTY suppress the prompt", async () => {
    const f = await fixture(); terminal(); const prompt = vi.fn(async () => true);
    vi.stubEnv("CI", ""); expect(await authorizePackInstallCommand({ request: f.request, command: "run", prompt })).toBeNull();
    vi.stubEnv("CI", undefined); Object.defineProperty(process.stderr, "isTTY", { value: false, configurable: true });
    expect(await authorizePackInstallCommand({ request: f.request, command: "run", prompt })).toBeNull(); expect(prompt).not.toHaveBeenCalled();
  });
  it("runtime prompt estimates use measured canonical pin bytes, including aliases", async () => {
    const f = await fixture(); terminal();
    const catalog = { ...f.catalog, installPins: [{ name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: "pin", installBytes: 9876 }] };
    const prompt = vi.fn(async () => false);
    await authorizePackInstallCommand({ request: { ...f.request, catalog, runtimeLibraries: ["typescript"] }, command: "run", prompt });
    expect(prompt.mock.calls[0][0].message).toContain("Runtime typescript: typescript@npm:@typescript/typescript6@6.0.2, estimated 9,876 bytes");
  });
  it("rejects forged serialized values before npm version checks or locks", async () => {
    const f = await fixture(); const authorization = await authorizePackInstallCommand({ request: f.request, command: "packs-add" });
    for (const forged of [JSON.parse('{}'), JSON.parse(JSON.stringify(authorization)), JSON.parse('{"authorized":true,"source":"explicit"}')]) {
      await expect(installPacks(f.request, forged, f.operations)).rejects.toThrow(/live CLI/);
    }
    expect(f.operations.npmVersion).not.toHaveBeenCalled();
    await expect(readFile(join(f.request.mode.nodeModulesRoot, ".nodetool-packs.lock"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("rejects additional packs, transitive dependencies, runtime groups, scripts, and root/core/mode changes before npm", async () => {
    const f = await fixture(); const authorization = (await authorizePackInstallCommand({ request: f.request, command: "packs-add" }))!;
    const extra = { ...f.catalog.packs[0], id: "extra", npm: { ...f.catalog.packs[0].npm, name: "@nodetool-ai/extra-nodes" } };
    const cases = [
      { ...f.request, packs: ["extra"], catalog: { ...f.catalog, packs: [...f.catalog.packs, extra] } },
      { ...f.request, catalog: { ...f.catalog, packs: [{ ...f.catalog.packs[0], requires: ["extra"] }, extra] } },
      { ...f.request, runtimeLibraries: ["imaging"] },
      { ...f.request, catalog: { ...f.catalog, packs: [{ ...f.catalog.packs[0], scriptAllowlist: [{ name: "native", version: "1", integrity: "pin" }] }] } },
      { ...f.request, mode: { ...f.request.mode, coreVersion: "2" }, catalog: { ...f.catalog, coreVersion: "2" } },
      { ...f.request, mode: { ...f.request.mode, kind: "global" as const } }
    ];
    const other = await fixture(); cases.push({ ...f.request, mode: other.request.mode });
    for (const request of cases) { await expect(installPacks(request, authorization, f.operations)).rejects.toThrow(/authorization/); }
    expect(f.operations.npmVersion).not.toHaveBeenCalled(); expect(f.operations.npm).not.toHaveBeenCalled();
  });
  it("stale desired intent persists without expanding an automatic run install", async () => {
    const f = await fixture();
    await writeFile(f.request.stateFile, JSON.stringify({ [f.root]: { root: f.root, coreVersion: "older", packs: ["obsolete"], runtimeLibraries: ["imaging"] } }));
    vi.stubEnv("NODETOOL_AUTO_INSTALL", "1");
    const authorization = await authorizePackInstallCommand({ request: f.request, command: "run" });
    expect(authorization).not.toBeNull();
    const operations = { ...f.operations, npm: vi.fn<InstallerOperations["npm"]>(async (_root, _args, options) => {
      if (options.dryRun) { return '{"add":[{"name":"@nodetool-ai/fixture-nodes","version":"1"}],"change":[],"remove":[]}'; }
      await mkdir(join(f.root, "node_modules/@nodetool-ai/fixture-nodes"), { recursive: true });
      await writeFile(join(f.root, "node_modules/@nodetool-ai/fixture-nodes/package.json"), '{"name":"@nodetool-ai/fixture-nodes","version":"1"}');
      await writeFile(join(f.root, "node_modules/.package-lock.json"), '{"packages":{"node_modules/@nodetool-ai/fixture-nodes":{"version":"1","integrity":"sha512-fixture"}}}');
      return "";
    }) };
    const result = await installPacks(f.request, authorization!, operations);
    expect(result.packs).toEqual(["fixture", "obsolete"]); expect(result.runtimeLibraries).toEqual(["imaging"]);
    expect(operations.npm).toHaveBeenCalledWith(f.root, ["install", "@nodetool-ai/fixture-nodes@1", "--json"], expect.anything());
  });
});

it("a refusing server process rejects even an already-issued authorization", async () => {
  const f = await fixture(); const path = join(f.root, "request.json"); await writeFile(path, JSON.stringify(f.request));
  const auth = new URL("../../src/commands/pack-install-authorization.ts", import.meta.url).href;
  const processPolicy = new URL("../../src/packs/install-process.ts", import.meta.url).href;
  const code = `import {readFileSync} from 'node:fs'; import {authorizePackInstallCommand,assertLiveInstallAuthorization} from ${JSON.stringify(auth)};
import {refusePackInstallsInProcess} from ${JSON.stringify(processPolicy)};const request=JSON.parse(readFileSync(process.argv[1],'utf8'));
const token=await authorizePackInstallCommand({request,command:'packs-add'});refusePackInstallsInProcess('mcp serve');assertLiveInstallAuthorization(token);`;
  await expect(promisify(execFile)(process.execPath, ["--import", "tsx", "--conditions=nodetool-dev", "--input-type=module", "-e", code, path])).rejects.toThrow(/mcp serve processes/);
});

async function auditInstallerIsolation(repository: string): Promise<number> {
  const packages = new Map<string, { directory: string; dependencies: Record<string, string> }>();
  for (const entry of await readdir(join(repository, "packages"), { withFileTypes: true })) {
    if (!entry.isDirectory()) { continue; }
    const directory = join(repository, "packages", entry.name);
    try { const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8")); packages.set(manifest.name, { directory, dependencies: { ...manifest.dependencies, ...manifest.optionalDependencies } }); }
    catch (error) { if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) { throw error; } }
  }
  const seen = new Set<string>(); const pending = ["@nodetool-ai/websocket", "@nodetool-ai/agents", "@nodetool-ai/runtime"];
  let inspected = 0;
  while (pending.length) {
    const name = pending.pop()!; if (seen.has(name)) { continue; } seen.add(name);
    expect(name).not.toBe("@nodetool-ai/cli"); const workspace = packages.get(name); if (!workspace) { continue; }
    pending.push(...Object.keys(workspace.dependencies));
    const directories = [join(workspace.directory, "src")];
    while (directories.length) {
      const directory = directories.pop()!;
      let entries; try { entries = await readdir(directory, { withFileTypes: true }); } catch (error) { if (error instanceof Error && "code" in error && error.code === "ENOENT") { continue; } throw error; }
      for (const entry of entries) {
        if (entry.name === "__tests__") { continue; }
        const file = join(directory, entry.name);
        if (entry.isDirectory()) { directories.push(file); }
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          inspected++; const source = await readFile(file, "utf8");
          expect(source, file).not.toMatch(/(?:from\s*|import\s*\(|require\s*\()["'](?:@nodetool-ai\/cli|[^"']*\/(?:installer|pack-install-authorization)\.[jt]s)/);
        }
      }
    }
  }
  expect(inspected).toBeGreaterThan(0);
  const cliManifest = JSON.parse(await readFile(join(repository, "packages/cli/package.json"), "utf8"));
  expect(JSON.stringify(cliManifest.exports ?? {})).not.toMatch(/installer|authorization/);
  const entry = await readFile(join(repository, "packages/cli/src/index.ts"), "utf8"); expect(entry).not.toMatch(/installer|pack-install-authorization/);
  return inspected;
}
it("installer stays outside websocket, agents and runtime production dependency closures", async () => {
  expect(await auditInstallerIsolation(resolve(import.meta.dirname, "../../../.."))).toBeGreaterThan(0);
});
it("installer isolation gate rejects a deliberately added CLI production dependency", async () => {
  const f = await fixture();
  await mkdir(join(f.root, "packages/websocket"), { recursive: true }); await mkdir(join(f.root, "packages/cli"));
  await writeFile(join(f.root, "packages/websocket/package.json"), '{"name":"@nodetool-ai/websocket","dependencies":{"@nodetool-ai/cli":"1"}}');
  await writeFile(join(f.root, "packages/cli/package.json"), '{"name":"@nodetool-ai/cli"}');
  await expect(auditInstallerIsolation(f.root)).rejects.toThrow();
});

it("stale replay requests a new grant while changed direct requests remain refused", async () => {
  const f = await fixture();
  const extra = { ...f.catalog.packs[0], id: "other", npm: { ...f.catalog.packs[0].npm, name: "@nodetool-ai/other-nodes" } };
  const catalog = { ...f.catalog, packs: [...f.catalog.packs, extra] };
  const request = { ...f.request, catalog };
  const token = (await authorizePackInstallCommand({ request, command: "packs-add" }))!;
  const selection = await prepareInstallSelection(request);
  const replay = { ...selection, packs: [...selection.packs, extra], installedIds: ["other"] };
  expect(() => assertInstallAuthorizationScope(token, replay, "install", request)).toThrow(StaleInstallAuthorizationError);
  expect(() => assertInstallAuthorizationScope(token, replay, "install", { ...request, packs: ["other"] })).toThrow(/outside the install authorization/);
  expect(() => assertInstallAuthorizationScope(token, { ...replay, installedIds: [] }, "install", request)).toThrow(/outside the install authorization/);
});

it("command renewal repeats interactive consent and stops when the second prompt declines", async () => {
  const f = await fixture(); terminal();
  const prompt = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const install = vi.fn(async () => { throw new StaleInstallAuthorizationError(); });
  const result = await installWithCommandAuthorization({
    authorize: () => authorizePackInstallCommand({ request: f.request, command: "run", prompt }), install
  });
  expect(result).toBe(false); expect(prompt).toHaveBeenCalledTimes(2); expect(install).toHaveBeenCalledTimes(1);
  expect(prompt.mock.calls.every(([options]) => options.default === false)).toBe(true);
});

it("command renewal is bounded and never retries unrelated failures", async () => {
  const f = await fixture();
  const authorize = vi.fn(() => authorizePackInstallCommand({ request: f.request, command: "packs-add" }));
  const install = vi.fn(async () => { throw new StaleInstallAuthorizationError(); });
  await expect(installWithCommandAuthorization({ authorize, install })).rejects.toThrow(StaleInstallAuthorizationError);
  expect(authorize).toHaveBeenCalledTimes(4);
  const failure = vi.fn(async () => { throw new Error("broken dependency"); });
  await expect(installWithCommandAuthorization({ authorize, install: failure })).rejects.toThrow("broken dependency");
  expect(failure).toHaveBeenCalledTimes(1);
});

it("explicit add confirmation binds the displayed selection while another pack appears", async () => {
  const f = await fixture(); terminal();
  const extra = { ...f.catalog.packs[0], id: "other", npm: { ...f.catalog.packs[0].npm, name: "@nodetool-ai/other-nodes" } };
  const request = { ...f.request, catalog: { ...f.catalog, packs: [...f.catalog.packs, extra] } };
  const prompt = vi.fn(async ({ message }: { message: string; default: false }) => {
    expect(message).not.toContain("Pack other:");
    const directory = join(f.root, "node_modules/@nodetool-ai/other-nodes");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "package.json"), JSON.stringify({ name: extra.npm.name, version: extra.npm.version }));
    await writeFile(join(f.root, "node_modules/.package-lock.json"), JSON.stringify({ packages: {
      "node_modules/@nodetool-ai/other-nodes": { version: extra.npm.version, integrity: extra.npm.integrity }
    } }));
    return true;
  });
  const token = (await authorizePackInstallCommand({ request, command: "packs-add", confirm: true, prompt }))!;
  const current = await prepareInstallSelection(request);
  expect(() => assertInstallAuthorizationScope(token, current, "install", request)).toThrow(StaleInstallAuthorizationError);
  expect(prompt).toHaveBeenCalledTimes(1);
});
