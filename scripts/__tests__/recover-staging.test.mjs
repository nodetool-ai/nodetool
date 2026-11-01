import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { originalPublication, restoreOriginalArtifacts, sourcePackageNames } from "../release/recover-staging.mjs";
import { RELEASE_REPOSITORY, RELEASE_WORKFLOW } from "../release/verify-staging.mjs";

const version = "0.8.4-a24.1";
const defaultVersion = version;
const original = { id: 123, attempt: 1, sha: "a".repeat(40), event: "workflow_dispatch", ref: "refs/tags/cli-pack-rehearsal-a24.1" };
const defaultOriginal = original;
const names = ["@nodetool-ai/cli", "@nodetool-ai/node-catalog", "@nodetool-ai/fal-nodes"];
const roots = [];
function directory() { const root = mkdtempSync(join(tmpdir(), "release-recovery-")); roots.push(root); return root; }
afterEach(() => { for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); } });

function runFixture() {
  const run = { id: original.id, run_attempt: original.attempt, head_sha: original.sha,
    head_branch: "cli-pack-rehearsal-a24.1", path: RELEASE_WORKFLOW, repository: { full_name: "nodetool-ai/nodetool" },
    event: "workflow_dispatch", status: "completed", conclusion: "failure" };
  const jobs = [{ run_id: original.id, name: "publish", conclusion: "failure", steps: [
    ...["Pack release tarballs once", "Smoke-test the packed CLI", "Smoke-test the packed core-only CLI", "Publish staging artifacts with trusted publishing"]
      .map(name => ({ name, conclusion: "success" })),
    { name: "Verify staging and promote final tags with CLI last", conclusion: "failure" }
  ] }];
  return { run, jobs };
}

