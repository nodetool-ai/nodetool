/**
 * The road a shipped pack travels, shared by the pack test files.
 *
 * Discovery reads the pack directory under `packages/sandbox-packs/`, the
 * compiler bundles an npm entry if there is one, discovery runs again over the
 * compiled result, and the catalog resolves what a Code node declaring those
 * specifiers would execute with. Nothing is stubbed and nothing is fetched.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createSandboxModuleCatalog,
  discoverSandboxPack,
  type SandboxPackDiscovery
} from "@nodetool-ai/node-sdk";

import { CompiledModuleCache } from "../src/cache.js";
import { compileDiscoveries, createCompiledNpmLookup } from "../src/catalog.js";

const here = dirname(fileURLToPath(import.meta.url));

export const PACKS_ROOT = join(here, "..", "..", "sandbox-packs");

/** One cache for the process: compiling date-fns once per file is enough. */
const cache = new CompiledModuleCache(
  join(mkdtempSync(join(tmpdir(), "nodetool-pack-harness-")), "cache")
);

/** `@nodetool-ai/sandbox-csv` → the directory it ships from. */
export function packDir(packName: string): string {
  return join(PACKS_ROOT, packName.slice("@nodetool-ai/".length));
}

/** Discover a shipped pack, compile its npm entry if it has one, discover again. */
export async function discoverPack(specifier: string): Promise<SandboxPackDiscovery> {
  const dir = packDir(specifier);
  const first = discoverSandboxPack(dir);
  if (first === undefined) throw new Error(`${specifier} is not a sandbox pack`);
  const reports = await compileDiscoveries([first], { cache });
  const second = discoverSandboxPack(dir, {
    compiled: createCompiledNpmLookup(reports)
  });
  if (second === undefined) throw new Error(`${specifier} stopped being a sandbox pack`);
  return second;
}

/** A catalog over several packs — what a host offers a node that declares them. */
export async function catalogFor(specifiers: string[]) {
  const discoveries = await Promise.all(specifiers.map((s) => discoverPack(s)));
  return createSandboxModuleCatalog(discoveries);
}

/**
 * The resolution a Code node declaring exactly `specifiers` would run with.
 *
 * `declared` defaults to `specifiers`; pass a shorter list to model a node that
 * imports more than it declared.
 */
export async function resolveFor(specifiers: string[], declared = specifiers) {
  const catalog = await catalogFor(specifiers);
  return {
    catalog,
    resolution: catalog.resolveForExecution(declared.map((specifier) => ({ specifier })))
  };
}

/** The resolution for a single pack, plus the pieces behind it. */
export async function resolveOne(specifier: string) {
  const discovery = await discoverPack(specifier);
  const catalog = createSandboxModuleCatalog([discovery]);
  const resolution = catalog.resolveForExecution([{ specifier }]);
  return { discovery, catalog, resolution };
}
