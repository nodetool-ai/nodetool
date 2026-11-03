import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasReleaseProvenance, RELEASE_REPOSITORY, RELEASE_WORKFLOW, stagingPins, verifyRegistryInstall, verifyStaging } from "../release/verify-staging.mjs";
import { promoteStaging, promotionOrder, releaseTag } from "../release/promote-staging.mjs";
import { assertPublishTag, stageExistingVersion } from "../publish-packages.mjs";

const version = "1.2.3";
const artifacts = ["@nodetool-ai/cli", "@nodetool-ai/fal-nodes", "@nodetool-ai/protocol"].map(name => ({ name, version, integrity: `sha512-${createHash("sha512").update(name).digest("base64")}` }));
function catalogFixture(releaseVersion = version) {
  return { coreVersion: releaseVersion, packs: [{ id: "fal", kind: "node-pack", npm: { ...artifacts[1], version: releaseVersion }, provides: [], scriptAllowlist: [], registrar: "registerFalNodes", nodeCount: 2 }] };
}
function installCatalogFixture() {
  const catalog = catalogFixture();
  for (const id of ["cli-workflow", "cli-harness"]) {
    catalog.packs.push({ id, kind: "cli-feature", npm: { name: `@nodetool-ai/${id}`, version, integrity: `sha512-${id}` }, provides: [], scriptAllowlist: [], registrar: "feature", nodeCount: 0 });
  }
  return catalog;
}
function attestation(pin, change = statement => statement) {
  const statement = change({ _type: "https://in-toto.io/Statement/v1", predicateType: "https://slsa.dev/provenance/v1", subject: [{ name: `pkg:npm/${pin.name.replace(/^@/, "%40")}@${pin.version}`, digest: { sha512: Buffer.from(pin.integrity.slice(7), "base64").toString("hex") } }],
    predicate: { buildDefinition: { externalParameters: { workflow: { repository: RELEASE_REPOSITORY, path: RELEASE_WORKFLOW } } } } });
  return { attestations: [{ predicateType: "https://slsa.dev/provenance/v1", bundle: { dsseEnvelope: { payload: Buffer.from(JSON.stringify(statement)).toString("base64"), signatures: [{ sig: "test-signature" }] } } }] };
}
function fakeRegistry(pins = artifacts) {
  return vi.fn(async requested => {
    const pin = pins.find(pkg => pkg.name === requested.name && pkg.version === requested.version);
    if (!pin) { throw new Error(`Missing fixture ${requested.name}@${requested.version}`); }
    return { integrity: pin.integrity, attestations: { url: `https://registry.npmjs.org/${encodeURIComponent(pin.name)}`, provenance: { predicateType: "https://slsa.dev/provenance/v1" } } };
  });
}

