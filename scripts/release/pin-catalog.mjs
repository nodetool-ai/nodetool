#!/usr/bin/env node
/** Pin original release artifacts and their measured Linux production trees. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cleanEnv } from "../smoke-packed-cli.mjs";
import { canonicalJson } from "../node-catalog/generate.mjs";

export function runReleaseCommand(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout;
}

export function tarballIntegrity(file) {
  return `sha512-${createHash("sha512").update(readFileSync(file)).digest("base64")}`;
}

/** Includes the core registrar packages and companions carried by a catalog pack. */
export function catalogPackageNames(catalog) {
  if (!Array.isArray(catalog.packs) || catalog.packs.length === 0) {
    throw new Error("Catalog pinning requires at least one pack");
  }
  const names = new Set();
  for (const pack of catalog.packs) {
    if (names.has(pack.npm.name)) { throw new Error(`Duplicate catalog package ${pack.npm.name}`); }
    names.add(pack.npm.name);
    for (const name of pack.provides) {
      if (names.has(name)) { throw new Error(`Duplicate catalog package ${name}`); }
      names.add(name);
    }
  }
  return names;
}

/** Local folder overrides are measurement inputs, never final core artifacts. */
export function measurementManifest(pack, tarballs, workspaces) {
  const file = tarballs[pack.npm.name];
  if (!file) { throw new Error(`Missing release tarball for ${pack.npm.name}`); }
  const overrides = {};
  for (const workspace of workspaces) {
    if (workspace.name === pack.npm.name) { continue; }
    overrides[workspace.name] = `file:${tarballs[workspace.name] ?? workspace.dir}`;
  }
  return {
    name: "nodetool-release-pack-measurement",
    private: true,
    dependencies: { [pack.npm.name]: `file:${file}` },
    overrides
  };
}

/** Total allocated disk bytes, including the pack's production dependencies. */
export function measurePackInstallBytes(pack, tarballs, workspaces, {
  platform = process.platform,
  arch = process.arch,
  run = runReleaseCommand,
  temporaryRoot = tmpdir(),
  cacheDir
} = {}) {
  if (platform !== "linux" || arch !== "x64") {
    throw new Error("Release installBytes must be measured on linux-x64");
  }
  const work = mkdtempSync(join(temporaryRoot, "nodetool-pack-measure-"));
  try {
    const home = join(work, "home");
    mkdirSync(home);
    const env = cleanEnv(home);
    writeFileSync(join(work, "package.json"), `${JSON.stringify(measurementManifest(pack, tarballs, workspaces), null, 2)}\n`);
    const installArgs = ["install", "--install-links", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"];
    if (cacheDir) { installArgs.push("--cache", cacheDir); }
    run("npm", installArgs, { cwd: work, env });
    const usage = run("du", ["-sk", "node_modules"], { cwd: work, env }).trim();
    const match = /^(\d+)\s+node_modules$/.exec(usage);
    if (!match) { throw new Error(`Invalid install size for ${pack.id}: ${usage}`); }
    const bytes = Number(match[1]) * 1024;
    if (!Number.isSafeInteger(bytes) || bytes <= 0) { throw new Error(`Invalid install size for ${pack.id}: ${usage}`); }
    return bytes;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Validate every packed package before recording any release pin. */
export async function pinCatalog(catalog, tarballs, {
  workspaces = [],
  measurementOptions = {},
  measure = (pack) => measurePackInstallBytes(pack, tarballs, workspaces, measurementOptions),
  readManifest = (file) => JSON.parse(runReleaseCommand("tar", ["-xOf", file, "package/package.json"], {}))
} = {}) {
  const names = catalogPackageNames(catalog);
  for (const pack of catalog.packs) {
    if (pack.npm.version !== catalog.coreVersion) {
      throw new Error(`Catalog package ${pack.npm.name}@${pack.npm.version} differs from core ${catalog.coreVersion}`);
    }
  }
  for (const name of names) {
    const file = tarballs[name];
    if (!file) { throw new Error(`Missing release tarball for ${name}`); }
    const manifest = await readManifest(file);
    if (manifest.name !== name || manifest.version !== catalog.coreVersion) {
      throw new Error(`Release tarball ${file} is ${manifest.name}@${manifest.version}, expected ${name}@${catalog.coreVersion}`);
    }
  }
  const pinned = structuredClone(catalog);
  for (const pack of pinned.packs) {
    const installBytes = await measure(pack);
    if (!Number.isSafeInteger(installBytes) || installBytes <= 0) {
      throw new Error(`Invalid installBytes for ${pack.id}: ${installBytes}`);
    }
    pack.npm.integrity = tarballIntegrity(tarballs[pack.npm.name]);
    pack.installBytes = installBytes;
  }
  return canonicalJson(pinned);
}

export async function writePinnedCatalog(file, tarballs, options) {
  const catalog = JSON.parse(readFileSync(file, "utf8"));
  const pinned = await pinCatalog(catalog, tarballs, options);
  writeFileSync(file, `${JSON.stringify(pinned, null, 2)}\n`);
  return pinned;
}

async function main() {
  const { values } = parseArgs({ options: {
    catalog: { type: "string" },
    tarballs: { type: "string" },
    workspaces: { type: "string" },
    cache: { type: "string" }
  } });
  if (!values.catalog || !values.tarballs || !values.workspaces) {
    throw new Error("Usage: pin-catalog.mjs --catalog <index.json> --tarballs <name-to-file.json> --workspaces <packages.json>");
  }
  const tarballs = JSON.parse(readFileSync(resolve(values.tarballs), "utf8"));
  const workspaces = JSON.parse(readFileSync(resolve(values.workspaces), "utf8"));
  const measurementOptions = {};
  if (values.cache) { measurementOptions.cacheDir = resolve(values.cache); }
  await writePinnedCatalog(resolve(values.catalog), tarballs, { workspaces, measurementOptions });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
