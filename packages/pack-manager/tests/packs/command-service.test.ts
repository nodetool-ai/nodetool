import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { createPackCommandServices } from "../../src/packs/command-service.js";
import { DEFAULT_INSTALLER_OPERATIONS } from "../../src/packs/installer.js";
import { readInstalledPacks } from "../../src/packs/installed.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

const pack: CatalogPack = {
  id: "document", kind: "node-pack",
  npm: { name: "@nodetool-ai/document-nodes", version: "1.0.0", integrity: "sha512-document" },
  registrar: "register", provides: [], requires: [], runtimeLibraries: ["pdf-js"],
  secrets: [], scriptAllowlist: [], installBytes: 1, nodeCount: 1
};
const installPins = [
  { name: "@llamaindex/liteparse", version: "1.5.3", integrity: "sha512-liteparse" },
  { name: "pdf-parse", version: "2.4.5", integrity: "sha512-pdf-runtime" },
  { name: "pdf-lib", version: "1.17.1", integrity: "sha512-pdf-lib" }
];
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.0.0", owners: {}, packs: [pack], installPins };

/** A pack project generation with the document pack and its pdf-js runtime installed. */
async function doctor(options: { readonly mismatchedRuntime?: boolean; readonly missingPack?: boolean; readonly deletedGeneration?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "pack-doctor-project-"));
  roots.push(root);
  const cliRoot = join(root, "cli");
  await mkdir(cliRoot);
  await writeFile(join(cliRoot, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.0.0" }));
  const packsRoot = join(root, "packs", "1.0.0");
  const generation = "g-0-0000000000000000";
  const project = join(packsRoot, generation);
  await mkdir(join(project, "node_modules"), { recursive: true });
  await writeFile(join(packsRoot, "current.json"), JSON.stringify({ schemaVersion: 1, generation: options.deletedGeneration ? "g-1-1111111111111111" : generation }));
  await writeFile(join(project, "package.json"), JSON.stringify({ name: "nodetool-packs", nodetool: { coreVersion: "1.0.0", packs: [pack.id], runtimeLibraries: [] } }));
  const packages = [...(options.missingPack ? [] : [pack.npm]), ...installPins.map(pin => options.mismatchedRuntime && pin.name === "pdf-parse"
    ? { ...pin, version: "1.1.1", integrity: "sha512-other-pdf" } : pin)];
  const lock: Record<string, { version: string; integrity: string }> = {};
  for (const entry of packages) {
    const path = `node_modules/${entry.name}`;
    await mkdir(join(project, path), { recursive: true });
    await writeFile(join(project, path, "package.json"), JSON.stringify({ name: entry.name, version: entry.version }));
    lock[path] = { version: entry.version, integrity: entry.integrity };
  }
  await writeFile(join(project, "node_modules/.package-lock.json"), JSON.stringify({ packages: lock }));
  const mode = { kind: "global" as const, cliRoot, packsRoot, legacyInstallRoot: cliRoot, coreVersion: "1.0.0", pathStyle: "posix" as const };
  const services = await createPackCommandServices({ snapshot: readInstalledPacks(mode, catalog), catalog, stateFile: join(root, "cli-packs.json"),
    operations: { ...DEFAULT_INSTALLER_OPERATIONS, npmVersion: async () => "11.21.0" } });
  return services.doctor({});
}

it("reports a project that matches its catalog pins as healthy", async () => {
  expect(await doctor()).toMatchObject({ healthy: true, issues: [] });
});

it("rejects a runtime library whose installed package differs from its pin", async () => {
  expect(await doctor({ mismatchedRuntime: true })).toMatchObject({ healthy: false, issues: [{
    kind: "integrity", message: "Package integrity or version does not match pin: pdf-parse"
  }] });
});

it("reports a selected pack that is missing from the project", async () => {
  expect(await doctor({ missingPack: true })).toMatchObject({ healthy: false, issues: [{
    kind: "integrity", message: "Package integrity or version does not match pin: @nodetool-ai/document-nodes"
  }] });
});

it("reports a pointer to a deleted generation instead of failing to start", async () => {
  expect(await doctor({ deletedGeneration: true })).toMatchObject({ healthy: false, projectRoot: null, issues: [{
    kind: "project", message: expect.stringContaining("missing generation")
  }] });
});
