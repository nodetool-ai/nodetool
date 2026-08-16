/**
 * Install / uninstall / list third-party NodeTool node packs in the
 * Electron-managed install root (`<userData>/optional-node`).
 *
 * The embedded server already has this directory on its module path
 * (`NODETOOL_OPTIONAL_NODE_MODULES` is passed to the backend at spawn time),
 * so anything installed here is discoverable by the pack loader after a
 * server restart.
 */

import { spawn } from "child_process";
import * as path from "path";
import * as fsp from "fs/promises";
import { app } from "electron";
import { discoverSandboxPack } from "@nodetool-ai/node-sdk/sandbox-pack-discovery";
import {
  NodePackHostManifestSchema,
  NodePackLedgerSchema,
  nodePackInstallStatus,
  type NodePackActionResult,
  type NodePackArtifactIdentity,
  type NodePackInstallMode,
  type NodePackInstallRecord,
  type NodePackLedger
} from "@nodetool-ai/protocol/sandbox-package";
import { z } from "zod";

import { logMessage } from "./logger";
import { getProcessEnv, resolveNpmInvocation } from "./config";
import type {
  NodePackInfo
} from "./types";

/** The directory `npm install` runs in (parent of `node_modules`). */
export function getNodePackInstallRoot(): string {
  return path.join(app.getPath("userData"), "optional-node");
}

function nodeModulesDir(): string {
  return path.join(getNodePackInstallRoot(), "node_modules");
}

function npmCacheDir(): string {
  return path.join(app.getPath("userData"), "npm-cache");
}

const NAME_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*$/i;
const SPEC_RE = /^(@[a-z0-9][\w.-]*\/)?[a-z0-9][\w.-]*(@[\w.\-^~><=*]+)?$/i;

const installedPackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1).optional(),
  nodetool: z.unknown().optional()
}).passthrough();
const lockfileEntrySchema = z.object({
  version: z.string().min(1).optional(),
  resolved: z.string().min(1).optional(),
  integrity: z.string().min(1).optional(),
  dependencies: z.record(z.string(), z.string()).optional(),
  optionalDependencies: z.record(z.string(), z.string()).optional()
}).passthrough();
const lockfileSchema = z.object({
  packages: z.record(z.string(), lockfileEntrySchema).optional()
}).passthrough();
type LockfilePackages = Record<string, z.infer<typeof lockfileEntrySchema>>;

/** Ledger filename inside the install root. Not an npm artifact — host state. */
const LEDGER_FILE = "nodetool-packs.json";

function assertValidSpec(spec: string): void {
  if (typeof spec !== "string" || !SPEC_RE.test(spec)) {
    throw new Error(`Invalid npm pack spec: ${String(spec)}`);
  }
}

function assertValidName(name: string): void {
  if (typeof name !== "string" || !NAME_RE.test(name)) {
    throw new Error(`Invalid npm pack name: ${String(name)}`);
  }
}

async function ensureInstallRoot(): Promise<void> {
  const root = getNodePackInstallRoot();
  await fsp.mkdir(root, { recursive: true });
  const pkgJson = path.join(root, "package.json");
  try {
    await fsp.access(pkgJson);
  } catch {
    await fsp.writeFile(
      pkgJson,
      JSON.stringify({ private: true, type: "module" }, null, 2),
      "utf8"
    );
  }
}

async function runNpm(args: string[]): Promise<void> {
  const npm = resolveNpmInvocation();
  if (!npm) {
    throw new Error(
      "npm not found. Reinstall the NodeTool environment to restore the bundled Node.js/npm runtime."
    );
  }
  await ensureInstallRoot();
  await fsp.mkdir(npmCacheDir(), { recursive: true });
  const fullArgs = [
    ...npm.baseArgs,
    ...args,
    "--prefix",
    getNodePackInstallRoot(),
    "--cache",
    npmCacheDir()
  ];
  logMessage(`Running: ${npm.command} ${fullArgs.join(" ")}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npm.command, fullArgs, {
      env: getProcessEnv(),
      stdio: "pipe",
      windowsHide: true
    });
    let stderr = "";
    child.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split(/\r?\n/)) {
        if (line.trim()) logMessage(line.trim());
      }
    });
    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      for (const line of data.toString().split(/\r?\n/)) {
        if (line.trim()) logMessage(line.trim(), "warn");
      }
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm exited with code ${code}: ${stderr.trim()}`));
    });
    child.on("error", reject);
  });
}

