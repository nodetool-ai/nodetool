import type {
  ResolvedSandboxModule,
  SandboxModuleGraphFile,
  SandboxModuleStatus,
  SandboxModuleSummary
} from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import type {
  SandboxDiscoveredFile,
  SandboxDiscoveredModule,
  SandboxPackDiscovery
} from "./sandbox-pack-discovery.js";

/** Build the runtime catalog from validated, non-executing pack discoveries. */
export function createSandboxModuleCatalog(
  discoveries: readonly SandboxPackDiscovery[]
): SandboxModuleCatalog {
  const discoveredBySpecifier = new Map<string, {
    readonly discovery: SandboxPackDiscovery;
    readonly module: SandboxDiscoveredModule;
  }>();
  const unavailableSpecifiers = new Set<string>();
  const statuses: SandboxModuleStatus[] = [];
  const packNames = new Set<string>();

  for (const discovery of discoveries) {
    if (packNames.has(discovery.name)) {
      throw new Error(`duplicate sandbox pack discovery: ${discovery.name}`);
    }
    packNames.add(discovery.name);
    statuses.push(...discovery.statuses);
    for (const module of discovery.modules) {
      if (module.source === undefined && module.bytes === undefined) {
        unavailableSpecifiers.add(module.specifier);
        continue;
      }
      if (discoveredBySpecifier.has(module.specifier)) {
        throw new Error(`duplicate sandbox module specifier: ${module.specifier}`);
      }
      discoveredBySpecifier.set(module.specifier, { discovery, module });
    }
  }

  const summaries = [...discoveredBySpecifier.values()]
    .map(({ discovery, module }): SandboxModuleSummary => ({
      specifier: module.specifier,
      packName: discovery.name,
      ...(discovery.version === undefined ? {} : { packVersion: discovery.version }),
      kind: module.kind
    }))
    .sort((left, right) => left.specifier.localeCompare(right.specifier));

  return {
    summaries: () => summaries,
    diagnostics: () => statuses,
    resolveForExecution: (declarations) => {
      const modules: ResolvedSandboxModule[] = [];
      const resolutionStatuses: SandboxModuleStatus[] = [];
      const resolvedSpecifiers = new Set<string>();
      for (const declaration of declarations) {
        if (resolvedSpecifiers.has(declaration.specifier)) continue;
        resolvedSpecifiers.add(declaration.specifier);
        const found = discoveredBySpecifier.get(declaration.specifier);
        if (found === undefined) {
          resolutionStatuses.push({
            packName: packNameForSpecifier(declaration.specifier),
            specifier: declaration.specifier,
            status: "error",
            code: unavailableSpecifiers.has(declaration.specifier)
              ? "module-unavailable"
              : "module-not-found",
            message: unavailableSpecifiers.has(declaration.specifier)
              ? `Sandbox module ${declaration.specifier} is not available for execution.`
              : `Sandbox module ${declaration.specifier} is not installed.`
          });
          continue;
        }
        const { discovery, module } = found;
        if (
          declaration.resolvedPackVersion !== undefined &&
          declaration.resolvedPackVersion !== discovery.version
        ) {
          resolutionStatuses.push({
            packName: discovery.name,
            specifier: module.specifier,
            status: "warning",
            code: "version-mismatch",
            message: `Sandbox module ${module.specifier} was saved with pack version ${declaration.resolvedPackVersion}, but ${discovery.version ?? "an unversioned pack"} is installed.`
          });
        }
        if (
          declaration.contentDigest !== undefined &&
          declaration.contentDigest !== module.digest
        ) {
          resolutionStatuses.push({
            packName: discovery.name,
            specifier: module.specifier,
            status: "warning",
            code: "content-digest-mismatch",
            message: `Sandbox module ${module.specifier} has changed since the workflow was saved.`
          });
        }
        modules.push(toResolvedModule(discovery, module));
      }
      return { modules, statuses: resolutionStatuses };
    }
  };
}

function toResolvedModule(
  discovery: SandboxPackDiscovery,
  module: SandboxDiscoveredModule
): ResolvedSandboxModule {
  const graph = moduleGraph(discovery.graph, module.id);
  const common = {
    specifier: module.specifier,
    packName: discovery.name,
    ...(discovery.version === undefined ? {} : { packVersion: discovery.version }),
    contentDigest: module.digest,
    moduleId: module.id,
    graph
  };
  if (module.kind === "js") {
    if (module.source === undefined) {
      throw new Error(`sandbox module ${module.specifier} has no JavaScript source`);
    }
    return { ...common, kind: "js", source: module.source };
  }
  if (module.bytes === undefined) {
    throw new Error(`sandbox module ${module.specifier} has no WASM bytes`);
  }
  return { ...common, kind: "wasm", bytes: new Uint8Array(module.bytes) };
}

function moduleGraph(
  graph: readonly SandboxDiscoveredFile[],
  rootId: string
): SandboxModuleGraphFile[] {
  const filesById = new Map(graph.map((file) => [file.id, file]));
  const pending = [rootId];
  const reachable = new Set<string>();
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (id === undefined || reachable.has(id)) continue;
    const file = filesById.get(id);
    if (file === undefined) {
      throw new Error(`sandbox graph is missing ${id}`);
    }
    reachable.add(id);
    pending.push(...file.dependencies);
  }
  return [...reachable].map((id) => {
    const file = filesById.get(id);
    if (file === undefined) {
      throw new Error(`sandbox graph is missing ${id}`);
    }
    return toGraphFile(file);
  }).sort((left, right) => left.id.localeCompare(right.id));
}

function toGraphFile(file: SandboxDiscoveredFile): SandboxModuleGraphFile {
  if (file.kind === "js") {
    if (file.source === undefined) {
      throw new Error(`sandbox graph file ${file.id} has no JavaScript source`);
    }
    return {
      id: file.id,
      kind: "js",
      source: file.source,
      dependencies: [...file.dependencies],
      internal: file.internal
    };
  }
  if (file.bytes === undefined) {
    throw new Error(`sandbox graph file ${file.id} has no WASM bytes`);
  }
  return {
    id: file.id,
    kind: "wasm",
    bytes: new Uint8Array(file.bytes),
    dependencies: [...file.dependencies],
    internal: file.internal
  };
}

function packNameForSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name === undefined ? specifier : `${scope}/${name}`;
  }
  return specifier.split("/")[0] ?? specifier;
}
