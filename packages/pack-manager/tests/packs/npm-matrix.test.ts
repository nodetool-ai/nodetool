import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { setupPackRegistry, disposePackRegistryFixtures, parseNpmPidMarker } from "../_helpers/pack-registry.js";
import { installPacks, type InstallPacksRequest, type InstallerOperations } from "../../src/packs/installer.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { detectInstallMode, installDetailsForMode, type InstallMode } from "../../src/packs/mode.js";
import { readInstallTree, type TreePackage } from "../../src/packs/install-tree.js";
import { installerNpmVersion, runInstallerNpm } from "../../src/npm-runner.js";
import { readInstalledPacks, createMissingPackErrorForMode } from "../../src/packs/installed.js";
import { readDesiredState } from "../../src/packs/install-state.js";
import { currentProject } from "../../src/packs/project.js";

const exec = promisify(execFile);
type Fixture = Awaited<ReturnType<typeof setupMatrixFixture>>;
const modulesAt = (prefix: string): string => join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");

function killFixtureNpm(pid: number): void {
  try { process.kill(pid, "SIGKILL"); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) { throw error; }
  }
}

function packsRootOf(mode: InstallMode): string {
  if (mode.kind !== "global" && mode.kind !== "local") { throw new Error(mode.reason); }
  return mode.packsRoot;
}

/** The active pack project's tree, or an empty tree before the first install. */
async function projectTree(mode: InstallMode): Promise<readonly TreePackage[]> {
  const project = currentProject(packsRootOf(mode));
  return project ? readInstallTree(project) : [];
}

/** Package identities without generation paths, for comparing two generations. */
function identities(tree: readonly TreePackage[]): string[] {
  return tree.map(entry => `${entry.path} ${entry.name}@${entry.version} ${entry.integrity ?? ""}`);
}

async function listing(directory: string): Promise<string[]> {
  return (await readdir(directory, { recursive: true })).sort();
}

async function setupMatrixFixture(conflict = false, options: Parameters<typeof setupPackRegistry>[1] = {}) {
  const fixture = await setupPackRegistry(conflict, options);
  const root = join(fixture.directory, "project");
  await mkdir(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "fixture-project", version: "1.0.0", dependencies: { "@nodetool-ai/cli": "1.0.0" } }));
  await fixture.run(root, ["install"]);
  const packsHome = join(fixture.directory, "packs");
  const mode = detectInstallMode(join(root, "node_modules", "@nodetool-ai", "cli", "index.js"), { globalNodeModulesRoots: [], packsHome });
  if (mode.kind !== "local") { throw new Error("Real npm project did not yield local installation mode"); }
  return { ...fixture, root, packsHome, request: { ...fixture.request, mode } };
}

async function install(request: InstallPacksRequest, operations: InstallerOperations): Promise<void> {
  const authorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  if (!authorization) { throw new Error("Matrix install was not authorized"); }
  await installPacks(request, authorization, operations);
}

function withSecondPack(f: Fixture): InstallPacksRequest {
  const pin = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0");
  if (!pin) { throw new Error("Fixture registry did not publish the second pack"); }
  return { ...f.request, catalog: { ...f.request.catalog, packs: [...f.request.catalog.packs,
    { ...f.request.catalog.packs[0], id: "fixture2", scriptAllowlist: [], npm: { name: pin.name, version: pin.version, integrity: pin.integrity } }] } };
}

async function globalFixture(f: Fixture, prefix: string, explicitPrefix = true): Promise<InstallPacksRequest> {
  await exec(process.execPath, [f.npm, "install", "--global", ...(explicitPrefix ? [`--prefix=${prefix}`] : []),
    `--registry=${f.registry}`, `--cache=${join(f.directory, "cache")}`, "--ignore-scripts", "--no-audit", "--no-fund",
    "@nodetool-ai/cli@1.0.0"]);
  const modules = modulesAt(prefix);
  const cliRoot = join(modules, "@nodetool-ai", "cli");
  const mode = detectInstallMode(join(cliRoot, "index.js"), explicitPrefix ? { globalNodeModulesRoots: [modules], packsHome: f.packsHome } : { packsHome: f.packsHome });
  expect(mode.kind).toBe("global");
  expect(mode).toMatchObject({ packsRoot: join(f.packsHome, "1.0.0"), legacyInstallRoot: cliRoot });
  return { ...withSecondPack(f), mode };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await disposePackRegistryFixtures();
});

