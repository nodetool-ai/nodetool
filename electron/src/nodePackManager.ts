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

import { logMessage } from "./logger";
import { getProcessEnv, resolveNpmInvocation } from "./config";
import type { NodePackActionResult, NodePackInfo } from "./types";

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
    await runNpm(["install", spec]);
    return {
      success: true,
      message: `Installed ${spec}. Restart the server to load it.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logMessage(`installNodePack failed for ${spec}: ${message}`, "warn");
    return { success: false, message };
  }
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