/** Install a node pack by npm spec, e.g. `@acme/cool-nodes` or `cool-nodes@1.2.3`. */
export async function installNodePack(
  spec: string
): Promise<NodePackActionResult> {
  try {
    assertValidSpec(spec);
    await runNpm(["install", "--ignore-scripts", spec]);
    const name = packageNameFromSpec(spec);
    const record = await classifyInstalledNodePack(name);
    await writeLedgerRecord(record);
    if (record.mode === "sandbox-only" || record.mode === "hybrid") {
      await compileSandboxModules(name);
    }
    const installation = nodePackInstallStatus(record);
    if (record.mode === "unknown") {
      return {
        success: false,
        message: `Installed ${spec} with lifecycle scripts disabled, but its manifest is not a supported NodeTool pack.`,
        installation
      };
    }
    if (!record.active) {
      return {
        success: false,
        message: `Installed ${spec} with lifecycle scripts disabled. It stays inactive until you approve trust, which verifies the recorded artifact integrity and then runs the pack's lifecycle scripts.`,
        installation
      };
    }
    return {
      success: true,
      message: `Installed ${spec} with lifecycle scripts disabled. Its sandbox modules are cataloged after the server restarts.`,
      installation
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`installNodePack failed for ${spec}: ${message}`, "warn");
    return { success: false, message };
  }
}

/**
 * Approve a register or hybrid pack and run its lifecycle scripts against the
 * artifact already on disk.
 *
 * The recorded lockfile identity of the pack and of every package its scripts
 * would run for is verified first, so an artifact swapped between install and
 * approval never reaches a script-enabled npm run. A version number alone is
 * not identity: `resolved` and `integrity` are compared too.
 */
export async function trustNodePack(name: string): Promise<NodePackActionResult> {
  try {
    assertValidName(name);
    const ledger = await readLedger();
    const recorded = ledger.packs[name];
    if (recorded === undefined) {
      return { success: false, message: `${name} was not installed by NodeTool, so there is no recorded artifact to verify.` };
    }
    if (recorded.mode === "unknown") {
      return {
        success: false,
        message: `${name} does not declare a supported NodeTool manifest. Trust cannot be granted to an unknown pack.`,
        installation: nodePackInstallStatus(recorded)
      };
    }
    if (recorded.mode === "sandbox-only") {
      return {
        success: false,
        message: `${name} is sandbox-only. It runs no host code and needs no lifecycle scripts.`,
        installation: nodePackInstallStatus(recorded)
      };
    }

    const current = await classifyInstalledNodePack(name);
    if (current.mode !== recorded.mode) {
      return {
        success: false,
        message: `${name} changed from ${recorded.mode} to ${current.mode} since it was installed. Reinstall it before approving trust.`,
        installation: nodePackInstallStatus(current)
      };
    }
    const drift = artifactDrift(recorded, current);
    if (drift !== undefined) {
      return {
        success: false,
        message: `${name} is not the artifact that was installed: ${drift}. Reinstall it before approving trust.`,
        installation: nodePackInstallStatus(current)
      };
    }

    const rebuildTargets = [name, ...(current.dependencies ?? []).map((entry) => entry.name)];
    await runNpm(["rebuild", ...rebuildTargets]);

    const approved: NodePackInstallRecord = {
      ...current,
      scripts: "ran",
      active: true,
      trustedAt: new Date().toISOString()
    };
    await writeLedgerRecord(approved);
    return {
      success: true,
      message: `Approved ${name} and ran lifecycle scripts for it and ${rebuildTargets.length - 1} dependenc${rebuildTargets.length === 2 ? "y" : "ies"}. Add it to the pack allowlist in Settings → Packages, then restart the server to load it.`,
      installation: nodePackInstallStatus(approved)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`trustNodePack failed for ${name}: ${message}`, "warn");
    return { success: false, message };
  }
}

/**
 * Warm the compiled-module cache for a pack that just landed.
 *
 * Install is the one moment the pack's dependencies are known to be on disk and
 * the process is already async, so it is where bundling, scanning and probing
 * belong — the server then finds the cache warm instead of compiling during
 * bootstrap. Every outcome is logged and none of them fails the install: an npm
 * module that does not compile is a skip the Package Manager shows, and a
 * compiler that cannot even load leaves the module `pending-compile`.
 */
async function compileSandboxModules(name: string): Promise<void> {
  const packageDir = packageDirectory(name);
  try {
    const { compileDiscoveries } = await import("@nodetool-ai/sandbox-compiler");
    const discovery = discoverSandboxPack(packageDir);
    if (discovery === undefined) return;
    const reports = await compileDiscoveries([discovery]);
    for (const report of reports) {
      logMessage(
        report.outcome.status === "compiled"
          ? `Compiled sandbox module ${report.specifier} from ${report.npmName}.`
          : `Skipped sandbox module ${report.specifier}: ${report.outcome.message}`,
        report.outcome.status === "compiled" ? "info" : "warn"
      );
    }
  } catch (error) {
    logMessage(
      `Could not compile sandbox modules for ${name}: ${error instanceof Error ? error.message : String(error)}`,
      "warn"
    );
  }
}

