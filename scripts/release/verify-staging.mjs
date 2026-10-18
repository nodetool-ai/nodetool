#!/usr/bin/env node
/** Check original release bytes and npm provenance before any final tag moves. */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { assertCoreOnlyInstall, assertCoreInstallSize, CORE_INSTALL_BUDGET_KIB, cleanEnv } from "../smoke-packed-cli.mjs";
import { runReleaseCommand, tarballIntegrity } from "./pin-catalog.mjs";
import { runFalFixture } from "../packed-fal-fixture.mjs";
import { validateInstallPin } from "./install-pins.mjs";
import { loadRegistryDist, loadRegistryJson, REGISTRY_READINESS_MS } from "./registry.mjs";

export const RELEASE_REPOSITORY = "https://github.com/nodetool-ai/nodetool";
export const RELEASE_WORKFLOW = ".github/workflows/publish.yaml";
const PROVENANCE_TYPE = "https://slsa.dev/provenance/v1";

export function releaseArtifacts(directory, run = runReleaseCommand) {
  const packages = [];
  const names = new Set();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".tgz")) { continue; }
    const file = join(directory, entry.name);
    const manifest = JSON.parse(run("tar", ["-xOf", file, "package/package.json"], {}));
    if (names.has(manifest.name)) { throw new Error(`Duplicate release artifact for ${manifest.name}`); }
    names.add(manifest.name);
    packages.push({ name: manifest.name, version: manifest.version, integrity: tarballIntegrity(file) });
  }
  if (packages.length === 0) { throw new Error("Staging verification inspected no release artifacts"); }
  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

export function stagingPins(catalog, artifacts) {
  if (!Array.isArray(catalog.packs) || catalog.packs.length === 0 || artifacts.length === 0) {
    throw new Error("Staging verification requires catalog pins and release artifacts");
  }
  const expected = new Map();
  for (const artifact of artifacts) {
    if (artifact.version !== catalog.coreVersion) { throw new Error(`${artifact.name} version differs from release ${catalog.coreVersion}`); }
    expected.set(`${artifact.name}@${artifact.version}`, { ...artifact, firstParty: true });
  }
  for (const pack of catalog.packs) {
    const key = `${pack.npm.name}@${pack.npm.version}`;
    const artifact = expected.get(key);
    if (!artifact || !pack.npm.integrity || artifact.integrity !== pack.npm.integrity) {
      throw new Error(`Catalog pin differs from original release artifact: ${key}`);
    }
    for (const name of pack.provides) {
      if (!expected.has(`${name}@${catalog.coreVersion}`)) { throw new Error(`Missing release companion ${name}`); }
    }
    for (const pin of pack.scriptAllowlist) {
      const spec = `${pin.name}@${pin.version}`;
      if (!pin.integrity) { throw new Error(`Missing integrity for ${spec}`); }
      const existing = expected.get(spec);
      if (existing && existing.integrity !== pin.integrity) { throw new Error(`Conflicting release pin for ${spec}`); }
      if (!existing) { expected.set(spec, { ...pin, firstParty: false }); }
    }
  }
  const folders = new Set();
  for (const pin of catalog.installPins ?? []) {
    validateInstallPin(pin);
    const folder = pin.installName ?? pin.name;
    if (folders.has(folder)) { throw new Error(`Duplicate release install pin: ${folder}`); }
    folders.add(folder);
    const spec = `${pin.name}@${pin.version}`;
    const artifact = expected.get(spec);
    if (pin.name.startsWith("@nodetool-ai/") && !artifact) { throw new Error(`Missing original release install artifact: ${spec}`); }
    if (artifact && artifact.integrity !== pin.integrity) { throw new Error(`Catalog install pin differs from original release artifact: ${spec}`); }
    if (!artifact) { expected.set(spec, { ...pin, firstParty: false }); }
  }
  for (const pack of catalog.packs) {
    for (const name of pack.provides) {
      if (!folders.has(name)) { throw new Error(`Missing catalog install pin for release companion ${name}`); }
    }
  }
  return [...expected.values()];
}

