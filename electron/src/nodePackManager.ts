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
import { discoverSandboxPack } from "@nodetool-ai/node-sdk";
import { z } from "zod";

import { logMessage } from "./logger";
import { getProcessEnv, resolveNpmInvocation } from "./config";
import type {
  NodePackActionResult,
  NodePackInfo,
  NodePackInstallMode,
  NodePackInstallStatus
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
const nodetoolManifestSchema = z.object({
  apiVersion: z.number().optional(),
  register: z.string().optional(),
  sandboxModules: z.unknown().optional()
}).passthrough();
const lockfileEntrySchema = z.object({
  version: z.string().min(1).optional(),
  resolved: z.string().min(1).optional(),
  integrity: z.string().min(1).optional()
}).passthrough();
const lockfileSchema = z.object({
  packages: z.record(z.string(), lockfileEntrySchema).optional()
}).passthrough();

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
    const installation = await classifyInstalledNodePack(spec);
    if (installation.mode !== "sandbox-only") {
      await runNpm(["uninstall", "--ignore-scripts", packageNameFromSpec(spec)]);
      return {
        success: false,
        message: installation.mode === "unknown"
          ? `Removed ${spec}: its installed manifest is not a supported sandbox-only NodeTool pack.`
          : `Removed ${spec}: trusted host-pack rebuild is not available yet.`,
        installation
      };
    }
    return {
      success: true,
      message: `Installed ${spec} with lifecycle scripts disabled. It will be cataloged when sandbox-package host integration is enabled.`,
      installation
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`installNodePack failed for ${spec}: ${message}`, "warn");
    return { success: false, message };
  }
}

async function classifyInstalledNodePack(spec: string): Promise<NodePackInstallStatus> {
  const name = packageNameFromSpec(spec);
  const packageDir = packageDirectory(name);
  const artifact = await readArtifactIdentity(name);
  let rawPackage: string;
  try {
    rawPackage = await fsp.readFile(path.join(packageDir, "package.json"), "utf8");
  } catch {
    return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
  }
  const parsedPackage = installedPackageSchema.safeParse(parseJson(rawPackage));
  if (!parsedPackage.success || parsedPackage.data.name !== name) {
    return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
  }
  const rawManifest = parsedPackage.data.nodetool;
  const manifest = nodetoolManifestSchema.safeParse(rawManifest);
  if (!manifest.success || !isRecord(rawManifest)) {
    return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
  }
  const hasSandboxModules = Object.hasOwn(rawManifest, "sandboxModules");
  const hasRegister = Object.hasOwn(rawManifest, "register");
  const hasHostDeclaration = hasRegister || Object.hasOwn(rawManifest, "apiVersion");
  if (hasSandboxModules) {
    try {
      if (discoverSandboxPack(packageDir) === undefined) {
        return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
      }
    } catch {
      return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
    }
  }
  if (!hasSandboxModules && !hasHostDeclaration) {
    return { mode: "unknown", scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
  }
  const mode: NodePackInstallMode = hasSandboxModules
    ? hasRegister ? "hybrid" : "sandbox-only"
    : "register";
  return { mode, scripts: "skipped", ...(artifact === undefined ? {} : { artifact }) };
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

async function readArtifactIdentity(name: string): Promise<NodePackInstallStatus["artifact"]> {
  try {
    const rawLockfile = await fsp.readFile(path.join(getNodePackInstallRoot(), "package-lock.json"), "utf8");
    const lockfile = lockfileSchema.safeParse(parseJson(rawLockfile));
    const entry = lockfile.success
      ? lockfile.data.packages?.[`node_modules/${name}`]
      : undefined;
    return {
      name,
      ...(entry?.version === undefined ? {} : { version: entry.version }),
      ...(entry?.resolved === undefined ? {} : { resolved: entry.resolved }),
      ...(entry?.integrity === undefined ? {} : { integrity: entry.integrity })
    };
  } catch {
    return { name };
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
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
 * `nodetool` field.
 */
export async function listInstalledNodePacks(): Promise<NodePackInfo[]> {
  const root = nodeModulesDir();
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
        results.push(info);
      }
    } catch {
      // not a valid package — skip
    }
  }
  return results;
}