describe("staging verification", () => {
  it("verifies companion pins against original artifacts and external install pins without NodeTool provenance", async () => {
    const catalog = catalogFixture();
    const companion = { name: "@nodetool-ai/fal-companion", version, integrity: `sha512-${createHash("sha512").update("companion").digest("base64")}` };
    const external = { name: "@typescript/typescript6", installName: "typescript", version: "6.0.2", integrity: `sha512-${createHash("sha512").update("compiler").digest("base64")}` };
    const shared = { name: "mediabunny", version: "4.5.6", shared: true, integrity: `sha512-${createHash("sha512").update("shared").digest("base64")}` };
    catalog.packs[0].provides = [companion.name];
    catalog.installPins = [companion, external, shared];
    const original = [...artifacts, companion];
    const run = fakeRegistry([...original, external, shared]);
    const loadAttestations = vi.fn(async url => attestation(original.find(pin => url.endsWith(encodeURIComponent(pin.name)))));
    const verified = await verifyStaging(catalog, original, { verifyTarball: async () => {}, loadDist: run, loadAttestations, smoke: async () => {} });
    expect(verified.map(pin => [pin.name, pin.firstParty])).toEqual([...original.map(pin => [pin.name, true]), [external.name, false], [shared.name, false]]);
    expect(run).toHaveBeenCalledTimes(verified.length);
    expect(new Set(run.mock.calls.map(([, options]) => options.deadline)).size).toBe(1);
    expect(loadAttestations).toHaveBeenCalledTimes(original.length);
  });

  it("rejects missing, changed and duplicate companion pins before registry IO", async () => {
    const catalog = catalogFixture();
    const companion = { name: "@nodetool-ai/fal-companion", version, integrity: `sha512-${createHash("sha512").update("companion").digest("base64")}` };
    catalog.packs[0].provides = [companion.name];
    const original = [...artifacts, companion];
    expect(() => stagingPins(catalog, original)).toThrow("Missing catalog install pin");
    catalog.installPins = [{ ...companion, integrity: artifacts[0].integrity }];
    expect(() => stagingPins(catalog, original)).toThrow("Catalog install pin differs");
    catalog.installPins = [companion, companion];
    expect(() => stagingPins(catalog, original)).toThrow("Duplicate release install pin");
    catalog.installPins = [{ ...companion, version: "1.2.4" }];
    const run = vi.fn();
    await expect(verifyStaging(catalog, original, { verifyTarball: async () => {}, loadDist: run, smoke: vi.fn() })).rejects.toThrow("Missing original release install artifact");
    expect(run).not.toHaveBeenCalled();
  });

  it("checks every original artifact before the registry install smoke", async () => {
    const run = fakeRegistry();
    const smoke = vi.fn(async () => {});
    const verified = await verifyStaging(catalogFixture(), artifacts, { verifyTarball: async () => {}, loadDist: run, smoke, loadAttestations: async url => attestation(artifacts.find(pkg => url.endsWith(encodeURIComponent(pkg.name)))) });
    expect(verified.map(pkg => pkg.name)).toEqual(artifacts.map(pkg => pkg.name));
    expect(run).toHaveBeenCalledTimes(artifacts.length);
    expect(smoke).toHaveBeenCalledOnce();
  });

  it("waits for every tarball before installing and blocks promotion on download failure", async () => {
    const verifyTarball = vi.fn(async () => { throw new Error("tarball unavailable"); });
    const smoke = vi.fn();
    const run = vi.fn();
    await expect(promoteStaging(catalogFixture(), artifacts, {
      run,
      verify: () => verifyStaging(catalogFixture(), artifacts, {
        loadDist: fakeRegistry(), verifyTarball, smoke
      })
    })).rejects.toThrow("tarball unavailable");
    expect(verifyTarball).toHaveBeenCalledTimes(artifacts.length);
    expect(verifyTarball.mock.calls.map(([pin]) => pin.name)).toEqual(artifacts.map(pin => pin.name));
    expect(new Set(verifyTarball.mock.calls.map(([, , options]) => options.deadline)).size).toBe(1);
    expect(smoke).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a deliberately wrong catalog pin before registry calls", async () => {
    const catalog = catalogFixture();
    catalog.packs[0].npm.integrity = "sha512-wrong";
    const run = vi.fn();
    await expect(verifyStaging(catalog, artifacts, { verifyTarball: async () => {}, loadDist: run })).rejects.toThrow("Catalog pin differs");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a registry tarball that differs from its pin", async () => {
    const run = vi.fn(async () => ({ integrity: "sha512-wrong" }));
    const smoke = vi.fn();
    await expect(verifyStaging(catalogFixture(), artifacts, { verifyTarball: async () => {}, loadDist: run, smoke })).rejects.toThrow("Registry integrity differs");
    expect(run).toHaveBeenCalledTimes(artifacts.length);
    expect(smoke).not.toHaveBeenCalled();
  });

  it("requires provenance on every first-party artifact", async () => {
    const run = vi.fn(async requested => ({ integrity: artifacts.find(pkg => requested.name === pkg.name).integrity }));
    const smoke = vi.fn();
    await expect(verifyStaging(catalogFixture(), artifacts, { verifyTarball: async () => {}, loadDist: run, smoke })).rejects.toThrow("Missing matching");
    expect(run).toHaveBeenCalledTimes(artifacts.length);
    expect(smoke).not.toHaveBeenCalled();
  });

  it("checks represented third-party allowlist pins without inventing NodeTool provenance", async () => {
    const catalog = catalogFixture();
    const external = { name: "native-addon", version: "4.5.6", integrity: "sha512-external" };
    catalog.packs[0].scriptAllowlist.push(external);
    const run = fakeRegistry([...artifacts, external]);
    const fetch = vi.fn(async url => attestation(artifacts.find(pkg => url.endsWith(encodeURIComponent(pkg.name)))));
    const verified = await verifyStaging(catalog, artifacts, { verifyTarball: async () => {}, loadDist: run, loadAttestations: fetch, smoke: async () => {} });
    expect(verified.at(-1)).toMatchObject({ ...external, firstParty: false });
    expect(fetch).toHaveBeenCalledTimes(artifacts.length);
  });

  it("rejects an empty comparison and missing release companions", () => {
    expect(() => stagingPins(catalogFixture(), [])).toThrow("requires catalog pins");
    const catalog = catalogFixture();
    catalog.packs[0].provides.push("@nodetool-ai/missing");
    expect(() => stagingPins(catalog, artifacts)).toThrow("Missing release companion");
  });
});