/** npm's SLSA v1 payload binds these exact bytes to this repository/workflow. */
export function hasReleaseProvenance(pin, response, originalRun) {
  const digest = Buffer.from(pin.integrity.slice("sha512-".length), "base64").toString("hex");
  const subject = `pkg:npm/${pin.name.replace(/^@/, "%40")}@${pin.version}`;
  if (!Array.isArray(response?.attestations)) { return false; }
  return response.attestations.some(attestation => {
    if (attestation.predicateType !== PROVENANCE_TYPE) { return false; }
    const envelope = attestation.bundle?.dsseEnvelope;
    if (!envelope?.payload || !Array.isArray(envelope.signatures) || !envelope.signatures.some(signature => signature.sig)) { return false; }
    let statement;
    try { statement = JSON.parse(Buffer.from(envelope.payload, "base64").toString("utf8")); }
    catch { return false; }
    const definition = statement.predicate?.buildDefinition;
    const workflow = definition?.externalParameters?.workflow;
    if (originalRun && (workflow?.ref !== originalRun.ref ||
        definition?.internalParameters?.github?.event_name !== originalRun.event ||
        !definition?.resolvedDependencies?.some(dependency =>
          dependency.uri === `git+${RELEASE_REPOSITORY}@${originalRun.ref}` && dependency.digest?.gitCommit === originalRun.sha) ||
        statement.predicate?.runDetails?.metadata?.invocationId !==
          `${RELEASE_REPOSITORY}/actions/runs/${originalRun.id}/attempts/${originalRun.attempt}`)) {
      return false;
    }
    return statement._type === "https://in-toto.io/Statement/v1" && statement.predicateType === PROVENANCE_TYPE &&
      workflow?.repository === RELEASE_REPOSITORY && workflow.path === RELEASE_WORKFLOW &&
      Array.isArray(statement.subject) && statement.subject.some(item => item.name === subject && item.digest?.sha512 === digest);
  });
}

