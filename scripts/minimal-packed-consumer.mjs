import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, lstatSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectMinimalTree, installedPackageDirectories } from "./minimal-dependency-guard.mjs";
import { startPackedRegistry } from "./packed-registry.mjs";

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

export async function packedConsumer(packageName, output, { guard = true, baselineReport, features = [], installPacks = [] } = {}) {
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
    selected.set(name, workspace);
    for (const dependency of Object.keys({ ...workspace.manifest.dependencies, ...workspace.manifest.optionalDependencies, ...workspace.manifest.peerDependencies })) {
      if (workspaces.has(dependency)) { visit(dependency); }
    }
  }
  visit(packageName);
  for (const feature of features) { visit(feature); }
  const initialPackages = new Set(selected.keys());
  for (const id of installPacks) { visit(`@nodetool-ai/${id}`); }
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
      registry = await startPackedRegistry(Object.fromEntries(registryFixtures.map(fixture => [fixture.manifest.name, fixture.tarball])));
      registryAddress = registry.url;
    }
    if (guard) {
      const smokePath = join(consumer, "packed-smoke.mjs");
      const smokeScript = packageName === "@nodetool-ai/cli" ? "minimal-cli-packed-smoke.mjs" : "minimal-packed-smoke.mjs";
      writeFileSync(smokePath, readFileSync(join(root, "scripts", smokeScript), "utf8"));
      const smoke = spawnSync(process.execPath, [smokePath, packageName, ...features], { cwd: consumer, encoding: "utf8", timeout: installPacks.length ? 300000 : 120000, env: { ...process.env,
        ...(registryAddress ? { NODETOOL_PACK_FIXTURE_REGISTRY: registryAddress, NODETOOL_PACK_FIXTURE_MANIFEST: fixtureManifest, NODETOOL_PACK_FIXTURE_IDS: installPacks.join(",") } : {}) } });
      writeFileSync(join(output, "smoke.log"), `${smoke.stdout ?? ""}\n${smoke.stderr ?? ""}`);
      if (smoke.status !== 0) { throw new Error(`Packed runtime smoke failed (${smoke.status}):\n${smoke.stdout}\n${smoke.stderr}`); }
    }
  } finally { await registry?.close(); }
  const directories = installedPackageDirectories(consumer);
  const sandboxOnly = features.length === 1 && features[0] === "@nodetool-ai/server-feature-sandbox";
  const inspection = guard && (features.length === 0 || sandboxOnly) && installPacks.length === 0
    ? inspectMinimalTree(directories, { entryPackageName: packageName, ...(sandboxOnly ? { profile: "sandbox" } : {}) }) : null;
  const external = directories.filter((path) => !JSON.parse(readFileSync(join(path, "package.json"), "utf8")).name.startsWith("@nodetool-ai/"));
  const report = { packageName, platform: process.platform, arch: process.arch, nodeVersion: process.version, installScripts: true, consumer, logicalBytes: logicalBytes(join(consumer, "node_modules")), externalPackageInstances: external.length, workspacePackages: directories.length - external.length, packedWorkspaceArtifacts: selected.size, features, installPacks, inspection };
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
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(`${JSON.stringify(await packedConsumer(process.argv[2] ?? "@nodetool-ai/server-minimal", resolve(process.argv[3] ?? mkdtempSync(join(tmpdir(), "nodetool-minimal-"))), { guard: !process.argv.includes("--baseline"), installPacks: process.argv.flatMap((arg, index) => arg === "--install-pack" ? [process.argv[index + 1]] : []), features: process.argv.flatMap((arg, index) => arg === "--feature" ? [process.argv[index + 1]] : []), baselineReport: process.argv.includes("--baseline-report") ? process.argv[process.argv.indexOf("--baseline-report") + 1] : undefined }), null, 2)}\n`);
}