// The suite is opt-in. Its default-prefix case writes only on disposable CI runners.
describe.runIf(process.env["NODETOOL_NPM_MATRIX"] === "1")("actual npm matrix", () => {
  it("M00 verifies the runtime and npm version instead of trusting matrix labels", async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "npm-runtime-version-")));
    try {
      const npm = await installerNpmVersion(root);
      expect(npm).toMatch(/^(10\.9\.|11\.)/);
      if (process.env["NODETOOL_NPM_MATRIX_EXPECT_NPM"]) {
        expect(npm).toBe(process.env["NODETOOL_NPM_MATRIX_EXPECT_NPM"]);
      }
      if (process.env["NODETOOL_NPM_MATRIX_EXPECT_NODE"]) {
        expect(process.versions.node.split(".")[0]).toBe(process.env["NODETOOL_NPM_MATRIX_EXPECT_NODE"]);
      }
      if (process.env["NODETOOL_NPM_MATRIX_EXPECT_ARCH"]) {
        expect(process.arch.toUpperCase()).toBe(process.env["NODETOOL_NPM_MATRIX_EXPECT_ARCH"]);
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.runIf(process.env["GITHUB_ACTIONS"] === "true" && process.env["NODETOOL_NPM_MATRIX_DEFAULT_PREFIX"] === "1")("M01 a CLI at npm's actual default prefix installs packs without writing into it", async () => {
    const f = await setupMatrixFixture();
    const prefix = (await exec(process.execPath, [f.npm, "prefix", "--global"])).stdout.trim();
    const cli = join(modulesAt(prefix), "@nodetool-ai", "cli");
    await expect(readFile(join(cli, "package.json"))).rejects.toMatchObject({ code: "ENOENT" });
    try {
      const request = await globalFixture(f, prefix, false);
      const before = await listing(cli);
      await install(request, f.operations);
      expect(await listing(cli)).toEqual(before);
      const tree = await projectTree(request.mode);
      expect(tree.filter(entry => entry.name === "@nodetool-ai/fixture-nodes")).toHaveLength(1);
      expect(tree.some(entry => entry.name === "@nodetool-ai/cli")).toBe(false);
    } finally { await rm(cli, { recursive: true, force: true }); }
  });

  it("M02 adding a second global pack preserves the first and never writes into the CLI", async () => {
    const f = await setupMatrixFixture();
    const request = await globalFixture(f, join(f.directory, "custom-prefix"));
    const before = await listing(request.mode.cliRoot);
    await install(request, f.operations);
    const first = (await projectTree(request.mode)).find(entry => entry.name === "@nodetool-ai/fixture-nodes");
    await install({ ...request, packs: ["fixture2"] }, f.operations);
    const after = await projectTree(request.mode);
    expect(identities(after.filter(entry => entry.name === "@nodetool-ai/fixture-nodes"))).toEqual(identities(first ? [first] : []));
    expect(after.filter(entry => entry.name === "@nodetool-ai/fixture2-nodes")).toHaveLength(1);
    expect(await listing(request.mode.cliRoot)).toEqual(before);
  });

  it("M03 recognizes a real custom prefix from user npmrc without a fake global mode", async () => {
    const f = await setupMatrixFixture(); const prefix = join(f.directory, "prefix with spaces");
    const request = await globalFixture(f, prefix);
    const config = join(f.directory, "user.npmrc");
    await writeFile(config, `prefix=${JSON.stringify(prefix)}\n`);
    vi.stubEnv("npm_config_prefix", undefined); vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
    vi.stubEnv("npm_config_userconfig", config);
    expect(detectInstallMode(join(request.mode.cliRoot, "index.js"), { packsHome: f.packsHome })).toEqual(request.mode);
    await install(request, f.operations);
    expect((await projectTree(request.mode)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
  });

  it("M04 a global CLI upgrade keeps the old project and prints the actual restore command", async () => {
    const f = await setupMatrixFixture(); const prefix = join(f.directory, "reinstall-prefix");
    const request = await globalFixture(f, prefix); await install(request, f.operations);
    const previous = currentProject(packsRootOf(request.mode));
    await exec(process.execPath, [f.npm, "install", "--global", `--prefix=${prefix}`, `--registry=${f.registry}`,
      `--cache=${join(f.directory, "cache")}`, "--ignore-scripts", "--no-audit", "--no-fund", "@nodetool-ai/cli@1.1.0"]);
    const mode = detectInstallMode(join(request.mode.cliRoot, "index.js"), { globalNodeModulesRoots: [modulesAt(prefix)], packsHome: f.packsHome });
    expect(mode.coreVersion).toBe("1.1.0");
    expect(readInstalledPacks(mode, { ...request.catalog!, coreVersion: "1.1.0" }).packs).toEqual([]);
    expect(currentProject(packsRootOf(request.mode))).toBe(previous);
    const { readDesiredFor } = await import("../../src/packs/install-state.js");
    const { restoreWarning } = await import("../../src/packs/management.js");
    if (mode.kind !== "global") { throw new Error("Expected the upgraded global CLI"); }
    const snapshot = readInstalledPacks(mode, { ...request.catalog!, coreVersion: "1.1.0" });
    expect(restoreWarning(snapshot, await readDesiredFor(request.stateFile, mode))).toContain("nodetool packs add --restore");
  });

  it("M05 local add and remove change only the pack project, and npm ci reproduces it", async () => {
    const f = await setupMatrixFixture();
    const mode = f.request.mode;
    const consumer = await readFile(join(f.root, "package.json"));
    const { createPackCommandServices } = await import("../../src/packs/command-service.js");
    const { registerPackCommands } = await import("../../src/commands/packs.js");
    const program = new Command();
    registerPackCommands(program, undefined, () => createPackCommandServices({ snapshot: readInstalledPacks(mode, f.request.catalog), catalog: f.request.catalog,
      stateFile: f.request.stateFile, operations: f.operations }));
    await program.parseAsync(["packs", "add", "fixture", "--yes"], { from: "user" });
    const project = currentProject(packsRootOf(mode))!;
    expect(JSON.parse(await readFile(join(project, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBe("1.0.0");
    expect(await readFile(join(f.root, "package.json"))).toEqual(consumer);
    await f.run(project, ["ci"]);
    expect((await readInstallTree(project)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
    await program.parseAsync(["packs", "remove", "fixture"], { from: "user" });
    const next = currentProject(packsRootOf(mode))!;
    expect(JSON.parse(await readFile(join(next, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBeUndefined();
    expect((await projectTree(mode)).map(entry => entry.name)).not.toContain("@nodetool-ai/fixture-nodes");
    expect(await readFile(join(f.root, "package.json"))).toEqual(consumer);
  });

  it("M06 npx missing-pack payload refuses installation", async () => {
    const f = await setupMatrixFixture();
    const cache = join(f.directory, "npx-cache");
    const execution = await exec(process.execPath, [f.npm, "exec", "--yes", "--ignore-scripts", "--package=@nodetool-ai/cli@1.0.0",
      `--registry=${f.registry}`, `--cache=${cache}`, "--", "node", "-e", "process.stdout.write(process.env.PATH)"]);
    const bin = execution.stdout.split(delimiter).find(path => path.startsWith(join(cache, "_npx")) && path.endsWith(join("node_modules", ".bin")));
    if (!bin) { throw new Error("Actual npm exec did not expose its temporary package root"); }
    const root = join(dirname(bin), "@nodetool-ai", "cli");
    const mode = detectInstallMode(join(root, "index.js")); expect(mode.kind).toBe("npx");
    expect(installDetailsForMode(mode)).toMatchObject({ supported: false, reason: expect.stringContaining("global or local") });
    const error = createMissingPackErrorForMode(mode, "fal");
    expect(error).toMatchObject({ details: { install: { supported: false } } });
  });

  it.each([
    ["pnpm", ["node_modules", ".pnpm", "cli@1.0.0", "node_modules", "@nodetool-ai", "cli"]],
    ["Yarn PnP", [".yarn", "cache", "cli.zip", "node_modules", "@nodetool-ai", "cli"]],
    ["Bun", [".bun", "install", "global", "node_modules", "@nodetool-ai", "cli"]]
  ] as const)("M07 rejects a real %s installation layout", async (name, segments) => {
    const f = await setupMatrixFixture(); const root = join(f.directory, ...segments);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.0.0" }));
    await writeFile(join(root, "index.js"), "");
    if (name === "Yarn PnP") { await writeFile(join(f.directory, ".pnp.cjs"), ""); }
    const mode = detectInstallMode(join(root, "index.js"), { globalNodeModulesRoots: [] });
    expect(mode.kind).toBe("unsupported");
    expect(installDetailsForMode(mode)).toMatchObject({ supported: false, reason: expect.stringContaining(name) });
    const npm = vi.fn(f.operations.npm);
    await expect(install({ ...f.request, mode }, { ...f.operations, npm })).rejects.toThrow(/unsupported/);
    expect(npm).not.toHaveBeenCalled();
  });

  it("M08 forced flags beat hostile user configuration and environment while allowlisted scripts run", async () => {
    const f = await setupMatrixFixture(false, { optionalDependency: true, allowScript: true });
    const config = join(f.directory, "hostile.npmrc");
    await writeFile(config, `registry=${f.registry}\nignore-scripts=true\nlegacy-peer-deps=true\nglobal=true\ninstall-strategy=nested\nomit=optional\npackage-lock=false\ndry-run=true\nforce=true\n`);
    vi.stubEnv("npm_config_userconfig", config);
    for (const [key, value] of Object.entries({ ignore_scripts: "false", legacy_peer_deps: "true", global: "true", install_strategy: "nested", omit: "optional", package_lock: "false", dry_run: "true", force: "true" })) {
      vi.stubEnv(`npm_config_${key}`, value);
    }
    let initialScriptsIgnored = false;
    const operations: InstallerOperations = { ...f.operations, npm: async (root, args, options) => {
      const result = await runInstallerNpm(root, [...args, `--cache=${join(f.directory, "cache")}`], options);
      if (args[0] === "install") {
        await expect(readFile(join(root, "node_modules", "@nodetool-ai", "fixture-nodes", "SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
        initialScriptsIgnored = true;
      }
      return result;
    } };
    await install(f.request, operations);
    expect(initialScriptsIgnored).toBe(true);
    const project = currentProject(packsRootOf(f.request.mode))!;
    const after = await readInstallTree(project);
    expect(after.find(entry => entry.name === "fixture-optional")?.path).toBe("node_modules/fixture-optional");
    expect(after.find(entry => entry.name === "@nodetool-ai/fixture-nodes")?.integrity).toBe(f.request.catalog.packs[0].npm.integrity);
    expect(await readFile(join(project, "node_modules", "@nodetool-ai", "fixture-nodes", "SCRIPT_RAN"), "utf8")).toBe("bad");
    await expect(readFile(join(project, "node_modules", "fixture-optional", "SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(project, "package-lock.json"), "utf8")).packages).toHaveProperty("node_modules/fixture-optional");
  });

  it("M09 HTTPS registry mirror honors a custom CA and content integrity", async () => {
    const f = await setupMatrixFixture(false, { tls: true });
    vi.stubEnv("npm_config_registry", f.registry);
    vi.stubEnv("npm_config_fetch_retries", "0");
    const operations: InstallerOperations = { ...f.operations, npm: (root, args, options) =>
      runInstallerNpm(root, [...args, `--cache=${join(f.directory, "cache")}`], options) };
    const wrongCa = join(f.directory, "wrong-ca.pem"); await writeFile(wrongCa, "not a CA");
    vi.stubEnv("npm_config_cafile", wrongCa);
    await expect(install(f.request, operations)).rejects.toThrow(/certificate|self.signed|PEM|cert/i);
    expect(currentProject(packsRootOf(f.request.mode))).toBeNull();
    vi.stubEnv("npm_config_cafile", fileURLToPath(f.caFile));
    await install(f.request, operations);
    expect(f.requests.some(path => path.startsWith("/tar/"))).toBe(true);
    expect((await projectTree(f.request.mode)).find(entry => entry.name === "@nodetool-ai/fixture-nodes")?.integrity).toBe(f.request.catalog.packs[0].npm.integrity);
  });

  it("M10 offline installation succeeds with a warm cache without registry requests", async () => {
    const f = await setupMatrixFixture();
    await f.run(f.root, ["cache", "add", "@nodetool-ai/fixture-nodes@1.0.0", "fixture-baseline@1.0.0"]);
    const count = f.requests.length; vi.stubEnv("npm_config_offline", "true");
    await install(f.request, f.operations);
    expect(f.requests).toHaveLength(count);
  });

  it("M11 offline cold cache fails and leaves no active project", async () => {
    const f = await setupMatrixFixture();
    await rm(join(f.directory, "cache"), { recursive: true, force: true });
    const count = f.requests.length; vi.stubEnv("npm_config_offline", "true");
    await expect(install(f.request, f.operations)).rejects.toThrow(/cache|ENOTCACHED|offline/i);
    expect(currentProject(packsRootOf(f.request.mode))).toBeNull();
    expect((await readdir(packsRootOf(f.request.mode))).filter(name => name.startsWith("g-"))).toEqual([]);
    expect(f.requests).toHaveLength(count);
  });

  it("M12 two concurrent additions wait on the real project lock and both succeed", async () => {
    const f = await setupMatrixFixture(); const request = withSecondPack(f);
    let active = 0; let peak = 0;
    const operations: InstallerOperations = { ...f.operations, npm: async (...args) => {
      active++; peak = Math.max(peak, active);
      try { return await f.operations.npm(...args); } finally { active--; }
    } };
    const { createPackCommandServices } = await import("../../src/packs/command-service.js");
    const services = await Promise.all([0, 1].map(() => createPackCommandServices({
      snapshot: readInstalledPacks(request.mode, request.catalog), catalog: request.catalog, stateFile: request.stateFile, operations
    })));
    const results = await Promise.allSettled([services[0].add(["fixture"], { yes: true }), services[1].add(["fixture2"], { yes: true })]);
    for (const result of results) { if (result.status === "rejected") { throw result.reason; } }
    expect(peak).toBe(1);
    const after = await projectTree(request.mode);
    expect(after.map(entry => entry.name)).toEqual(expect.arrayContaining(["@nodetool-ai/fixture-nodes", "@nodetool-ai/fixture2-nodes"]));
    expect((await readDesiredState(request.stateFile))[f.packsHome]?.packs).toEqual(["fixture", "fixture2"]);
  });

  it("M13 a real npm install killed during metadata fetch leaves the active project, and repair rebuilds it", async () => {
    const f = await setupMatrixFixture(); const request = withSecondPack(f); await install(request, f.operations);
    const active = currentProject(packsRootOf(request.mode))!;
    const before = await readInstallTree(active);
    const paused = f.pauseRequest("/@nodetool-ai/fixture2-nodes", "nodetool-matrix-interrupted-install");
    const childEntry = join(f.directory, "interrupted-install.mjs");
    const source = (relative: string): string => pathToFileURL(fileURLToPath(new URL(relative, import.meta.url))).href;
    await writeFile(childEntry, `
      import { installPacks } from ${JSON.stringify(source("../../src/packs/installer.ts"))};
      import { authorizePackInstallCommand } from ${JSON.stringify(source("../../src/commands/pack-install-authorization.ts"))};
      import { spawn } from "node:child_process";
      import { runInstallerNpm, installerNpmVersion, projectInstallFlags, findNpmCli } from ${JSON.stringify(source("../../src/npm-runner.ts"))};
      const request = ${JSON.stringify({ ...request, packs: ["fixture2"] })};
      const authorization = await authorizePackInstallCommand({request, command:"packs-add"});
      await installPacks(request, authorization, {npmVersion:installerNpmVersion, loadCheck:async()=>{},
        npm:async(root,args,options)=>{
          if(args[0]!=="install"){
            return runInstallerNpm(root,[...args,${JSON.stringify(`--registry=${f.registry}`)},${JSON.stringify(`--cache=${join(f.directory, "cache")}`)}],options);
          }
          const child=spawn(process.execPath,[findNpmCli(),...args,...projectInstallFlags(),
            ${JSON.stringify(`--registry=${f.registry}`)},${JSON.stringify(`--cache=${join(f.directory, "interrupted-cache")}`)},
            "--user-agent=nodetool-matrix-interrupted-install"],
            {cwd:root,shell:false,stdio:["ignore","pipe","pipe"]});
          console.log("NPM_PID="+child.pid);
          return new Promise((resolve,reject)=>{
            let output="";let errors="";
            child.stdout.on("data",chunk=>{output+=chunk.toString();});
            child.stderr.on("data",chunk=>{errors+=chunk.toString();});
            child.once("error",reject);
            child.once("close",code=>{if(code===0){resolve(output);}else{reject(new Error("Interrupted npm: "+errors));}});
          });
        }});
    `);
    const child = spawn(process.execPath, ["--import", "tsx", childEntry], { cwd: fileURLToPath(new URL("../../../../", import.meta.url)), stdio: ["ignore", "pipe", "pipe"] });
    const closed = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()); });
    let output = "";
    let npmPid: number | undefined;
    let npmStarted!: () => void;
    const started = new Promise<void>(resolve => { npmStarted = resolve; });
    let markerTimeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        markerTimeout = setTimeout(() => reject(new Error(`npm did not reach metadata fetch: ${output}`)), 60_000);
        child.stdout.on("data", chunk => {
          output += String(chunk);
          const pid = parseNpmPidMarker(output);
          if (pid !== null) { npmPid = pid; npmStarted(); }
        });
        child.stderr.on("data", chunk => { output += String(chunk); });
        child.once("close", () => reject(new Error(`Installer exited before interruption: ${output}`)));
        void Promise.all([paused.reached, started]).then(() => resolve());
      });
      expect(npmPid).toBeGreaterThan(0);
      expect(() => process.kill(npmPid!, 0)).not.toThrow();
      expect(child.exitCode).toBeNull();
      expect(currentProject(packsRootOf(request.mode))).toBe(active);
      expect(await readInstallTree(active)).toEqual(before);
    } finally {
      clearTimeout(markerTimeout);
      child.kill("SIGKILL");
      try { if (npmPid) { killFixtureNpm(npmPid); } }
      finally { paused.release(); await closed; }
    }
    const lock = join(packsRootOf(request.mode), ".nodetool-packs.lock");
    const stale = new Date(Date.now() - 120_000); await utimes(lock, stale, stale);
    const { createPackCommandServices } = await import("../../src/packs/command-service.js");
    const services = await createPackCommandServices({ snapshot: readInstalledPacks(request.mode, request.catalog), catalog: request.catalog, stateFile: request.stateFile, operations: f.operations });
    expect(await services.doctor({})).toMatchObject({ healthy: false });
    expect(await services.doctor({ repair: true })).toMatchObject({ healthy: true });
    expect(identities(await projectTree(request.mode))).toEqual(identities(before));
    expect((await readdir(packsRootOf(request.mode))).filter(name => name.startsWith("g-"))).toHaveLength(2);
  }, 120_000);

  it("M14 a read-only global prefix still installs packs, because the CLI directory is never written", async () => {
    const f = await setupMatrixFixture(); const request = await globalFixture(f, join(f.directory, "locked-prefix"));
    const modules = dirname(dirname(request.mode.cliRoot));
    const rootOwned = process.platform !== "win32" && process.env["GITHUB_ACTIONS"] === "true" && process.env["NODETOOL_NPM_MATRIX_DEFAULT_PREFIX"] === "1";
    if (process.platform === "win32") {
      await exec("icacls", [modules, "/deny", `${process.env["USERNAME"]}:(W)`]);
    } else if (rootOwned) {
      // Fixture setup changes ownership on disposable CI runners. The installer receives no sudo operation.
      await exec("sudo", ["chown", "0", modules]);
      expect((await stat(modules)).uid).toBe(0);
    } else { await chmod(modules, 0o555); }
    try {
      await install(request, f.operations);
      expect((await projectTree(request.mode)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
    } finally {
      if (process.platform === "win32") { await exec("icacls", [modules, "/remove:d", process.env["USERNAME"] ?? ""]); }
      else if (rootOwned) { await exec("sudo", ["chown", String(process.getuid?.()), modules]); }
      else { await chmod(modules, 0o755); }
    }
  });

  it("M15 long prefix paths and the native APPDATA npm layout remain installable", async () => {
    const f = await setupMatrixFixture();
    const appData = join(f.directory, ...Array.from({ length: 6 }, (_, i) => `long-path-segment-${i}-${"x".repeat(18)}`));
    const prefix = process.platform === "win32" ? join(appData, "npm") : join(appData, "prefix");
    const request = await globalFixture(f, prefix);
    if (process.platform === "win32") {
      vi.stubEnv("APPDATA", appData); vi.stubEnv("npm_config_prefix", undefined); vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
      expect(detectInstallMode(join(request.mode.cliRoot, "index.js")).kind).toBe("global");
    }
    await install(request, f.operations);
    expect((await projectTree(request.mode)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
  });

  it.each(["--preserve-symlinks", "--preserve-symlinks-main"])("M16 refuses actual NODE_OPTIONS=%s before calling npm", async flag => {
    const f = await setupMatrixFixture();
    vi.stubEnv("NODE_OPTIONS", flag);
    const npm = vi.fn(f.operations.npm);
    await expect(install(f.request, { ...f.operations, npm })).rejects.toThrow(/preserve-symlinks/);
    expect(npm).not.toHaveBeenCalled();
    expect(currentProject(packsRootOf(f.request.mode))).toBeNull();
  });
});
