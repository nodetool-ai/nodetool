#!/usr/bin/env node
/** Restore a failed publication's immutable artifacts before ordinary promotion. */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { runReleaseCommand } from "./commands.mjs";
import { hasReleaseProvenance, RELEASE_REPOSITORY, RELEASE_WORKFLOW, stagingPins } from "./verify-staging.mjs";
import { loadRegistryDist, loadRegistryJson, loadRegistryResponse, REGISTRY_READINESS_MS } from "./registry.mjs";

const REPOSITORY = "nodetool-ai/nodetool";
const SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/;
const PACKAGE_NAME = /^@nodetool-ai\/[a-z0-9][a-z0-9._-]*$/;

export function originalPublication(run, jobs) {
  // A stable release starts from its v* tag push, a prerelease rehearsal from a dispatch.
  const tagPush = run.event === "push" && /^v\d+\.\d+\.\d+$/.test(run.head_branch ?? "");
  if (run.repository?.full_name !== REPOSITORY || run.path !== RELEASE_WORKFLOW ||
      (run.event !== "workflow_dispatch" && !tagPush) || run.status !== "completed" || run.conclusion !== "failure" ||
      !Number.isSafeInteger(run.id) || run.id <= 0 || !Number.isSafeInteger(run.run_attempt) || run.run_attempt <= 0 ||
      !/^[a-f0-9]{40}$/.test(run.head_sha) || !/^[A-Za-z0-9._/-]+$/.test(run.head_branch ?? "")) {
    throw new Error("Original run is not a failed NodeTool publication");
  }
  const publish = jobs.filter(job => job.name === "publish");
  if (publish.length !== 1 || publish[0].run_id !== run.id || publish[0].conclusion !== "failure") {
    throw new Error("Original publication job is missing or ambiguous");
  }
  const steps = publish[0].steps ?? [];
  for (const name of ["Pack release tarballs once", "Smoke-test the packed CLI", "Smoke-test the packed core-only CLI", "Publish staging artifacts with trusted publishing"]) {
    if (steps.filter(step => step.name === name && step.conclusion === "success").length !== 1) {
      throw new Error(`Original publication did not complete: ${name}`);
    }
  }
  if (steps.filter(step => step.name === "Verify staging and promote final tags with CLI last" && step.conclusion === "failure").length !== 1) {
    throw new Error("Original publication did not fail at verified promotion");
  }
  return {
    id: run.id, attempt: run.run_attempt, sha: run.head_sha, event: run.event,
    ref: run.head_branch === "main" ? "refs/heads/main" : `refs/tags/${run.head_branch}`
  };
}

export function sourcePackageNames(original, run = runReleaseCommand) {
  run("git", ["fetch", "--no-tags", "origin", original.sha], {});
  const paths = run("git", ["ls-tree", "-r", "--name-only", original.sha, "packages", "reliability"], {})
    .trim().split("\n").filter(path => /^(packages|reliability)\/[^/]+\/package\.json$/.test(path));
  const names = new Set();
  for (const path of paths) {
    const manifest = JSON.parse(run("git", ["show", `${original.sha}:${path}`], {}));
    if (manifest.private) { continue; }
    if (!PACKAGE_NAME.test(manifest.name ?? "") || !manifest.version || names.has(manifest.name)) {
      throw new Error(`Invalid or duplicate original public package: ${path}`);
    }
    names.add(manifest.name);
  }
  if (!names.has("@nodetool-ai/cli") || !names.has("@nodetool-ai/node-catalog")) {
    throw new Error("Original source must contain the public CLI and catalog");
  }
  return [...names].sort();
}

async function downloadTarball(url, options) {
  return Buffer.from(await (await loadRegistryResponse(url, options)).arrayBuffer());
}

function readMember(file, member) {
  return JSON.parse(runReleaseCommand("tar", ["-xOf", file, member], {}));
}