function fixture(version = defaultVersion, original = defaultOriginal, cohort = names) {
  const bytes = new Map(cohort.map(name => [name, Buffer.from(name)]));
  const pins = cohort.map(name => ({ name, version, integrity: `sha512-${createHash("sha512").update(bytes.get(name)).digest("base64")}` }));
  const catalog = { coreVersion: version, packs: [{ id: "fal", kind: "node-pack", npm: pins[2], provides: [], scriptAllowlist: [] }] };
  const events = [];
  const attestations = pin => ({ attestations: [{ predicateType: "https://slsa.dev/provenance/v1", bundle: { dsseEnvelope: {
    signatures: [{ sig: "fixture" }], payload: Buffer.from(JSON.stringify({
      _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1",
      subject: [{ name: `pkg:npm/${pin.name.replace(/^@/, "%40")}@${version}`, digest: { sha512: Buffer.from(pin.integrity.slice(7), "base64").toString("hex") } }],
      predicate: {
        buildDefinition: {
          externalParameters: { workflow: { repository: RELEASE_REPOSITORY, path: RELEASE_WORKFLOW, ref: original.ref } },
          internalParameters: { github: { event_name: original.event } },
          resolvedDependencies: [{ uri: `git+${RELEASE_REPOSITORY}@${original.ref}`, digest: { gitCommit: original.sha } }]
        },
        runDetails: { metadata: { invocationId: `${RELEASE_REPOSITORY}/actions/runs/${original.id}/attempts/${original.attempt}` } }
      }
    })).toString("base64")
  } } }] });
  const options = {
    loadDist: vi.fn(async pin => ({
      integrity: pins.find(item => item.name === pin.name).integrity,
      tarball: `https://registry.npmjs.org/${pin.name}/-/${pin.name.split("/")[1]}-${version}.tgz`,
      attestations: { url: `https://registry.npmjs.org/${encodeURIComponent(pin.name)}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } }
    })),
    loadAttestations: vi.fn(async url => { const pin = pins.find(item => url.endsWith(encodeURIComponent(item.name))); events.push(`provenance:${pin.name}`); return attestations(pin); }),
    download: vi.fn(async url => { const name = cohort.find(item => url.startsWith(`https://registry.npmjs.org/${item}/`)); events.push(`download:${name}`); return bytes.get(name); }),
    readJsonMember: vi.fn((file, member) => {
      events.push(member);
      if (member === "package/dist/index.json") { return catalog; }
      return { name: readFileSync(file, "utf8"), version };
    })
  };
  return { options, pins, catalog, events };
}

describe("original publication identity", () => {
  it("requires the failed promotion job after successful original packing, smokes and publication", () => {
    const { run, jobs } = runFixture();
    expect(originalPublication(run, jobs)).toEqual(original);
    for (const field of ["path", "head_sha", "event", "conclusion"]) {
      expect(() => originalPublication({ ...run, [field]: "other" }, jobs)).toThrow("failed NodeTool publication");
    }
    expect(() => originalPublication({ ...run, repository: { full_name: "someone/else" } }, jobs)).toThrow("failed NodeTool publication");
    expect(() => originalPublication(run, [{ ...jobs[0], run_id: 456 }])).toThrow("job is missing");
    const tagPush = { ...run, event: "push", head_branch: "v0.8.6" };
    expect(originalPublication(tagPush, jobs)).toEqual({ ...original, event: "push", ref: "refs/tags/v0.8.6" });
    for (const head_branch of ["main", "v0.8.6-a1", "v0.8.6-nightly.20261018.1"]) {
      expect(() => originalPublication({ ...tagPush, head_branch }, jobs)).toThrow("failed NodeTool publication");
    }
    jobs[0].steps[3].conclusion = "failure";
    expect(() => originalPublication(run, jobs)).toThrow("did not complete");
  });

  it("enumerates public packages from the original commit, including reliability", () => {
    const source = new Map([
      ["packages/cli/package.json", { name: names[0], version: "0.8.3" }],
      ["packages/node-catalog/package.json", { name: names[1], version: "0.8.3" }],
      ["packages/private/package.json", { name: "private", version: "0.8.3", private: true }],
      ["reliability/harness/package.json", { name: "@nodetool-ai/reliability-harness", version: "0.8.3" }]
    ]);
    const run = vi.fn((_command, args) => {
      if (args[0] === "fetch") { expect(args.at(-1)).toBe(original.sha); return ""; }
      if (args[0] === "ls-tree") { expect(args).toContain(original.sha); return [...source.keys()].join("\n"); }
      expect(args[1]).toMatch(new RegExp(`^${original.sha}:`));
      return JSON.stringify(source.get(args[1].slice(original.sha.length + 1)));
    });
    expect(sourcePackageNames(original, run)).toEqual([names[0], names[1], "@nodetool-ai/reliability-harness"]);
    source.set("packages/private/package.json", { name: names[0], version });
    expect(() => sourcePackageNames(original, run)).toThrow("duplicate original public package");
  });
});

describe("original artifact recovery", () => {
  it("preserves downloaded bytes and verifies every original identity before reading catalog pins", async () => {
    const { options, pins, events } = fixture();
    const root = directory();
    const restored = await restoreOriginalArtifacts(original, names, version, root, options);
    expect(restored.artifacts).toEqual(pins);
    expect(readdirSync(root).filter(file => file.endsWith(".tgz"))).toHaveLength(names.length);
    expect(JSON.parse(readFileSync(join(root, "original-publication.json"), "utf8"))).toEqual({ original, version, artifacts: pins });
    expect(events.at(-1)).toBe("package/dist/index.json");
    for (const name of names) { expect(events.indexOf(`provenance:${name}`)).toBeLessThan(events.indexOf(`download:${name}`)); }
  });

  it.each(["id", "attempt", "sha", "event", "ref"])("rejects foreign original %s before downloading or extracting", async field => {
    const { options } = fixture();
    await expect(restoreOriginalArtifacts({ ...original, [field]: "other" }, names, version, directory(), options)).rejects.toThrow("Provenance differs");
    expect(options.download).not.toHaveBeenCalled();
    expect(options.readJsonMember).not.toHaveBeenCalled();
  });

  it("rejects altered bytes before reading any archive member", async () => {
    const { options } = fixture();
    options.download = vi.fn(async () => Buffer.from("changed"));
    await expect(restoreOriginalArtifacts(original, names, version, directory(), options)).rejects.toThrow("tarball integrity differs");
    expect(options.readJsonMember).not.toHaveBeenCalled();
  });

  it("rejects foreign tarball URLs without requesting them", async () => {
    const { options } = fixture();
    const loadDist = options.loadDist;
    options.loadDist = async pin => ({ ...await loadDist(pin), tarball: "https://evil.test/original.tgz" });
    await expect(restoreOriginalArtifacts(original, names, version, directory(), options)).rejects.toThrow("Unexpected original tarball URL");
    expect(options.download).not.toHaveBeenCalled();
  });

  it("rejects missing cohort members and tampered catalog pins without writing a promotion catalog", async () => {
    const missing = fixture();
    missing.options.loadDist = async () => { throw new Error("npm registry returned HTTP 404"); };
    await expect(restoreOriginalArtifacts(original, names, version, directory(), missing.options)).rejects.toThrow("HTTP 404");
    expect(missing.options.readJsonMember).not.toHaveBeenCalled();
    const { options, catalog } = fixture();
    catalog.packs[0].npm = { ...catalog.packs[0].npm, integrity: "sha512-changed" };
    const root = directory();
    await expect(restoreOriginalArtifacts(original, names, version, root, options)).rejects.toThrow("Catalog pin differs");
    expect(readdirSync(root)).toEqual([]);
  });

  it("removes partial artifacts after a later member fails and allows a clean retry", async () => {
    const { options } = fixture();
    const root = directory();
    const loadDist = options.loadDist;
    options.loadDist = async (pin, readiness) => {
      if (pin.name === names[1]) { throw new Error("later member unavailable"); }
      return loadDist(pin, readiness);
    };
    await expect(restoreOriginalArtifacts(original, names, version, root, options)).rejects.toThrow("later member unavailable");
    expect(options.readJsonMember).toHaveBeenCalledOnce();
    expect(readdirSync(root)).toEqual([]);
    options.loadDist = loadDist;
    await expect(restoreOriginalArtifacts(original, names, version, root, options)).resolves.toHaveProperty("artifacts");
  });

  it("restores a stable release only from the push of its own tag", async () => {
    const stable = { ...original, event: "push", ref: "refs/tags/v0.8.6" };
    const { options, pins } = fixture("0.8.6", stable);
    await expect(restoreOriginalArtifacts(stable, names, "0.8.6", directory(), options)).resolves.toHaveProperty("artifacts", pins);
    for (const other of ["0.8.5", "0.8.6-a1"]) {
      await expect(restoreOriginalArtifacts(stable, names, other, directory(), options)).rejects.toThrow("version of the original release tag");
    }
    expect(options.loadDist).toHaveBeenCalledTimes(names.length);
  });

  it("restores a stable release dispatched from main", async () => {
    const dispatched = { ...original, ref: "refs/heads/main" };
    const { options, pins } = fixture("0.8.10", dispatched);
    await expect(restoreOriginalArtifacts(dispatched, names, "0.8.10", directory(), options)).resolves.toHaveProperty("artifacts", pins);
  });

  it("refuses stable dispatch recovery off main, empty or incomplete source sets, and existing artifact directories", async () => {
    const { options } = fixture();
    await expect(restoreOriginalArtifacts(original, names, "0.8.4", directory(), options)).rejects.toThrow("explicit prerelease");
    for (const incomplete of [[], [names[0]], [...names, names[0]]]) {
      await expect(restoreOriginalArtifacts(original, incomplete, version, directory(), options)).rejects.toThrow("complete original");
    }
    const root = directory();
    await restoreOriginalArtifacts(original, names, version, root, options);
    const preserved = readdirSync(root);
    await expect(restoreOriginalArtifacts(original, names, version, root, options)).rejects.toThrow("must be empty");
    expect(readdirSync(root)).toEqual(preserved);
  });
});

it("recovers runtime catalog pins from pack-core and checks the compatibility carrier", async () => {
  const cohort = [...names, "@nodetool-ai/pack-core"];
  const { options } = fixture(undefined, undefined, cohort);
  await expect(restoreOriginalArtifacts(original, cohort, version, directory(), options)).resolves.toHaveProperty("catalog");
  const reads = options.readJsonMember.mock.calls.filter(([, member]) => member === "package/dist/index.json").map(([file]) => file);
  expect(reads).toHaveLength(2);
  expect(reads[0]).toContain("pack-core");
  expect(reads[1]).toContain("node-catalog");
});

it("rejects conflicting runtime and compatibility catalog carriers", async () => {
  const cohort = [...names, "@nodetool-ai/pack-core"];
  const { options, catalog } = fixture(undefined, undefined, cohort);
  const read = options.readJsonMember;
  options.readJsonMember = vi.fn((file, member) => member === "package/dist/index.json" && file.includes("node-catalog")
    ? { ...catalog, coreVersion: "stale" } : read(file, member));
  await expect(restoreOriginalArtifacts(original, cohort, version, directory(), options)).rejects.toThrow("catalog carriers disagree");
});
