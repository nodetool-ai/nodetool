import { z } from "zod";
import type { NodeCatalogIndex, PinnedPackage } from "@nodetool-ai/node-catalog";
import { RUNTIME_NPM_PACKAGES } from "@nodetool-ai/protocol/runtime-npm-packages";
import type { InstallPlan, TreePackage } from "./install-tree.js";

const identity = z.object({ name: z.string(), version: z.string(), path: z.string() });
const replayChange = z.object({ from: identity, to: identity });

/** npm 11 labels replaying an exact no-save owned package as a change. */
export function normalizeOwnedPackReplay(plan: InstallPlan, before: readonly TreePackage[], catalog: NodeCatalogIndex, coreNames: ReadonlySet<string> = new Set(catalog.packs.filter((pack) => pack.kind === "core").map((pack) => pack.npm.name))): InstallPlan {
  const table = new Map((catalog.installPins ?? []).map((pin) => [pin.installName ?? pin.name, pin]));
  const excluded = new Set([
    ...coreNames,
    ...(catalog.installPins ?? []).filter((pin) => pin.shared).map((pin) => pin.name),
    ...Object.values(RUNTIME_NPM_PACKAGES).flatMap((group) => group.packageNames),
    ...Object.values(RUNTIME_NPM_PACKAGES).flatMap((group) => group.packageNames.map((name) => table.get(name)?.name).filter((name) => name !== undefined))
  ]);
  const owned = new Map<string, PinnedPackage>();
  for (const pack of catalog.packs) {
    if (pack.kind !== "node-pack") { continue; }
    for (const pin of [pack.npm, ...pack.provides.map((name) => table.get(name)).filter((pin) => pin !== undefined)]) {
      if (!excluded.has(pin.name)) { owned.set(pin.name, pin); }
    }
  }
  const paths = new Map(before.map((entry) => [entry.realPath, entry]));
  const change = plan.change.filter((raw) => {
    const parsed = replayChange.safeParse(raw);
    if (!parsed.success) { return true; }
    const { from, to } = parsed.data;
    if (from.name !== to.name || from.version !== to.version || from.path !== to.path) { return true; }
    const pin = owned.get(from.name); const previous = paths.get(from.path);
    if (!pin || !previous || !previous.integrity || previous.integrity !== pin.integrity || previous.name !== from.name ||
      previous.version !== from.version || pin.version !== catalog.coreVersion || from.version !== catalog.coreVersion) { return true; }
    return false;
  });
  return { ...plan, change };
}