async function classifyInstalledNodePack(name: string): Promise<NodePackInstallRecord> {
  const packageDir = packageDirectory(name);
  const lockfile = await readLockfilePackages();
  const artifact = artifactIdentity(name, lockfile);
  const dependencies = dependencyClosure(name, lockfile);
  const base = {
    name,
    scripts: "skipped" as const,
    ...(artifact === undefined ? {} : { artifact }),
    ...(dependencies.length === 0 ? {} : { dependencies }),
    installedAt: new Date().toISOString()
  };
  const unknown = (reason?: unknown): NodePackInstallRecord => ({
    ...base,
    mode: "unknown",
    active: false,
    ...(reason instanceof Error ? { reason: reason.message } : {})
  });

  let rawPackage: string;
  try {
    rawPackage = await fsp.readFile(path.join(packageDir, "package.json"), "utf8");
  } catch {
    // A missing installed manifest is classified as untrusted rather than retried.
    return unknown();
  }
  const parsedPackage = installedPackageSchema.safeParse(parseJson(rawPackage));
  if (!parsedPackage.success || parsedPackage.data.name !== name) {
    return unknown();
  }
  const rawManifest = parsedPackage.data.nodetool;
  const manifest = NodePackHostManifestSchema.safeParse(rawManifest);
  if (!manifest.success || !isRecord(rawManifest)) {
    return unknown();
  }
  const hasSandboxModules = Object.hasOwn(rawManifest, "sandboxModules");
  const hasRegister = Object.hasOwn(rawManifest, "register");
  const hasHostDeclaration = hasRegister || Object.hasOwn(rawManifest, "apiVersion");
  if (hasSandboxModules) {
    try {
      if (discoverSandboxPack(packageDir) === undefined) return unknown();
    } catch (error) {
      return unknown(error);
    }
  }
  if (!hasSandboxModules && !hasHostDeclaration) {
    return unknown();
  }
  const mode: NodePackInstallMode = hasSandboxModules
    ? hasRegister ? "hybrid" : "sandbox-only"
    : "register";
  return { ...base, mode, active: mode === "sandbox-only" };
}

/** Describe the first identity field that moved, or undefined when nothing did. */
function artifactDrift(
  recorded: NodePackInstallRecord,
  current: NodePackInstallRecord
): string | undefined {
  const recordedAll = [
    ...(recorded.artifact === undefined ? [] : [recorded.artifact]),
    ...(recorded.dependencies ?? [])
  ];
  if (recordedAll.length === 0) {
    return "no lockfile identity was recorded at install time";
  }
  const currentAll = new Map(
    [
      ...(current.artifact === undefined ? [] : [current.artifact]),
      ...(current.dependencies ?? [])
    ].map((entry) => [entry.name, entry])
  );
  for (const entry of recordedAll) {
    const now = currentAll.get(entry.name);
    if (now === undefined) return `${entry.name} is no longer in the lockfile`;
    for (const field of ["version", "resolved", "integrity"] as const) {
      if (entry[field] !== now[field]) {
        return `${entry.name} ${field} changed from ${entry[field] ?? "none"} to ${now[field] ?? "none"}`;
      }
    }
  }
  return undefined;
}

function packageNameFromSpec(spec: string): string {
  const versionIndex = spec.startsWith("@")
    ? spec.indexOf("@", spec.indexOf("/") + 1)
    : spec.indexOf("@");
  return versionIndex < 0 ? spec : spec.slice(0, versionIndex);
}

function packageDirectory(name: string): string {
  return path.join(nodeModulesDir(), ...name.split("/"));
}

async function readLockfilePackages(): Promise<LockfilePackages> {
  try {
    const rawLockfile = await fsp.readFile(path.join(getNodePackInstallRoot(), "package-lock.json"), "utf8");
    const lockfile = lockfileSchema.safeParse(parseJson(rawLockfile));
    return lockfile.success ? lockfile.data.packages ?? {} : {};
  } catch {
    // The lockfile may not exist after a failed or interrupted npm install.
    return {};
  }
}

function artifactIdentity(
  name: string,
  packages: LockfilePackages,
  lockPath = `node_modules/${name}`
): NodePackArtifactIdentity | undefined {
  const entry = packages[lockPath];
  if (entry === undefined) return undefined;
  return {
    name,
    ...(entry.version === undefined ? {} : { version: entry.version }),
    ...(entry.resolved === undefined ? {} : { resolved: entry.resolved }),
    ...(entry.integrity === undefined ? {} : { integrity: entry.integrity })
  };
}

/**
 * Every package whose lifecycle scripts run when the pack is rebuilt: its
 * transitive runtime and optional dependencies, resolved the way npm resolves
 * them — nested `node_modules` first, then each parent up to the install root.
 */
