import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallSelection } from "./install-selection.js";
import { assertTreePins, type VerificationPin } from "./install-tree.js";

export async function prepareTreeVerification(selection: InstallSelection, cliRoot: string) {
  const { before, packs, catalog, initialGlobalLockMissing } = selection;
  const installPins: readonly VerificationPin[] = catalog.installPins ?? [];
  const pinByFolder = new Map(installPins.map((pin) => [pin.installName ?? pin.name, pin]));
  const libraryPins = (id: string): readonly VerificationPin[] => {
    if (!isRuntimeNpmPackageId(id)) { throw new Error(`Unknown runtime library: ${id}`); }
    return RUNTIME_NPM_PACKAGES[id].packageNames.map((name, index) => {
      const pin = pinByFolder.get(name);
      if (!pin) { throw new Error(`Runtime library ${id} has no integrity pins; installation is unavailable until catalog pins are supplied.`); }
      const spec = pin.installName && pin.installName !== pin.name ? `${pin.installName}@npm:${pin.name}@${pin.version}` : `${pin.name}@${pin.version}`;
      if (spec !== RUNTIME_NPM_PACKAGES[id].npmPackages[index]) { throw new Error(`Runtime library ${id} pin differs from its exact runtime spec: ${name}`); }
      return { ...pin, installPath: `node_modules/${name}` };
    });
  };
  const runtimePins = selection.runtimeLibraries.flatMap((id) => {
    return libraryPins(id);
  });
  const provided = packs.flatMap((pack) => pack.provides.map((name) => {
    const pin = pinByFolder.get(name);
    if (!pin) { throw new Error(`Provided package ${name} has no integrity pin`); }
    return pin;
  }));
  const shared = installPins.filter((pin) => pin.shared);
  for (const name of ["mediabunny", "@mediabunny/server"]) {
    if (before.some((entry) => entry.name === name) && !shared.some((pin) => pin.name === name)) {
      throw new Error(`Shared library ${name} has no integrity pin`);
    }
  }
  const pins: readonly VerificationPin[] = [...packs.map((pack) => pack.npm), ...provided, ...runtimePins, ...packs.flatMap((pack) => pack.scriptAllowlist),
    ...shared.filter((pin) => before.some((entry) => entry.name === pin.name))];
  if (pins.some((pin) => !pin.integrity || pin.integrity === "PENDING")) { throw new Error("Installation requires published integrity pins"); }
  const packNames = new Set(catalog.packs.flatMap((pack) => [pack.npm.name, ...pack.provides]));
  const coreNames = new Set([...before.filter((entry) => entry.name.startsWith("@nodetool-ai/") && !packNames.has(entry.name)).map((entry) => entry.name)]);
  const dependencySchema = z.object({ name: z.string().optional(), dependencies: z.record(z.string(), z.string()).optional(),
    optionalDependencies: z.record(z.string(), z.string()).optional(), peerDependencies: z.record(z.string(), z.string()).optional(),
    peerDependenciesMeta: z.record(z.string(), z.object({ optional: z.boolean().optional() })).optional() });
  for (const directory of [cliRoot, ...before.filter((entry) => coreNames.has(entry.name)).map((entry) => entry.realPath)]) {
    const manifest = dependencySchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
    const requiredPeers = Object.keys(manifest.peerDependencies ?? {}).filter((name) => !manifest.peerDependenciesMeta?.[name]?.optional);
    for (const name of [...Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies }), ...requiredPeers]) {
      if (name.startsWith("@nodetool-ai/") && ((directory === cliRoot && manifest.name === "@nodetool-ai/cli") || !packNames.has(name))) { coreNames.add(name); }
    }
  }
  if (initialGlobalLockMissing) {
    for (const pin of pins) {
      const existing = before.filter((entry) => entry.name === pin.name && (!pin.installPath || entry.path === pin.installPath));
      if (existing.some((entry) => entry.version !== pin.version)) { throw new Error(`Global baseline package version differs from pin: ${pin.name}`); }
      if (shared.some((identity) => identity.name === pin.name) && existing.length !== 1) { throw new Error(`Shared library must exist exactly once: ${pin.name}`); }
    }
  }
  assertTreePins(before, before, pins.filter((pin) => before.some((entry) => entry.name === pin.name && (!pin.installPath || entry.path === pin.installPath) && (!initialGlobalLockMissing || entry.integrity !== undefined))), coreNames, selection.coreVersion);
  return { pins, provided, runtimePins, shared, coreNames, libraryPins, pinByFolder };
}
