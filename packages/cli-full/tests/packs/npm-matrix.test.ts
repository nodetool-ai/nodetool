import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";
import { setupPackRegistry, disposePackRegistryFixtures, parseNpmPidMarker } from "../_helpers/pack-registry.js";
import { installPacks, type InstallPacksRequest, type InstallerOperations } from "../../src/packs/installer.js";
import { authorizePackInstallCommand } from "../../src/commands/pack-install-authorization.js";
import { detectInstallMode, installDetailsForMode } from "../../src/packs/mode.js";
import { snapshotInstallTree } from "../../src/packs/install-tree.js";
import { installerNpmVersion, runInstallerNpm } from "../../src/npm-runner.js";
import { readInstalledPacks, createMissingPackErrorForMode } from "../../src/packs/installed.js";
import { readDesiredState } from "../../src/packs/install-state.js";

const exec = promisify(execFile);
type Fixture = Awaited<ReturnType<typeof setupMatrixFixture>>;
const modulesAt = (prefix: string): string => join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules");

function killFixtureNpm(pid: number): void {
  try { process.kill(pid, "SIGKILL"); } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) { throw error; }
  }
}

async function setupMatrixFixture(conflict = false, options: Parameters<typeof setupPackRegistry>[1] = {}) {
  const fixture = await setupPackRegistry(conflict, options);
  await fixture.operations.npm(fixture.root, ["install", "@nodetool-ai/cli@1.0.0"], { mode: "local" });
  const mode = detectInstallMode(join(fixture.root, "node_modules", "@nodetool-ai", "cli", "index.js"), { globalNodeModulesRoots: [] });
  if (mode.kind !== "local") { throw new Error("Real npm project did not yield local installation mode"); }
  return { ...fixture, request: { ...fixture.request, mode } };
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
  const mode = detectInstallMode(join(cliRoot, "index.js"), explicitPrefix ? { globalNodeModulesRoots: [modules] } : {});
  expect(mode.kind).toBe("global");
  expect(mode).toMatchObject({ installRoot: cliRoot, nodeModulesRoot: join(cliRoot, "node_modules") });
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
    const f = await setupMatrixFixture();
    const npm = await installerNpmVersion(f.root);
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
  });

  it.runIf(process.env["GITHUB_ACTIONS"] === "true" && process.env["NODETOOL_NPM_MATRIX_DEFAULT_PREFIX"] === "1")("M01 installs globally at npm's actual default prefix", async () => {
    const f = await setupMatrixFixture();
    const prefix = (await exec(process.execPath, [f.npm, "prefix", "--global"])).stdout.trim();
    const cli = join(modulesAt(prefix), "@nodetool-ai", "cli");
    await expect(readFile(join(cli, "package.json"))).rejects.toMatchObject({ code: "ENOENT" });
    try {
      const request = await globalFixture(f, prefix, false);
      await install(request, f.operations);
      const tree = await snapshotInstallTree(cli);
      expect(tree.filter(entry => entry.name === "fixture-baseline")).toHaveLength(1);
      expect(tree.filter(entry => entry.name === "@nodetool-ai/fixture-nodes")).toHaveLength(1);
      expect(tree.some(entry => entry.name === "@nodetool-ai/cli")).toBe(false);
    } finally { await rm(cli, { recursive: true, force: true }); }
  });

  it("M02 adding a second global pack preserves the first and core identity", async () => {
    const f = await setupMatrixFixture();
    const request = await globalFixture(f, join(f.directory, "custom-prefix"));
    const version = await installerNpmVersion(request.mode.cliRoot);
    const operations: InstallerOperations = { ...f.operations, npm: async (root, args, options) => {
      const output = await f.operations.npm(root, args, options);
      if (version.startsWith("10.9.") && options.dryRun) {
        process.stderr.write(`Actual npm ${version} global replay plan:\n${output}\n`);
      }
      return output;
    } };
    await install(request, operations);
    const first = (await snapshotInstallTree(request.mode.cliRoot)).find(entry => entry.name === "@nodetool-ai/fixture-nodes");
    await install({ ...request, packs: ["fixture2"] }, operations);
    const after = await snapshotInstallTree(request.mode.cliRoot);
    expect(after.find(entry => entry.name === "@nodetool-ai/fixture-nodes")).toEqual(first);
    expect(after.filter(entry => entry.name === "fixture-baseline")).toHaveLength(1);
    expect(after.filter(entry => entry.name === "@nodetool-ai/fixture2-nodes")).toHaveLength(1);
  });

  it("M03 recognizes a real custom prefix from user npmrc without a fake global mode", async () => {
    const f = await setupMatrixFixture(); const prefix = join(f.directory, "prefix with spaces");
    const request = await globalFixture(f, prefix);
    const config = join(f.directory, "user.npmrc");
    await writeFile(config, `prefix=${JSON.stringify(prefix)}\n`);
    vi.stubEnv("npm_config_prefix", undefined); vi.stubEnv("NPM_CONFIG_PREFIX", undefined);
    vi.stubEnv("npm_config_userconfig", config);
    expect(detectInstallMode(join(request.mode.cliRoot, "index.js"))).toEqual(request.mode);
    await install(request, f.operations);
    expect((await snapshotInstallTree(request.mode.cliRoot)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
  });

  it("M04 global CLI upgrade removes packs and prints the actual restore command", async () => {
    const f = await setupMatrixFixture(); const prefix = join(f.directory, "reinstall-prefix");
    const request = await globalFixture(f, prefix); await install(request, f.operations);
    await exec(process.execPath, [f.npm, "install", "--global", `--prefix=${prefix}`, `--registry=${f.registry}`,
      `--cache=${join(f.directory, "cache")}`, "--ignore-scripts", "--no-audit", "--no-fund", "@nodetool-ai/cli@1.1.0"]);
    const mode = detectInstallMode(join(request.mode.cliRoot, "index.js"), { globalNodeModulesRoots: [modulesAt(prefix)] });
    expect(mode.coreVersion).toBe("1.1.0");
    const snapshot = readInstalledPacks(mode, { ...request.catalog!, coreVersion: "1.1.0" });
    expect(snapshot.packs).toEqual([]);
    vi.stubEnv("npm_config_prefix", prefix);
    const { configureCliPackHost, loadCliPackSnapshot } = await import("../../src/packs/host.js");
    const stderr = vi.spyOn(process.stderr, "write");
    configureCliPackHost(pathToFileURL(join(request.mode.cliRoot, "index.js")).href, { catalog: { ...request.catalog!, coreVersion: "1.1.0" }, stateFile: request.stateFile });
    await loadCliPackSnapshot();
    expect(stderr.mock.calls.map(([line]) => String(line)).join("")).toContain("nodetool packs add --restore");
  });

  it("M05 local add and remove update manifests and npm ci retains the installed pack", async () => {
    const f = await setupMatrixFixture();
    const mode = f.request.mode;
    const { createPackCommandServices } = await import("../../src/packs/command-service.js");
    const { registerPackCommands } = await import("../../src/commands/packs.js");
    const program = new Command();
    registerPackCommands(program, () => createPackCommandServices({ snapshot: readInstalledPacks(mode, f.request.catalog), catalog: f.request.catalog,
      stateFile: f.request.stateFile, operations: f.operations }));
    await program.parseAsync(["packs", "add", "fixture", "--yes"], { from: "user" });
    const manifest = JSON.parse(await readFile(join(f.root, "package.json"), "utf8"));
    expect(manifest.dependencies["@nodetool-ai/fixture-nodes"]).toBe("1.0.0");
    await f.operations.npm(f.root, ["ci"], { mode: "local" });
    expect((await snapshotInstallTree(f.root)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
    await program.parseAsync(["packs", "remove", "fixture"], { from: "user" });
    expect(JSON.parse(await readFile(join(f.root, "package.json"), "utf8")).dependencies["@nodetool-ai/fixture-nodes"]).toBeUndefined();
    expect((await snapshotInstallTree(f.root)).map(entry => entry.name)).not.toContain("@nodetool-ai/fixture-nodes");
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

  it("M08 forced flags beat hostile npmrc and environment while allowlisted scripts run", async () => {
    const f = await setupMatrixFixture(false, { optionalDependency: true, allowScript: true });
    await writeFile(join(f.root, ".npmrc"), `registry=${f.registry}\nignore-scripts=true\nlegacy-peer-deps=true\nglobal=true\ninstall-strategy=nested\nomit=optional\npackage-lock=false\ndry-run=true\nforce=true\n`);
    for (const [key, value] of Object.entries({ ignore_scripts: "false", legacy_peer_deps: "true", global: "true", install_strategy: "nested", omit: "optional", package_lock: "false", dry_run: "true", force: "true" })) {
      vi.stubEnv(`npm_config_${key}`, value);
    }
    let initialScriptsIgnored = false;
    const operations: InstallerOperations = { ...f.operations, npm: async (root, args, options) => {
      const result = await runInstallerNpm(root, [...args, `--cache=${join(f.directory, "cache")}`], options);
      if (args[0] === "install" && !options.dryRun) {
        await expect(readFile(join(root, "node_modules", "@nodetool-ai", "fixture-nodes", "SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
        initialScriptsIgnored = true;
      }
      return result;
    } };
    await install(f.request, operations);
    expect(initialScriptsIgnored).toBe(true);
    const after = await snapshotInstallTree(f.root);
    expect(after.find(entry => entry.name === "fixture-optional")?.path).toBe("node_modules/fixture-optional");
    expect(after.find(entry => entry.name === "@nodetool-ai/fixture-nodes")?.integrity).toBe(f.request.catalog.packs[0].npm.integrity);
    expect(await readFile(join(f.root, "node_modules", "@nodetool-ai", "fixture-nodes", "SCRIPT_RAN"), "utf8")).toBe("bad");
    await expect(readFile(join(f.root, "node_modules", "fixture-optional", "SCRIPT_RAN"))).rejects.toMatchObject({ code: "ENOENT" });
    expect(JSON.parse(await readFile(join(f.root, "package-lock.json"), "utf8")).packages).toHaveProperty("node_modules/fixture-optional");
  });

  it("M09 HTTPS registry mirror honors a custom CA and content integrity", async () => {
    const f = await setupMatrixFixture(false, { tls: true });
    vi.stubEnv("npm_config_registry", f.registry);
    vi.stubEnv("npm_config_fetch_retries", "0");
    const operations: InstallerOperations = { ...f.operations, npm: (root, args, options) =>
      runInstallerNpm(root, [...args, `--cache=${join(f.directory, "cache")}`], options) };
    const wrongCa = join(f.directory, "wrong-ca.pem"); await writeFile(wrongCa, "not a CA");
    vi.stubEnv("npm_config_cafile", wrongCa);
    const before = await snapshotInstallTree(f.root);
    await expect(install(f.request, operations)).rejects.toThrow(/certificate|self.signed|PEM|cert/i);
    expect(await snapshotInstallTree(f.root)).toEqual(before);
    vi.stubEnv("npm_config_cafile", fileURLToPath(f.caFile));
    await install(f.request, operations);
    expect(f.requests.some(path => path.startsWith("/tar/"))).toBe(true);
    expect((await snapshotInstallTree(f.root)).find(entry => entry.name === "@nodetool-ai/fixture-nodes")?.integrity).toBe(f.request.catalog.packs[0].npm.integrity);
  });

  it("M10 offline installation succeeds with a warm cache without registry requests", async () => {
    const f = await setupMatrixFixture();
    await f.operations.npm(f.root, ["cache", "add", "@nodetool-ai/fixture-nodes@1.0.0"], { mode: "local" });
    const count = f.requests.length; vi.stubEnv("npm_config_offline", "true");
    await install(f.request, f.operations);
    expect(f.requests).toHaveLength(count);
  });

  it("M11 offline cold cache fails before mutation and preserves the tree", async () => {
    const f = await setupMatrixFixture(); const before = await snapshotInstallTree(f.root);
    const manifest = await readFile(join(f.root, "package.json")); const lock = await readFile(join(f.root, "package-lock.json"));
    await rm(join(f.directory, "cache"), { recursive: true, force: true });
    const count = f.requests.length; vi.stubEnv("npm_config_offline", "true");
    await expect(install(f.request, f.operations)).rejects.toThrow(/cache|ENOTCACHED|offline/i);
    expect(await snapshotInstallTree(f.root)).toEqual(before);
    expect(await readFile(join(f.root, "package.json"))).toEqual(manifest);
    expect(await readFile(join(f.root, "package-lock.json"))).toEqual(lock);
    expect(f.requests).toHaveLength(count);
  });

  it("M12 two concurrent additions wait on the real root lock and both succeed", async () => {
    const f = await setupMatrixFixture(); const request = withSecondPack(f);
    const before = await snapshotInstallTree(f.root);
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
    const after = await snapshotInstallTree(f.root);
    expect(after.map(entry => entry.name)).toEqual(expect.arrayContaining(["@nodetool-ai/fixture-nodes", "@nodetool-ai/fixture2-nodes"]));
    expect(after.filter(entry => before.some(original => original.name === entry.name))).toEqual(before);
    expect((await readDesiredState(request.stateFile))[f.request.mode.installRoot]?.packs).toEqual(["fixture", "fixture2"]);
  });

  it("M13 a real npm install killed during metadata fetch is reported and explicitly repaired", async () => {
    const f = await setupMatrixFixture(); const request = withSecondPack(f); await install(request, f.operations);
    const before = await snapshotInstallTree(f.root);
    const paused = f.pauseRequest("/@nodetool-ai/fixture2-nodes", "nodetool-matrix-interrupted-install");
    const childEntry = join(f.directory, "interrupted-install.mjs");
    const source = (relative: string): string => pathToFileURL(fileURLToPath(new URL(relative, import.meta.url))).href;
    await writeFile(childEntry, `
      import { installPacks } from ${JSON.stringify(source("../../src/packs/installer.ts"))};
      import { authorizePackInstallCommand } from ${JSON.stringify(source("../../src/commands/pack-install-authorization.ts"))};
      import { spawn } from "node:child_process";
      import { runInstallerNpm, installerNpmVersion, npmInstallFlags, findNpmCli } from ${JSON.stringify(source("../../src/npm-runner.ts"))};
      const request = ${JSON.stringify({ ...request, packs: ["fixture2"] })};
      const authorization = await authorizePackInstallCommand({request, command:"packs-add"});
      await installPacks(request, authorization, {npmVersion:installerNpmVersion, loadCheck:async()=>{},
        npm:async(root,args,options)=>{
          if(args[0]!=="install"||options.dryRun){
            return runInstallerNpm(root,[...args,${JSON.stringify(`--registry=${f.registry}`)},${JSON.stringify(`--cache=${join(f.directory, "cache")}`)}],options);
          }
          const child=spawn(process.execPath,[findNpmCli(),...args,...npmInstallFlags(options.mode),
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
      expect(await snapshotInstallTree(f.root)).toEqual(before);
    } finally {
      clearTimeout(markerTimeout);
      child.kill("SIGKILL");
      try { if (npmPid) { killFixtureNpm(npmPid); } }
      finally { paused.release(); await closed; }
    }
    const lock = join(f.root, "node_modules", ".nodetool-packs.lock");
    const stale = new Date(Date.now() - 120_000); await utimes(lock, stale, stale);
    const { createPackCommandServices } = await import("../../src/packs/command-service.js");
    const services = await createPackCommandServices({ snapshot: readInstalledPacks(request.mode, request.catalog), catalog: request.catalog, stateFile: request.stateFile, operations: f.operations });
    const report = await services.doctor({});
    expect(report).toMatchObject({ healthy: false });
    expect(await services.doctor({ repair: true })).toMatchObject({ healthy: true, dirty: false });
    expect(await snapshotInstallTree(f.root)).toEqual(before);
  }, 120_000);

  it("M14 an unwritable global prefix reports access failure without invoking sudo", async () => {
    const f = await setupMatrixFixture(); const request = await globalFixture(f, join(f.directory, "locked-prefix"));
    if (request.mode.kind !== "global") { throw new Error("Expected actual global fixture"); }
    const modules = request.mode.nodeModulesRoot;
    const rootOwned = process.platform !== "win32" && process.env["GITHUB_ACTIONS"] === "true" && process.env["NODETOOL_NPM_MATRIX_DEFAULT_PREFIX"] === "1";
    if (process.platform === "win32") {
      await exec("icacls", [modules, "/deny", `${process.env["USERNAME"]}:(W)`]);
    } else if (rootOwned) {
      // Fixture setup changes ownership on disposable CI runners. The installer receives no sudo operation.
      await exec("sudo", ["chown", "0", modules]);
      expect((await stat(modules)).uid).toBe(0);
    } else { await chmod(modules, 0o555); }
    const npm = vi.fn(f.operations.npm);
    try {
      await expect(install(request, { ...f.operations, npm })).rejects.toThrow(/EACCES|EPERM|permission|access/i);
      expect(npm).not.toHaveBeenCalled();
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
    expect((await snapshotInstallTree(request.mode.cliRoot)).map(entry => entry.name)).toContain("@nodetool-ai/fixture-nodes");
  });

  it.each(["--preserve-symlinks", "--preserve-symlinks-main"])("M16 refuses actual NODE_OPTIONS=%s before calling npm", async flag => {
    const f = await setupMatrixFixture(); const before = await snapshotInstallTree(f.root);
    vi.stubEnv("NODE_OPTIONS", flag);
    const npm = vi.fn(f.operations.npm);
    await expect(install(f.request, { ...f.operations, npm })).rejects.toThrow(/preserve-symlinks/);
    expect(npm).not.toHaveBeenCalled();
    expect(await snapshotInstallTree(f.root)).toEqual(before);
  });
});