export async function restoreOriginalArtifacts(original, names, version, directory, {
  loadDist = loadRegistryDist, loadAttestations = loadRegistryJson,
  download = downloadTarball, readJsonMember = readMember
} = {}) {
  if (original.event === "push") {
    if (!/^\d+\.\d+\.\d+$/.test(version) || original.ref !== `refs/tags/v${version}`) {
      throw new Error("Stable recovery requires the version of the original release tag");
    }
  } else if (!/^\d+\.\d+\.\d+-[A-Za-z0-9][A-Za-z0-9.-]*$/.test(version)) {
    throw new Error("Recovery requires an explicit prerelease version");
  }
  if (names.length === 0 || new Set(names).size !== names.length || names.some(name => !PACKAGE_NAME.test(name)) ||
      !names.includes("@nodetool-ai/cli") || !names.includes("@nodetool-ai/node-catalog")) {
    throw new Error("Recovery requires the complete original public package set");
  }
  mkdirSync(directory, { recursive: true });
  if (readdirSync(directory).length !== 0) { throw new Error("Recovery artifact directory must be empty"); }
  try {
    const readiness = { deadline: Date.now() + REGISTRY_READINESS_MS };
    const artifacts = [];
    let catalogFile;
    for (const name of names) {
      const pin = { name, version };
      const dist = await loadDist(pin, readiness);
      if (!SHA512.test(dist.integrity ?? "") || !dist.attestations?.url ||
          dist.attestations.provenance?.predicateType !== "https://slsa.dev/provenance/v1") {
        throw new Error(`Missing original integrity or provenance: ${name}@${version}`);
      }
      pin.integrity = dist.integrity;
      if (!hasReleaseProvenance(pin, await loadAttestations(dist.attestations.url, readiness), original)) {
        throw new Error(`Provenance differs from original publication: ${name}@${version}`);
      }
      const expectedTarball = `https://registry.npmjs.org/${name}/-/${name.split("/")[1]}-${version}.tgz`;
      if (dist.tarball !== expectedTarball) { throw new Error(`Unexpected original tarball URL: ${name}@${version}`); }
      const bytes = await download(dist.tarball, readiness);
      const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
      if (integrity !== pin.integrity) { throw new Error(`Original tarball integrity differs: ${name}@${version}`); }
      const file = join(directory, `${name.slice(1).replace("/", "-")}-${version}.tgz`);
      writeFileSync(file, bytes, { flag: "wx" });
      const manifest = readJsonMember(file, "package/package.json");
      if (manifest.name !== name || manifest.version !== version) { throw new Error(`Original tarball identity differs: ${name}@${version}`); }
      artifacts.push(pin);
      if (name === "@nodetool-ai/node-catalog") { catalogFile = file; }
    }
    // Only read the catalog after every cohort member passed the original-run checks.
    const catalog = readJsonMember(catalogFile, "package/dist/index.json");
    if (catalog.coreVersion !== version) { throw new Error("Original catalog version differs from requested recovery"); }
    stagingPins(catalog, artifacts);
    writeFileSync(join(directory, "catalog.json"), `${JSON.stringify(catalog, null, 2)}\n`, { flag: "wx" });
    writeFileSync(join(directory, "original-publication.json"), `${JSON.stringify({ original, version, artifacts }, null, 2)}\n`, { flag: "wx" });
    return { catalog, artifacts };
  } catch (error) {
    // The empty-directory check above establishes ownership before any writes.
    for (const file of readdirSync(directory)) { rmSync(join(directory, file), { force: true }); }
    throw error;
  }
}

async function main() {
  const { values } = parseArgs({ options: {
    "original-run-id": { type: "string" }, version: { type: "string" }, "tarballs-dir": { type: "string" }
  } });
  if (!/^[1-9]\d*$/.test(values["original-run-id"] ?? "") || !values.version || !values["tarballs-dir"]) {
    throw new Error("--original-run-id, --version and --tarballs-dir are required");
  }
  const github = path => JSON.parse(runReleaseCommand("gh", ["api", `repos/${REPOSITORY}/${path}`], {}));
  const run = github(`actions/runs/${values["original-run-id"]}`);
  if (String(run.id) !== values["original-run-id"]) { throw new Error("Original run identity differs from request"); }
  const jobs = github(`actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`);
  if (jobs.total_count !== jobs.jobs?.length) { throw new Error("Original publication jobs are incomplete"); }
  const original = originalPublication(run, jobs.jobs);
  const names = sourcePackageNames(original);
  const { artifacts } = await restoreOriginalArtifacts(original, names, values.version, resolve(values["tarballs-dir"]));
  console.log(`Restored ${artifacts.length} original artifacts from ${RELEASE_REPOSITORY}/actions/runs/${original.id}/attempts/${original.attempt}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
