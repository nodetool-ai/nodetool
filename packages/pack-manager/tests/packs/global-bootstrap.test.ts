import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { setupPackRegistry, disposePackRegistryFixtures } from "../_helpers/pack-registry.js";
import { authorizePackInstallCommand, assertInstallAuthorizationScope, installPromptMessage } from "../../src/commands/pack-install-authorization.js";
import { installPacks } from "../../src/packs/installer.js";
import { readInstallTree, assertTreePins, installTreeRestored, assertAdditivePlan } from "../../src/packs/install-tree.js";

import { prepareInstallSelection } from "../../src/packs/install-selection.js";
import { globalBootstrapPins, normalizeGlobalBootstrap } from "../../src/packs/global-bootstrap.js";
import { createPackCommandServices } from "../../src/packs/command-service.js";
import { readInstalledPacks } from "../../src/packs/installed.js";

const exec = promisify(execFile);
afterEach(disposePackRegistryFixtures);

it.each(["success", "import", "integrity"] as const)("initial global npm bootstrap verifies pins with scripts disabled (%s)", async (outcome) => {
  const f = await setupPackRegistry(false, { globalCore: true });
  const prefix = join(f.directory, "prefix");
  await exec(process.execPath, [f.npm, "install", "--global", "--prefix", prefix, "--ignore-scripts", "--no-audit", "--no-fund",
    `--registry=${f.registry}`, `--cache=${join(f.directory, "cache")}`, "@nodetool-ai/cli@1.0.0"]);
  const root = join(prefix, process.platform === "win32" ? "node_modules" : "lib/node_modules", "@nodetool-ai/cli");
  const core = f.tarballs.get("@nodetool-ai/fixture2-nodes@1.0.0")!;
  const shared = f.tarballs.get("fixture-baseline@1.0.0")!;
  const pin = ({ name, version, integrity }: typeof core) => ({ name, version, integrity });
  const catalog = { ...f.request.catalog, packs: [...f.request.catalog.packs, { ...f.request.catalog.packs[0], id: "core", kind: "core" as const, npm: pin(core) }],
    installPins: [{ ...pin(shared), shared: true }] };
  const request = { ...f.request, catalog, mode: { ...f.request.mode, kind: "global" as const, cliRoot: root, installRoot: root, nodeModulesRoot: join(root, "node_modules") } };
  const before = await readInstallTree(root, true);
  expect(before.missingLock).toBe(true);
  const unverified = await (await createPackCommandServices({ snapshot: readInstalledPacks(request.mode, catalog),
    catalog, stateFile: request.stateFile, operations: f.operations })).doctor({});
  expect(unverified).toMatchObject({ healthy: false, issues: [expect.objectContaining({
    kind: "unverified_global_install", message: expect.stringContaining("nodetool packs doctor --repair")
  })] });

  const authorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  const selection = await prepareInstallSelection(request);
  expect(selection.bootstrap?.map(pin => pin.name).sort()).toEqual([core.name, shared.name].sort());
  expect(installPromptMessage(selection)).toContain("reinstalled with scripts disabled");
  let tampered = false;
  const operations = { ...f.operations,
    loadCheck: vi.fn(async () => { if (outcome === "import") { throw new Error("forced import failure"); } }),
    npm: async (...args: Parameters<typeof f.operations.npm>) => {
      const result = await f.operations.npm(...args);
      if (outcome === "integrity" && !tampered && args[1][0] === "install" && !args[2].dryRun) {
        tampered = true;
        const file = join(root, "node_modules/.package-lock.json");
        const lock = JSON.parse(await readFile(file, "utf8"));
        lock.packages[`node_modules/${core.name}`].integrity = "sha512-wrong";
        await writeFile(file, JSON.stringify(lock));
      }
      return result;
    }
  };
  if (outcome !== "success") {
    await expect(installPacks(request, authorization!, operations)).rejects.toThrow(outcome === "import" ? "forced import failure" : "does not match pin");
    expect(installTreeRestored(before.packages, (await readInstallTree(root)).packages, true)).toBe(true);
    if (outcome === "integrity") { expect(operations.loadCheck).not.toHaveBeenCalled(); }
    for (const name of [core.name, shared.name]) { await expect(access(join(root, "node_modules", name, "SCRIPT_RAN"))).rejects.toThrow(); }
    return;
  }
  await installPacks(request, authorization!, operations);
  const after = await readInstallTree(root);
  assertTreePins(before.packages, after.packages, [pin(core), pin(shared)], new Set([core.name]), "1.0.0", true);
  for (const name of [core.name, shared.name, "@nodetool-ai/fixture-nodes"]) {
    await expect(access(join(root, "node_modules", name, "SCRIPT_RAN"))).rejects.toThrow();
  }
  expect(JSON.parse(await readFile(request.stateFile, "utf8"))[root]).toMatchObject({ packs: ["core", "fixture"], requestedPacks: ["fixture"], managedPacks: ["fixture"] });
  const snapshot = readInstalledPacks(request.mode, catalog);
  expect(snapshot.packs.length).toBe(2);
  expect(await (await createPackCommandServices({ snapshot, catalog, stateFile: request.stateFile, operations })).doctor({})).toMatchObject({ healthy: true });
  const lockFile = join(root, "node_modules/.package-lock.json");
  const originalLock = await readFile(lockFile, "utf8");
  const partial = JSON.parse(originalLock);
  delete partial.packages[`node_modules/${core.name}`].integrity;
  await writeFile(lockFile, JSON.stringify(partial));
  expect((await prepareInstallSelection(request)).bootstrap).toEqual([]);
  await writeFile(lockFile, originalLock);
  const completed = await prepareInstallSelection(request);
  expect(completed.bootstrap).toEqual([]);
  const oldAuthorization = await authorizePackInstallCommand({ request, command: "packs-add" });
  await rm(join(root, "node_modules/.package-lock.json"));
  await expect(installPacks(request, oldAuthorization!, operations)).rejects.toThrow("bootstrap is outside");
  const changed = { ...selection, bootstrap: selection.bootstrap!.map(pin => ({ ...pin, integrity: "sha512-changed" })) };
  expect(() => assertInstallAuthorizationScope(authorization!, changed)).toThrow("bootstrap is outside");
}, 60_000);