describe("exact provenance identity", () => {
  it("accepts the npm SLSA v1 workflow and exact package digest", () => {
    expect(hasReleaseProvenance(artifacts[0], attestation(artifacts[0]))).toBe(true);
  });
  it.each([
    ["repository", s => { s.predicate.buildDefinition.externalParameters.workflow.repository += "-other"; return s; }],
    ["workflow", s => { s.predicate.buildDefinition.externalParameters.workflow.path = ".github/workflows/other.yaml"; return s; }],
    ["subject", s => { s.subject[0].name += "-other"; return s; }],
    ["digest", s => { s.subject[0].digest.sha512 = "wrong"; return s; }],
    ["predicate type", s => { s.predicateType = "other"; return s; }]
  ])("rejects a mismatched %s", (_name, change) => {
    expect(hasReleaseProvenance(artifacts[0], attestation(artifacts[0], change))).toBe(false);
  });
  it("rejects unsigned and malformed envelopes", () => {
    const unsigned = attestation(artifacts[0]);
    unsigned.attestations[0].bundle.dsseEnvelope.signatures = [];
    expect(hasReleaseProvenance(artifacts[0], unsigned)).toBe(false);
    unsigned.attestations[0].bundle.dsseEnvelope.signatures = [{ sig: "test" }];
    unsigned.attestations[0].bundle.dsseEnvelope.payload = "not-json";
    expect(hasReleaseProvenance(artifacts[0], unsigned)).toBe(false);
  });
});

