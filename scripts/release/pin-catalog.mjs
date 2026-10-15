#!/usr/bin/env node
/** Pin original release artifacts and their measured Linux production trees. */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { cleanEnv, pack as packPackages } from "../smoke-packed-cli.mjs";
import { canonicalJson } from "../node-catalog/generate.mjs";
import { runReleaseCommand } from "./commands.mjs";
import { collectReleaseInstallPins, validateInstallPin } from "./install-pins.mjs";
export { runReleaseCommand } from "./commands.mjs";

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

/** Keep measurement-only core archives separate from the final release artifacts. */
export async function withMeasurementTarballs(tarballs, workspaces, measure, {
  temporaryRoot = tmpdir(),
  pack = packPackages
} = {}) {
  const directory = mkdtempSync(join(temporaryRoot, "nodetool-measurement-tarballs-"));
  try {
    // npm's folder overrides misresolve prerelease dependencies of tarballs.
    const core = workspaces.filter(workspace => !tarballs[workspace.name]);
    const measurement = await pack(core, directory);
    return await measure({ ...tarballs, ...measurement });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function measurementManifest(pack, tarballs, workspaces) {
  const file = tarballs[pack.npm.name];
  if (!file) { throw new Error(`Missing release tarball for ${pack.npm.name}`); }
  const dependencies = { [pack.npm.name]: `file:${file}` };
  for (const name of pack.provides) {
    if (!tarballs[name]) { throw new Error(`Missing release companion tarball for ${name}`); }
    dependencies[name] = `file:${tarballs[name]}`;
  }
  const overrides = {};
  for (const workspace of workspaces) {
    if (workspace.name === pack.npm.name) { continue; }
    if (!tarballs[workspace.name]) { throw new Error(`Missing measurement tarball for ${workspace.name}`); }
    overrides[workspace.name] = `file:${tarballs[workspace.name]}`;
  }
  return {
    name: "nodetool-release-pack-measurement",
    private: true,
    dependencies,
    overrides
  };
}

/** Total allocated disk bytes, including the pack's production dependencies. */
export function measureProductionInstallBytes(id, manifest, {
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
    writeFileSync(join(work, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const installArgs = ["install", "--install-links", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund"];
    if (cacheDir) { installArgs.push("--cache", cacheDir); }
    run("npm", installArgs, { cwd: work, env });
    const usage = run("du", ["-sk", "node_modules"], { cwd: work, env }).trim();
    const match = /^(\d+)\s+node_modules$/.exec(usage);
    if (!match) { throw new Error(`Invalid install size for ${id}: ${usage}`); }
    const bytes = Number(match[1]) * 1024;
    if (!Number.isSafeInteger(bytes) || bytes <= 0) { throw new Error(`Invalid install size for ${id}: ${usage}`); }
    return bytes;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

export function measurePackInstallBytes(pack, tarballs, workspaces, options) {
  return measureProductionInstallBytes(pack.id, measurementManifest(pack, tarballs, workspaces), options);
}

/** Each runtime estimate includes its own production dependency tree. */
export function measureRuntimeInstallBytes(pin, options) {
  validateInstallPin(pin);
  const folder = pin.installName ?? pin.name;
  const spec = folder === pin.name ? pin.version : `npm:${pin.name}@${pin.version}`;
  return measureProductionInstallBytes(folder, {
    name: "nodetool-release-runtime-measurement", private: true,
    dependencies: { [folder]: spec }
  }, options);
}

/** Validate every packed package before recording any release pin. */
export async function pinCatalog(catalog, tarballs, {
  workspaces = [],
  additionalPins = [],
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
  const installPins = new Map();
  for (const pack of catalog.packs) {
    for (const name of pack.provides) {
      installPins.set(name, { name, version: catalog.coreVersion, integrity: tarballIntegrity(tarballs[name]) });
    }
  }
  for (const pin of additionalPins) {
    validateInstallPin(pin);
    const folder = pin.installName ?? pin.name;
    if (names.has(folder) || installPins.has(folder)) { throw new Error(`Duplicate release install pin: ${folder}`); }
    installPins.set(folder, structuredClone(pin));
  }
  pinned.installPins = [...installPins.values()].sort((a, b) => (a.installName ?? a.name).localeCompare(b.installName ?? b.name));
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

/** Production release pinning also records the exact runtime and shared-library identities. */
export async function writeReleasePinnedCatalog(file, tarballs, {
  root, measureRuntime = pin => measureRuntimeInstallBytes(pin, options.measurementOptions), ...options
}) {
  const additionalPins = await collectReleaseInstallPins({ root });
  for (const pin of additionalPins) {
    if (!pin.shared) {
      pin.installBytes = await measureRuntime(pin);
      if (!Number.isSafeInteger(pin.installBytes) || pin.installBytes <= 0) {
        throw new Error(`Missing runtime installBytes for ${pin.name}`);
      }
      validateInstallPin(pin);
    }
  }
  return withMeasurementTarballs(tarballs, options.workspaces ?? [], measurement =>
    writePinnedCatalog(file, tarballs, {
      ...options,
      additionalPins,
      measure: options.measure ?? (pack => measurePackInstallBytes(pack, measurement, options.workspaces ?? [], options.measurementOptions))
    }));
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
  await writeReleasePinnedCatalog(resolve(values.catalog), tarballs, { root: resolve(import.meta.dirname, "../.."), workspaces, measurementOptions });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