const pinned = { name: "fixture-shared", version: "1.0.0", integrity: "sha512-good", shared: true };
const baseline = { name: pinned.name, version: pinned.version, path: "node_modules/fixture-shared", realPath: "/tmp/app/node_modules/fixture-shared", integrity: undefined };
const catalog = { schemaVersion: 1 as const, coreVersion: "1.0.0", owners: {}, packs: [], installPins: [pinned] };
it("refuses unproven bootstrap identities and preserves the additive guard", () => {
  const pins = globalBootstrapPins(catalog, [baseline], []);
  const exact = { name: pinned.name, version: pinned.version, path: baseline.realPath };
  const plan = { add: [], remove: [], change: [{ from: exact, to: exact }] };
  expect(normalizeGlobalBootstrap(plan, pins).change).toEqual([]);
  const line = `change ${pinned.name} 1.0.0 => 1.0.0`;
  expect(normalizeGlobalBootstrap({ ...plan, change: [line] }, pins).change).toEqual([]);
  for (const change of [[line, line], [`change ${pinned.name} 1.0.0 => 2.0.0`], ["change other 1.0.0 => 1.0.0"], ["change unknown"]]) {
    expect(() => assertAdditivePlan(normalizeGlobalBootstrap({ ...plan, change }, pins), [baseline], new Set(), [pinned], "1.0.0")).toThrow();
  }
  expect(() => assertAdditivePlan(normalizeGlobalBootstrap({ ...plan, change: [...plan.change, ...plan.change] }, pins), [baseline], new Set(), [pinned], "1.0.0")).toThrow();
  for (const to of [{ ...exact, name: "other" }, { ...exact, version: "2.0.0" }, { ...exact, path: "/tmp/other" }]) {
    expect(() => assertAdditivePlan(normalizeGlobalBootstrap({ ...plan, change: [{ from: exact, to }] }, pins), [baseline], new Set(), [pinned], "1.0.0")).toThrow();
  }
  expect(() => assertAdditivePlan(normalizeGlobalBootstrap(plan, []), [baseline], new Set(), [pinned], "1.0.0")).toThrow();
  for (const entry of [{ ...baseline, path: "node_modules/parent/node_modules/fixture-shared" }, { ...baseline, version: "2.0.0" }, { ...baseline, integrity: "known" }]) {
    expect(() => globalBootstrapPins(catalog, [entry], [])).toThrow();
  }
  expect(() => globalBootstrapPins(catalog, [baseline, baseline], [])).toThrow();
  expect(() => globalBootstrapPins({ ...catalog, installPins: [{ ...pinned, integrity: "" }] }, [baseline], [])).toThrow();
  expect(() => assertTreePins([baseline], [{ ...baseline, integrity: "wrong" }], pins, new Set(), "1.0.0", true)).toThrow();
});