describe("verified promotion", () => {
  it.each([["1.2.3", "latest"], ["1.2.3-rc.1", "rc"], ["1.2.3-beta-candidate.2", "beta"], ["1.2.3+build", "latest"]])("preserves %s → %s", (input, expected) => {
    expect(releaseTag(input)).toBe(expected);
  });
  it("promotes CLI last after successful verification", async () => {
    const events = [];
    const order = await promoteStaging(catalogFixture(), artifacts, { verify: async () => { events.push("verified"); }, run: async (_command, args) => { events.push(args); } });
    expect(events[0]).toBe("verified");
    expect(events.at(-1)).toEqual(["dist-tag", "add", "@nodetool-ai/cli@1.2.3", "latest"]);
    expect(order).toEqual(["@nodetool-ai/fal-nodes", "@nodetool-ai/protocol", "@nodetool-ai/cli"]);
    expect(promotionOrder(artifacts).at(-1).name).toBe("@nodetool-ai/cli");
  });
  it("starts the CLI promotion only after every parallel promotion has finished", async () => {
    const pending = [];
    const finished = new Set();
    const run = vi.fn((_command, args) => {
      if (args[2].includes("/cli@")) {
        expect(finished.size).toBe(artifacts.length - 1);
        return Promise.resolve();
      }
      return new Promise(resolveCall => pending.push(() => { finished.add(args[2]); resolveCall(); }));
    });
    const promotion = promoteStaging(catalogFixture(), artifacts, { verify: async () => {}, run });
    await vi.waitFor(() => expect(pending).toHaveLength(artifacts.length - 1));
    expect(run).toHaveBeenCalledTimes(artifacts.length - 1);
    for (const release of pending.reverse()) { release(); }
    await promotion;
    expect(run.mock.calls.at(-1)[1][2]).toBe("@nodetool-ai/cli@1.2.3");
  });
  it("leaves every latest tag unchanged when the real verifier sees a deliberately wrong pin", async () => {
    const catalog = catalogFixture();
    catalog.packs[0].npm.integrity = "sha512-wrong";
    const latest = new Map(artifacts.map(pkg => [pkg.name, "1.2.2"]));
    const run = vi.fn(async (_command, args) => { latest.set(args[2].split("@").slice(0, -1).join("@"), version); });
    await expect(promoteStaging(catalog, artifacts, { verify: () => verifyStaging(catalog, artifacts, { verifyTarball: async () => {}, loadDist: fakeRegistry() }), run })).rejects.toThrow("Catalog pin differs");
    expect(run).not.toHaveBeenCalled();
    expect([...latest.values()]).toEqual(["1.2.2", "1.2.2", "1.2.2"]);
  });
  it("refuses to move prereleases to latest and never mutates tags in dry runs", async () => {
    const run = vi.fn();
    const catalog = catalogFixture("1.2.3-rc.1");
    await expect(promoteStaging(catalog, artifacts, { tag: "latest", run })).rejects.toThrow("must promote rc");
    await promoteStaging(catalogFixture(), artifacts, { dryRun: true, verify: async () => {}, run });
    expect(run).not.toHaveBeenCalled();
  });
  it("keeps the CLI unpromoted if an earlier promotion fails", async () => {
    const run = vi.fn(async () => { throw new Error("registry refused promotion"); });
    await expect(promoteStaging(catalogFixture(), artifacts, { verify: async () => {}, run })).rejects.toThrow("registry refused");
    expect(run).toHaveBeenCalledTimes(artifacts.length - 1);
    for (const [, args] of run.mock.calls) { expect(args[2]).not.toContain("/cli@"); }
  });
  it("requires a CLI artifact before verification or tag writes", () => {
    expect(() => promotionOrder(artifacts.filter(pkg => pkg.name !== "@nodetool-ai/cli"))).toThrow("requires the CLI");
  });
});

describe("staging publication policy", () => {
  it("requires staging for real publication but permits harmless dry-run tags", () => {
    expect(() => assertPublishTag("latest")).toThrow("must publish to staging");
    expect(() => assertPublishTag("rc")).toThrow("must publish to staging");
    expect(() => assertPublishTag("staging")).not.toThrow();
    expect(() => assertPublishTag("latest", true)).not.toThrow();
  });
  it("stages an existing version on rerun using only the staging tag", async () => {
    const run = vi.fn(async () => "");
    await stageExistingVersion("@nodetool-ai/cli", version, run);
    expect(run.mock.calls[0][1]).toEqual(["dist-tag", "add", "@nodetool-ai/cli@1.2.3", "staging"]);
  });
});