function dependencyClosure(
  name: string,
  packages: LockfilePackages
): NodePackArtifactIdentity[] {
  const rootPath = `node_modules/${name}`;
  if (packages[rootPath] === undefined) return [];
  const seen = new Set<string>([rootPath]);
  const found = new Map<string, NodePackArtifactIdentity>();
  const pending = [rootPath];
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index];
    if (current === undefined) continue;
    const entry = packages[current];
    if (entry === undefined) continue;
    const deps = { ...entry.dependencies, ...entry.optionalDependencies };
    for (const dep of Object.keys(deps)) {
      const resolved = resolveLockPath(current, dep, packages);
      if (resolved === undefined || seen.has(resolved)) continue;
      seen.add(resolved);
      pending.push(resolved);
      const identity = artifactIdentity(dep, packages, resolved);
      if (identity !== undefined && !found.has(dep)) found.set(dep, identity);
    }
  }
  return [...found.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** Walk `<from>/node_modules/<dep>` outward, mirroring Node's resolution order. */
function resolveLockPath(
  from: string,
  dep: string,
  packages: LockfilePackages
): string | undefined {
  const segments = from.split("/");
  for (let depth = segments.length; depth >= 0; depth -= 1) {
    const prefix = segments.slice(0, depth).join("/");
    const candidate = prefix === "" ? `node_modules/${dep}` : `${prefix}/node_modules/${dep}`;
    if (packages[candidate] !== undefined) return candidate;
  }
  return undefined;
}

function ledgerPath(): string {
  return path.join(getNodePackInstallRoot(), LEDGER_FILE);
}

async function readLedger(): Promise<NodePackLedger> {
  try {
    const raw = await fsp.readFile(ledgerPath(), "utf8");
    const parsed = NodePackLedgerSchema.safeParse(parseJson(raw));
    if (parsed.success) return parsed.data;
  } catch {
    // No ledger yet, or one written by an incompatible version.
  }
  return { version: 1, packs: {} };
}

async function writeLedgerRecord(record: NodePackInstallRecord): Promise<void> {
  const ledger = await readLedger();
  const next: NodePackLedger = {
    version: 1,
    packs: { ...ledger.packs, [record.name]: record }
  };
  await writeLedger(next);
}

async function writeLedger(ledger: NodePackLedger): Promise<void> {
  await ensureInstallRoot();
  const target = ledgerPath();
  const temp = `${target}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await fsp.rename(temp, target);
}

/** A JSON value decoded from an on-disk manifest, lockfile or ledger. */
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function parseJson(value: string): JsonValue | undefined {
  try {
    return JSON.parse(value);
  } catch {
    // Invalid package metadata is classified as unknown rather than trusted.
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Uninstall a node pack by package name. */
export async function uninstallNodePack(
  name: string
): Promise<NodePackActionResult> {
  try {
    assertValidName(name);
    await runNpm(["uninstall", name]);
    const ledger = await readLedger();
    if (ledger.packs[name] !== undefined) {
      const { [name]: _removed, ...rest } = ledger.packs;
      await writeLedger({ version: 1, packs: rest });
    }
    return {
      success: true,
      message: `Uninstalled ${name}. Restart the server to apply.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`uninstallNodePack failed for ${name}: ${message}`, "warn");
    return { success: false, message };
  }
}

/**
 * Scan the install root and return every package whose `package.json` has a
 * `nodetool` field, with the install mode the ledger recorded for it.
 */
export async function listInstalledNodePacks(): Promise<NodePackInfo[]> {
  const root = nodeModulesDir();
  const ledger = await readLedger();
  const results: NodePackInfo[] = [];
  let topLevel: string[];
  try {
    topLevel = await fsp.readdir(root);
  } catch {
    return [];
  }
  const candidates: string[] = [];
  for (const entry of topLevel) {
    if (entry === ".bin" || entry === ".cache") continue;
    const full = path.join(root, entry);
    if (entry.startsWith("@")) {
      let scoped: string[];
      try {
        scoped = await fsp.readdir(full);
      } catch {
        continue;
      }
      for (const sub of scoped) candidates.push(path.join(full, sub));
    } else {
      candidates.push(full);
    }
  }
  for (const dir of candidates) {
    try {
      const raw = await fsp.readFile(path.join(dir, "package.json"), "utf8");
      const parsed = JSON.parse(raw) as {
        name?: string;
        version?: string;
        nodetool?: unknown;
      };
      if (parsed.nodetool && parsed.name) {
        const info: NodePackInfo = { name: parsed.name };
        if (parsed.version !== undefined) info.version = parsed.version;
        const record = ledger.packs[parsed.name];
        if (record !== undefined) info.installation = nodePackInstallStatus(record);
        results.push(info);
      }
    } catch {
      // not a valid package — skip
    }
  }
  return results;
}