/** Verify a fresh registry CLI through its authorized pack installer. */
export async function verifyRegistryInstall(catalog, { run = runReleaseCommand, temporaryRoot = tmpdir() } = {}) {
  const pack = catalog.packs.find(entry => entry.kind === "node-pack" && entry.id === "fal");
  if (!pack) { throw new Error("No node pack is available for the staging install smoke"); }
  const work = mkdtempSync(join(temporaryRoot, "nodetool-registry-staging-"));
  try {
    const app = join(work, "app");
    mkdirSync(app);
    const home = join(work, "home");
    mkdirSync(home);
    const env = cleanEnv(home);
    writeFileSync(join(app, "package.json"), JSON.stringify({ name: "nodetool-staging-smoke", private: true }));
    run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", `@nodetool-ai/cli@${catalog.coreVersion}`], { cwd: app, env });
    // Verify registry signatures before executing the newly installed CLI.
    run("npm", ["audit", "signatures"], { cwd: app, env });
    run("npm", ["rebuild", "better-sqlite3", "--ignore-scripts=false", "--no-audit", "--no-fund"], { cwd: app, env });
    const cli = join(app, "node_modules/.bin/nodetool");
    const version = run(cli, ["--version"], { cwd: app, env }).trim();
    if (version !== catalog.coreVersion) { throw new Error(`Staging CLI reports ${version}, expected ${catalog.coreVersion}`); }
    run(cli, ["packs", "add", pack.id, "--yes"], {
      cwd: app,
      env
    });
    // Verify the expanded tree before the independent registration smoke.
    run("npm", ["audit", "signatures"], { cwd: app, env });
    const code = `const { NodeRegistry } = await import('@nodetool-ai/node-sdk');
const { importPack } = await import('@nodetool-ai/node-catalog');
const module = await importPack(${JSON.stringify(pack.id)});
const registry = new NodeRegistry();
module[${JSON.stringify(pack.registrar)}](registry);
if (registry.list().length !== ${pack.nodeCount} || registry.list().length === 0) { throw new Error('Staging pack registration differs from the catalog'); }`;
    run(process.execPath, ["--input-type=module", "-e", code], { cwd: app, env });
    runFalFixture(join(app, "node_modules/@nodetool-ai/cli/dist/nodetool.js"), app, env, run);

    const prefix = join(work, "global");
    const globalHome = join(work, "global-home");
    const consumer = join(work, "global-consumer");
    mkdirSync(globalHome); mkdirSync(consumer);
    writeFileSync(join(globalHome, ".npmrc"), `prefix=${prefix}\nregistry=https://registry.npmjs.org\n`);
    const globalEnv = cleanEnv(globalHome);
    run("npm", ["install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund", `@nodetool-ai/cli@${catalog.coreVersion}`], { cwd: consumer, env: globalEnv });
    const globalRoot = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@nodetool-ai/cli");
    const audit = () => run("npm", ["audit", "signatures", "--global=false", "--prefix", globalRoot], { cwd: globalRoot, env: globalEnv });
    // loadActual audits the global package's dependencies without creating a lock.
    // The project audits above also cover the CLI and no-save FAL roots themselves.
    audit();
    run("npm", ["rebuild", "better-sqlite3", "--ignore-scripts=false", "--no-audit", "--no-fund", "--global=false", "--prefix", globalRoot], { cwd: globalRoot, env: globalEnv });
    assertCoreOnlyInstall(globalRoot);
    if (process.platform === "linux" && process.arch === "x64") {
      assertCoreInstallSize(run("du", ["-sk", "node_modules"], { cwd: process.platform === "win32" ? prefix : join(prefix, "lib"), env: globalEnv }), CORE_INSTALL_BUDGET_KIB);
    }
    const globalEntry = join(globalRoot, "dist/nodetool.js");
    const globalOptions = { cwd: consumer, env: globalEnv };
    if (run(process.execPath, [globalEntry, "--version"], globalOptions).trim() !== catalog.coreVersion) { throw new Error("Global staging CLI version differs"); }
    run(process.execPath, [globalEntry, "packs", "add", "fal", "--yes"], globalOptions);
    audit();
    run(process.execPath, [globalEntry, "packs", "doctor", "--installed", "--pack", "fal", "--json"], globalOptions);
    runFalFixture(globalEntry, consumer, globalEnv, run);
  } finally { rmSync(work, { recursive: true, force: true }); }
}

export async function verifyStaging(catalog, artifacts, {
  run = runReleaseCommand,
  loadDist = loadRegistryDist,
  loadAttestations = loadRegistryJson,
  smoke = () => verifyRegistryInstall(catalog, { run })
} = {}) {
  const pins = stagingPins(catalog, artifacts);
  const readiness = { deadline: Date.now() + REGISTRY_READINESS_MS };
  for (const pin of pins) {
    const spec = `${pin.name}@${pin.version}`;
    const dist = await loadDist(pin, readiness);
    if (dist.integrity !== pin.integrity) { throw new Error(`Registry integrity differs from release pin: ${spec}`); }
    if (pin.firstParty) {
      if (!dist.attestations?.url || dist.attestations.provenance?.predicateType !== PROVENANCE_TYPE ||
          !hasReleaseProvenance(pin, await loadAttestations(dist.attestations.url, readiness))) {
        throw new Error(`Missing matching ${RELEASE_REPOSITORY}/${RELEASE_WORKFLOW} provenance for ${spec}`);
      }
    }
  }
  await smoke();
  return pins;
}

export function releaseInputs(directory, catalogFile, run = runReleaseCommand) {
  return { catalog: JSON.parse(readFileSync(catalogFile, "utf8")), artifacts: releaseArtifacts(directory, run) };
}

async function main() {
  const { values } = parseArgs({ options: { "tarballs-dir": { type: "string" }, catalog: { type: "string", default: "packages/node-catalog/data/index.json" } } });
  if (!values["tarballs-dir"]) { throw new Error("--tarballs-dir is required"); }
  const { catalog, artifacts } = releaseInputs(resolve(values["tarballs-dir"]), resolve(values.catalog));
  const pins = await verifyStaging(catalog, artifacts);
  console.log(`Verified staging integrity/provenance for ${pins.length} packages and the registry install`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
