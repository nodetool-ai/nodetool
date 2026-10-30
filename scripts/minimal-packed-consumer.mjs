import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, lstatSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMinimalTree, installedPackageDirectories, assertNoRemovedAggregate } from "./minimal-dependency-guard.mjs";
import { startPackedRegistry } from "./packed-registry.mjs";
import { CLI_FEATURE_PACKS, CATALOG_PACKS } from "./node-catalog/packs.mjs";
import { collectReleaseInstallPins } from "./release/install-pins.mjs";

let fixtureInstallPins;

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(args, cwd) {
  const result = spawnSync("npm", args, { cwd, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  if (result.status !== 0) { throw new Error(`npm ${args.join(" ")} failed (${result.status}):\n${result.stdout}\n${result.stderr}`); }
  return result.stdout;
}
export function logicalBytes(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) { return stat.size; }
  return readdirSync(path).reduce((sum, entry) => sum + logicalBytes(join(path, entry)), 0);
}

export async function packedConsumer(packageName, output, { guard = true, baselineReport, features = [], installPacks = [], exerciseRemoval = false } = {}) {
  mkdirSync(output, { recursive: true });
  const tarballs = join(output, "tarballs");
  const consumer = join(output, "consumer");
  mkdirSync(tarballs, { recursive: true });
  mkdirSync(consumer, { recursive: true });
  const workspacePaths = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).workspaces;
  const workspaces = new Map(workspacePaths.map((path) => {
    const manifest = JSON.parse(readFileSync(join(root, path, "package.json"), "utf8"));
    return [manifest.name, { path: join(root, path), manifest }];
  }));
  const selected = new Map();
  function visit(name) {
    if (selected.has(name)) { return; }
    const workspace = workspaces.get(name);
    if (!workspace) { throw new Error(`Unknown workspace ${name}`); }
    assertNoRemovedAggregate(workspace.manifest, workspace.path);
    selected.set(name, workspace);
    for (const dependency of Object.keys({ ...workspace.manifest.dependencies, ...workspace.manifest.optionalDependencies, ...workspace.manifest.peerDependencies })) {
      if (workspaces.has(dependency)) { visit(dependency); }
    }
  }
  visit(packageName);
  for (const feature of features) { visit(feature); }
  const initialPackages = new Set(selected.keys());
  for (const id of installPacks) {
    const pack = CATALOG_PACKS.find(pack => pack.id === id);
    if (!pack) { throw new Error(`Unknown catalog pack ${id}`); }
    visit(pack.npmName);
    for (const name of pack.provides) { visit(name); }
  }
  const registryFixtures = [];
  const dependencies = {};
  for (const [name, workspace] of selected) {
    const [result] = JSON.parse(run(["pack", "--json", "--pack-destination", tarballs], workspace.path));
    const tarball = join(tarballs, result.filename);
    if (initialPackages.has(name)) { dependencies[name] = `file:${tarball}`; }
    const bytes = readFileSync(tarball);
    registryFixtures.push({ manifest: workspace.manifest, tarball, integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`, shasum: createHash("sha1").update(bytes).digest("hex") });
  }
  writeFileSync(join(consumer, "package.json"), JSON.stringify({ name: "nodetool-packed-consumer", private: true, type: "module", dependencies }, null, 2));
  writeFileSync(join(output, "install.log"), run(["install", "--omit=dev", "--no-audit", "--no-fund", "--foreground-scripts"], consumer));
  let registry;
  let registryAddress;
  const fixtureManifest = join(output, "registry-fixtures.json");
  try {
    if (installPacks.length) {
      if (packageName !== "@nodetool-ai/cli") { throw new Error("Pack installation smoke requires the lean CLI root"); }
      writeFileSync(fixtureManifest, JSON.stringify(registryFixtures));
      fixtureInstallPins ??= collectReleaseInstallPins({ root });
      writeFileSync(join(output, "registry-fixture-pins.json"), JSON.stringify(await fixtureInstallPins));
      registry = await startPackedRegistry(Object.fromEntries(registryFixtures.map(fixture => [fixture.manifest.name, fixture.tarball])));
      registryAddress = registry.url;
    }
    if (guard) {
      const smokePath = join(consumer, "packed-smoke.mjs");
      const smokeScript = packageName === "@nodetool-ai/cli" ? "minimal-cli-packed-smoke.mjs" : "minimal-packed-smoke.mjs";
      writeFileSync(smokePath, readFileSync(join(root, "scripts", smokeScript), "utf8"));
      const smoke = spawnSync(process.execPath, [smokePath, packageName, ...features], { cwd: consumer, encoding: "utf8", timeout: installPacks.length ? 300000 : 120000, env: { ...process.env,
        ...(registryAddress ? { NODETOOL_PACK_FIXTURE_REGISTRY: registryAddress, NODETOOL_PACK_FIXTURE_MANIFEST: fixtureManifest, NODETOOL_PACK_FIXTURE_PINS: join(output, "registry-fixture-pins.json"), NODETOOL_PACK_FIXTURE_IDS: installPacks.join(",") } : {}) } });
      writeFileSync(join(output, "smoke.log"), `${smoke.stdout ?? ""}\n${smoke.stderr ?? ""}`);
      if (smoke.status !== 0) { throw new Error(`Packed runtime smoke failed (${smoke.status}):\n${smoke.stdout}\n${smoke.stderr}`); }
    }
  } finally { await registry?.close(); }
  const directories = installedPackageDirectories(consumer);
  const installedNames = directories.map(path => JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name);
  if (installedNames.includes("@nodetool-ai/cli-full")) { throw new Error("Removed cli-full aggregate was installed"); }
  for (const feature of CLI_FEATURE_PACKS) {
    if (installedNames.includes(feature.npmName) && !installPacks.includes(feature.id)) {
      throw new Error(`Unselected command feature was installed: ${feature.id}`);
    }
  }
  const sandboxOnly = features.length === 1 && features[0] === "@nodetool-ai/server-feature-sandbox";
  const inspection = guard && (features.length === 0 || sandboxOnly) && installPacks.length === 0
    ? inspectMinimalTree(directories, { entryPackageName: packageName, ...(sandboxOnly ? { profile: "sandbox" } : {}) }) : null;
  const external = directories.filter((path) => !JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name.startsWith("@nodetool-ai/"));
  const dependencyVersions = Object.fromEntries(["zod", "better-sqlite3", "openai"].map(name => [name, [...new Set(directories.map(path => JSON.parse(readFileSync(join(path, "package.json"), "utf8"))).filter(manifest => manifest.name === name).map(manifest => manifest.version))].sort()]));
  const report = { dependencyVersions, packageName, platform: process.platform, arch: process.arch, nodeVersion: process.version, installScripts: true, consumer, logicalBytes: logicalBytes(join(consumer, "node_modules")), externalPackageInstances: external.length, workspacePackages: directories.length - external.length, packedWorkspaceArtifacts: selected.size, features, installPacks, optionalPackInstallPolicy: installPacks.length ? "Canonical pack manager applies the catalog lifecycle allowlist" : null, inspection };
  if (guard && features.length === 0 && installPacks.length === 0) {
    const baseline = baselineReport ? JSON.parse(readFileSync(baselineReport, "utf8")) : null;
    report.proposedTargets = { maxLogicalBytes: 150 * 1024 * 1024, maxExternalPackageInstances: 250, minimumReductionPercent: 60 };
    report.outcomes = { logicalBytesWithinTarget: report.logicalBytes <= 150 * 1024 * 1024, externalInstancesWithinTarget: external.length <= 250 };
    if (baseline) {
      report.reductionPercent = 100 * (1 - report.logicalBytes / baseline.logicalBytes);
      report.outcomes.reductionWithinTarget = report.reductionPercent >= 60;
    }
  }
  writeFileSync(join(output, "measurement.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (exerciseRemoval && installPacks.length) {
    const protectedFiles = ["constant.json", "cli-data/nodetool.db"];
    const hashes = () => Object.fromEntries(protectedFiles.map(file => [file, createHash("sha256").update(readFileSync(join(consumer, file))).digest("hex")]));
    const before = JSON.stringify(hashes());
    const registry = await startPackedRegistry(Object.fromEntries(registryFixtures.map(fixture => [fixture.manifest.name, fixture.tarball])));
    try {
      const env = { ...process.env, NODE_OPTIONS: "", NODETOOL_API_URL: "", NODETOOL_DATA_DIR: join(consumer, "cli-data"), NODETOOL_USER_ID: "packed-cli-user", SECRETS_MASTER_KEY: "k".repeat(32), XDG_DATA_HOME: join(consumer, "xdg-data"), XDG_CONFIG_HOME: join(consumer, "xdg-config"), XDG_CACHE_HOME: join(consumer, "xdg-cache"), npm_config_registry: registry.url, npm_config_userconfig: join(consumer, "cli-fixture.npmrc") };
      let logs = "";
      const command = (args, expectedFailure = false) => {
        const result = spawnSync(process.execPath, [join(consumer, "node_modules/@nodetool-ai/cli/dist/nodetool.js"), ...args], { cwd: consumer, env, encoding: "utf8", timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
        logs += `$ nodetool ${args.join(" ")}\n${result.stdout ?? ""}${result.stderr ?? ""}\n`;
        writeFileSync(join(output, "removal.log"), logs);
        if (result.error || (expectedFailure ? result.status === 0 || result.status === null : result.status !== 0)) { throw new Error(`Command-feature removal smoke failed: ${logs}`); }
        return result.stdout + result.stderr;
      };
      command(["packs", "remove", ...installPacks]);
      command(["--help"]);
      if (!command(["run", "constant.json"]).includes("packed constant")) { throw new Error("Core execution failed after optional command removal"); }
      const rows = JSON.parse(command(["packs", "list", "--json"]));
      for (const id of installPacks) {
        if (!rows.some(row => row.id === id && row.installed === false)) { throw new Error(`Removed pack remains installed: ${id}`); }
        if (CLI_FEATURE_PACKS.some(pack => pack.id === id)) {
          const error = command(["feature", id, "--help"], true);
          if (!error.includes("FEATURE_NOT_INSTALLED") || !error.includes(id)) { throw new Error(`Removed command feature did not report availability: ${id}`); }
        }
      }
      if (JSON.stringify(hashes()) !== before) { throw new Error("Optional command removal changed workflow or encrypted secret data"); }
      const remaining = installedPackageDirectories(consumer);
      const inspection = inspectMinimalTree(remaining, { entryPackageName: packageName });
      const external = remaining.filter(path => !JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name.startsWith("@nodetool-ai/"));
      writeFileSync(join(output, "post-removal-measurement.json"), JSON.stringify({ removed: installPacks, logicalBytes: logicalBytes(join(consumer, "node_modules")), externalPackageInstances: external.length, inspection, userDataUnchanged: true, coreExecutionPassed: true }, null, 2) + "\n");
    } finally { await registry.close(); }
  }
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await packedConsumer(process.argv[2] ?? "@nodetool-ai/server-minimal", resolve(process.argv[3] ?? mkdtempSync(join(tmpdir(), "nodetool-minimal-"))), { guard: !process.argv.includes("--baseline"), exerciseRemoval: process.argv.includes("--exercise-removal"), installPacks: process.argv.flatMap((arg, index) => arg === "--install-pack" ? [process.argv[index + 1]] : []), features: process.argv.flatMap((arg, index) => arg === "--feature" ? [process.argv[index + 1]] : []), baselineReport: process.argv.includes("--baseline-report") ? process.argv[process.argv.indexOf("--baseline-report") + 1] : undefined }), null, 2)}\n`);
}
