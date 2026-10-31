import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";
import { createPackCommandServices } from "../../src/packs/command-service.js";
import { DEFAULT_INSTALLER_OPERATIONS } from "../../src/packs/installer.js";
import type { InstalledPackSnapshot } from "../../src/packs/installed.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function doctor(runtimeLibraries: readonly string[] | undefined, selection: "none" | "state" | "manifest" = "none") {
  const root = await mkdtemp(join(tmpdir(), "pack-doctor-runtime-"));
  roots.push(root);
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
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@nodetool-ai/cli", version: "1.0.0",
    dependencies: selection === "manifest" ? { [pack.npm.name]: "1.0.0" } : {} }));
  const packages = [pack.npm, ...installPins.map(pin => pin.name === "pdf-parse"
    ? { ...pin, version: "1.1.1", integrity: "sha512-transitive-pdf" } : pin)];
  const lock: Record<string, { version: string; integrity: string }> = {};
  for (const entry of packages) {
    const path = `node_modules/${entry.name}`;
    await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, path, "package.json"), JSON.stringify({ name: entry.name, version: entry.version }));
    lock[path] = { version: entry.version, integrity: entry.integrity };
  }
  await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: lock }));
  const stateFile = join(root, "cli-packs.json");
  if (runtimeLibraries !== undefined) {
    await writeFile(stateFile, JSON.stringify({ [root]: {
      root, coreVersion: "1.0.0", packs: selection === "state" ? [pack.id] : [], runtimeLibraries
    } }));
  }
  const packageRoot = join(root, "node_modules", pack.npm.name);
  const snapshot: InstalledPackSnapshot = {
    mode: { kind: "global", cliRoot: root, installRoot: root, nodeModulesRoot: join(root, "node_modules"), coreVersion: "1.0.0", pathStyle: "posix" },
    packs: [{ id: pack.id, npm: pack.npm.name, version: "1.0.0", packageRoot, realPackageRoot: packageRoot, providedPackages: [] }],
    wrongVersions: [], invalidPackages: []
  };
  const services = await createPackCommandServices({ snapshot, catalog, stateFile,
    operations: { ...DEFAULT_INSTALLER_OPERATIONS, npmVersion: async () => "11.21.0" } });
  return services.doctor({});
}

it.each([{ libraries: undefined }, { libraries: [] }])("does not activate optional runtimes from a transitively installed node pack (%j)", async ({ libraries }) => {
  expect(await doctor(libraries)).toMatchObject({ healthy: true, issues: [] });
});

it("still rejects a mismatched package for an explicitly selected runtime", async () => {
  expect(await doctor(["pdf-js"])).toMatchObject({ healthy: false, issues: [{
    kind: "integrity", message: "Package integrity or version does not match pin: pdf-parse"
  }] });
});

it.each(["state", "manifest"] as const)("requires declared runtimes for a node pack selected through %s", async selection => {
  expect(await doctor([], selection)).toMatchObject({ healthy: false, issues: [{
    kind: "integrity", message: "Package integrity or version does not match pin: pdf-parse"
  }] });
});
