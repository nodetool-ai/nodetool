import { z } from "zod";
import type { NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES, isRuntimeNpmPackageId } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallPlan, TreePackage, VerificationPin } from "./install-tree.js";

export interface GlobalBootstrapPin extends VerificationPin { readonly installPath: string; readonly realPath: string }

/** Initial global npm installs omit locks. Reify only catalog-owned existing roots. */
export function globalBootstrapPins(catalog: NodeCatalogIndex, before: readonly TreePackage[], libraries: readonly string[]): readonly GlobalBootstrapPin[] {
  const table = new Map((catalog.installPins ?? []).map(pin => [pin.installName ?? pin.name, pin]));
  const installed = new Set(before.map(entry => entry.name));
  const packs = catalog.packs.filter(pack => installed.has(pack.npm.name));
  const required = (name: string) => {
    const pin = table.get(name);
    if (!pin) { throw new Error(`Global bootstrap has no integrity pin for ${name}`); }
    return pin;
  };
  const candidates: readonly VerificationPin[] = [...packs.flatMap(pack => [pack.npm, ...pack.provides.map(required), ...pack.scriptAllowlist]),
    ...(catalog.installPins ?? []).filter(pin => pin.shared),
    ...libraries.flatMap(id => isRuntimeNpmPackageId(id) ? RUNTIME_NPM_PACKAGES[id].packageNames.map(name => ({ ...required(name), installPath: `node_modules/${name}` })) : [])];
  const result = new Map<string, GlobalBootstrapPin>();
  for (const pin of candidates) {
    const entries = before.filter(entry => entry.name === pin.name && (!pin.installPath || entry.path === pin.installPath));
    if (!entries.length) { continue; }
    const path = `node_modules/${pin.installName ?? pin.name}`;
    if (!pin.integrity || pin.integrity === "PENDING" || entries.length !== 1 || entries[0].path !== path ||
      entries[0].version !== pin.version || entries[0].integrity !== undefined) {
      throw new Error(`Global bootstrap requires one exact unrecorded root package: ${pin.name}`);
    }
    result.set(path, { ...pin, installPath: path, realPath: entries[0].realPath });
  }
  return [...result.values()].sort((a, b) => a.installPath.localeCompare(b.installPath));
}

const identity = z.object({ name: z.string(), version: z.string(), path: z.string() });
const changeSchema = z.object({ from: identity, to: identity });
/** Permit only explicitly authorized same-version root reification, never arbitrary changes. */
export function normalizeGlobalBootstrap(plan: InstallPlan, pins: readonly GlobalBootstrapPin[]): InstallPlan {
  const byPath = new Map(pins.map(pin => [pin.realPath, pin]));
  const byName = new Map<string, GlobalBootstrapPin[]>();
  for (const pin of pins) { byName.set(pin.name, [...(byName.get(pin.name) ?? []), pin]); }
  const replayed = new Set<string>();
  return { ...plan, change: plan.change.filter(raw => {
    if (typeof raw === "string") {
      const match = /^change (\S+) (\S+) => (\S+)$/.exec(raw);
      const candidates = match ? byName.get(match[1]) : undefined;
      if (!match || candidates?.length !== 1) { return true; }
      const pin = candidates[0];
      if (replayed.has(pin.realPath) || match[2] !== pin.version || match[3] !== pin.version) { return true; }
      replayed.add(pin.realPath);
      return false;
    }
    const parsed = changeSchema.safeParse(raw);
    if (!parsed.success) { return true; }
    const { from, to } = parsed.data;
    const pin = byPath.get(from.path);
    if (!pin || replayed.has(pin.realPath) || from.path !== to.path || from.name !== pin.name || to.name !== pin.name ||
      from.version !== pin.version || to.version !== pin.version) { return true; }
    replayed.add(pin.realPath);
    return false;
  }) };
}