const roots = [];
afterEach(() => { for (const root of roots.splice(0)) { rmSync(root, { recursive: true, force: true }); } });
it("audits project and global installs before execution and verifies both FAL workflows", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-smoke-test-")); roots.push(root);
  const calls = [];
  const audited = [];
  await verifyRegistryInstall(installCatalogFixture(), { auditInstall: directory => audited.push(directory), temporaryRoot: root, run: (command, args, options) => {
    calls.push([command, args, options]);
    if (args.includes("--global")) {
      const prefix = args[args.indexOf("--prefix") + 1];
      const directory = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@nodetool-ai/cli/node_modules/@nodetool-ai/nodes-core");
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "package.json"), JSON.stringify({ name: "@nodetool-ai/nodes-core", version }));
    }
    if (args[0] === "packs" && args[1] === "add" && !command.endsWith(".js") && command !== process.execPath) {
      const data = process.platform === "win32" ? join(options.env.HOME, "AppData", "Roaming") : options.env.XDG_DATA_HOME;
      const packs = join(data, "nodetool", "packs", version);
      mkdirSync(join(packs, "g-0-0000000000000000"), { recursive: true });
      writeFileSync(join(packs, "current.json"), JSON.stringify({ schemaVersion: 1, generation: "g-0-0000000000000000" }));
    }
    if (args.includes("--version")) { return version; }
    if (command === "du") { return "100 node_modules"; }
    if (args.includes("--import")) {
      const origin = "https://queue.fal.run/openrouter/router";
      writeFileSync(options.env.FAL_FIXTURE_TRACE, [
        { step: 0, method: "POST", url: origin },
        { step: 1, method: "GET", url: `${origin}/requests/packed-fixture/status` },
        { step: 2, method: "GET", url: `${origin}/requests/packed-fixture` }
      ].map(JSON.stringify).join("\n"));
      return JSON.stringify({status:"completed",outputs:{fal_result:["packed FAL fixture"]}});
    }
    return "";
  } });
  expect(audited).toHaveLength(2);
  expect(audited[0]).toBe(calls[0][2].cwd);
  expect(audited[1]).toContain("@nodetool-ai/cli");
  expect(calls[1][1]).toEqual(["audit", "signatures"]);
  expect(calls[2][1]).toEqual(["rebuild", "better-sqlite3", "--ignore-scripts=false", "--no-audit", "--no-fund"]);
  expect(calls[3][1]).toEqual(["--version"]);
  expect(calls[4][1]).toEqual(["packs", "add", "cli-workflow", "cli-harness", "fal", "--yes"]);
  expect(calls[5][1]).toEqual(["audit", "signatures"]);
  // Packs live in the pack project, so the expanded tree is audited there.
  expect(calls[5][2].cwd).toMatch(/nodetool[\\/]packs[\\/][^\\/]+[\\/]g-0-0000000000000000$/);
  const probe = calls.find(([, args]) => args[0] === "--input-type=module")[1][2];
  expect(probe.indexOf("loadCliPackSnapshot()")).toBeGreaterThan(-1);
  expect(probe.indexOf("loadCliPackSnapshot()")).toBeLessThan(probe.indexOf("@nodetool-ai/node-sdk"));
  const globalInstall = calls.findIndex(([, args]) => args.includes("--global"));
  const projectModules = join(calls[0][2].cwd, "node_modules");
  const globalPrefix = calls[globalInstall][1][calls[globalInstall][1].indexOf("--prefix") + 1];
  for (const start of [calls[globalInstall][2].cwd, join(globalPrefix, "lib/node_modules/@nodetool-ai/cli")]) {
    for (let directory = start; ; directory = resolve(directory, "..")) {
      expect(join(directory, "node_modules")).not.toBe(projectModules);
      if (resolve(directory, "..") === directory) { break; }
    }
  }

  if (process.platform === "linux" && process.arch === "x64") {
    expect(calls.find(([command]) => command === "du")[2].cwd).toBe(join(globalPrefix, "lib"));
  }
  expect(calls[globalInstall + 1][1].slice(0, 4)).toEqual(["audit", "signatures", "--global=false", "--prefix"]);
  expect(calls[globalInstall + 2][1].slice(0, 3)).toEqual(["rebuild", "better-sqlite3", "--ignore-scripts=false"]);
  expect(calls.filter(([, args]) => args.includes("--import"))).toHaveLength(2);
  const globalWorkflow = calls.findLastIndex(([, args]) => args.includes("--import"));
  const globalAudit = calls.findLastIndex(([, args]) => args[0] === "audit");
  expect(globalAudit).toBeGreaterThan(globalInstall);
  expect(globalWorkflow).toBeGreaterThan(globalAudit);
  expect(calls.every(([, , options]) => options.env.NODETOOL_PACKS_INSTALLER === undefined)).toBe(true);
});

