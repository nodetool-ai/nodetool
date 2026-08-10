/**
 * The implementations behind NodeTool's host module ids.
 *
 * `SANDBOX_HOST_MODULES` in `@nodetool-ai/protocol` declares *what* exists —
 * ids, owning packs, export names — because node-sdk validates a manifest
 * against it and the browser rebuilds a facade from it. This is the other half:
 * the functions, which only a host runs.
 *
 * Every entry is loaded lazily. Nothing here sits in an entry graph, so a
 * process that never runs a Code node importing `@nodetool-ai/sandbox-xlsx`
 * never loads exceljs — the same property the old `data.*` bridges had, kept
 * for the same reason.
 */

import { SANDBOX_HOST_MODULES } from "@nodetool-ai/protocol";

/** One host module's exports: named async functions over plain data. */
export type SandboxHostModuleImplementation = Readonly<
  Record<string, (...args: unknown[]) => Promise<unknown>>
>;

type Loader = () => Promise<SandboxHostModuleImplementation>;

const LOADERS: Readonly<Record<string, Loader>> = {
  csv: async () => {
    const mod = await import("./csv.js");
    return { parse: mod.parse, stringify: mod.stringify };
  },
  html: async () => {
    const mod = await import("./html.js");
    return { select: mod.select, toMarkdown: mod.toMarkdown };
  },
  xml: async () => {
    const mod = await import("./xml.js");
    return { parse: mod.parse };
  },
  xlsx: async () => {
    const mod = await import("./xlsx.js");
    return { parse: mod.parse };
  },
  zip: async () => {
    const mod = await import("./zip.js");
    return { unzip: mod.unzip, zip: mod.zip };
  },
  diff: async () => {
    const mod = await import("./diff.js");
    return { unified: mod.unified };
  }
};

const cache = new Map<string, Promise<SandboxHostModuleImplementation>>();

/**
 * Load one host module's implementation, at most once per process.
 *
 * A miss is a programming error, not a guest-reachable path: the dispatcher
 * only asks for ids the catalog resolved, and the catalog only resolves ids
 * `SANDBOX_HOST_MODULES` lists.
 */
export function loadSandboxHostModule(
  hostId: string
): Promise<SandboxHostModuleImplementation> {
  const cached = cache.get(hostId);
  if (cached !== undefined) return cached;
  const loader = Object.hasOwn(LOADERS, hostId) ? LOADERS[hostId] : undefined;
  if (loader === undefined) {
    return Promise.reject(
      new Error(`no host module implementation is registered for "${hostId}"`)
    );
  }
  const loading = loader();
  cache.set(hostId, loading);
  void loading.catch(() => cache.delete(hostId));
  return loading;
}

/** Ids this process can actually serve. Every id in the protocol table. */
export function registeredSandboxHostModuleIds(): readonly string[] {
  return Object.keys(LOADERS).sort();
}

/**
 * Ids declared in the protocol table with no implementation here, or the other
 * way round. Always empty in a healthy build; the drift test asserts it.
 */
export function sandboxHostModuleDrift(): readonly string[] {
  const declared = new Set(Object.keys(SANDBOX_HOST_MODULES));
  const implemented = new Set(Object.keys(LOADERS));
  const drift: string[] = [];
  for (const id of declared) {
    if (!implemented.has(id)) drift.push(`${id} is declared but not implemented`);
  }
  for (const id of implemented) {
    if (!declared.has(id)) drift.push(`${id} is implemented but not declared`);
  }
  return drift.sort();
}