it("requires admitted independent command features for the optional registry scenarios", async () => {
  const run = vi.fn();
  await expect(verifyRegistryInstall(catalogFixture(), { run })).rejects.toThrow("cli-workflow catalog entry");
  expect(run).not.toHaveBeenCalled();
});

it("refuses to execute the installed CLI when its initial signature audit fails", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-cli-signature-refusal-"));
  roots.push(root);
  const calls = [];
  await expect(verifyRegistryInstall(installCatalogFixture(), { auditInstall: () => {}, temporaryRoot: root, run: (command, args) => {
    calls.push([command, args]);
    if (args[0] === "audit") {
      throw new Error("CLI signature refused");
    }
    return args[0] === "--version" ? version : "";
  } })).rejects.toThrow("CLI signature refused");
  expect(calls).toHaveLength(2);
  expect(calls.every(([command]) => command === "npm")).toBe(true);
});

it("stops the registry smoke when the CLI refuses pack installation", async () => {
  const root = mkdtempSync(join(tmpdir(), "registry-pack-refusal-"));
  roots.push(root);
  const calls = [];
  await expect(verifyRegistryInstall(installCatalogFixture(), { auditInstall: () => {}, temporaryRoot: root, run: (command, args, options) => {
    calls.push([command, args]);
    if (args[0] === "packs") {
      expect(options.env.NODETOOL_PACKS_INSTALLER).toBeUndefined();
      throw new Error("pack integrity refused");
    }
    return args[0] === "--version" ? version : "";
  } })).rejects.toThrow("pack integrity refused");
  expect(calls.at(-1)[1]).toEqual(["packs", "add", "cli-workflow", "cli-harness", "fal", "--yes"]);
  expect(calls.filter(([, args]) => args[0] === "audit")).toHaveLength(1);
  expect(calls.some(([, args]) => args[0] === "--input-type=module")).toBe(false);
});

it("the standalone verifier exits nonzero on a deliberately wrong pin before npm view", () => {
  const root = mkdtempSync(join(tmpdir(), "staging-wrong-pin-cli-"));
  roots.push(root);
  const staging = join(root, "staging/package");
  const tarballs = join(root, "tarballs");
  mkdirSync(staging, { recursive: true });
  mkdirSync(tarballs);
  writeFileSync(join(staging, "package.json"), JSON.stringify({ name: "@nodetool-ai/fal-nodes", version }));
  const packed = spawnSync("tar", ["-czf", join(tarballs, "fal.tgz"), "-C", join(root, "staging"), "package"], { encoding: "utf8" });
  expect(packed.status, packed.stderr).toBe(0);
  const catalog = catalogFixture();
  catalog.packs[0].npm.integrity = "sha512-wrong";
  const catalogFile = join(root, "catalog.json");
  writeFileSync(catalogFile, JSON.stringify(catalog));
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, "../release/verify-staging.mjs"), "--tarballs-dir", tarballs, "--catalog", catalogFile], { encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("Catalog pin differs from original release artifact");
});

it("the release workflow stages first and promotes only through the verifier, with pinned OIDC-compatible npm", () => {
  const workflow = readFileSync(resolve(import.meta.dirname, "../../.github/workflows/publish.yaml"), "utf8");
  const install = workflow.indexOf("npm install --global npm@11.21.0 --ignore-scripts");
  const stage = workflow.indexOf("publish-packages.mjs --tag staging");
  const promote = workflow.indexOf("promote-staging.mjs --tarballs-dir");
  const record = workflow.indexOf("name: Record published version");
  expect(install).toBeGreaterThan(0);
  expect(stage).toBeGreaterThan(install);
  expect(promote).toBeGreaterThan(stage);
  expect(record).toBeGreaterThan(promote);
  expect(workflow).not.toContain('publish-packages.mjs --tag "$NPM_TAG"');
  expect(workflow).not.toContain("secrets.NPM_TOKEN");
});
