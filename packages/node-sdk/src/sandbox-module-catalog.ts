import { createHash } from "node:crypto";

import {
  sandboxDeliveryRefusal,
  sandboxGraphFileModuleId,
  parseSandboxGraphFileModuleId,
  sanitizeSandboxDescription,
  SandboxDeliveryMediaType,
  type ResolvedSandboxModule,
  type SandboxModuleDeliveryResult,
  type SandboxModuleGraphFile,
  type SandboxModuleStatus,
  type SandboxModuleSummary,
  type SandboxPackSkill,
  type SandboxPackSkillDisclosure,
  type SandboxWasmContract
} from "@nodetool-ai/protocol";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import { isPackTrusted, resolvePackTrust } from "./pack-loader.js";

import type {
  SandboxDiscoveredFile,
  SandboxDiscoveredModule,
  SandboxPackDiscovery
} from "./sandbox-pack-discovery.js";

/**
 * Build the runtime catalog from validated, non-executing pack discoveries.
 *
 * `hostStatuses` carries diagnostics the host produced before discovery could
 * run — an unreadable pack, a package name claimed by two roots — so
 * `diagnostics()` reports one set covering everything the host looked at.
 */
export function createSandboxModuleCatalog(
  discoveries: readonly SandboxPackDiscovery[],
  hostStatuses: readonly SandboxModuleStatus[] = [],
  options: { isTrusted?: (packName: string) => boolean } = {}
): SandboxModuleCatalog {
  // Trust is the operator's pack-loader allowlist, resolved once per catalog so
  // one build cannot disagree with itself about a pack.
  const isTrusted = options.isTrusted ?? trustFromConfig();
  const discoveredBySpecifier = new Map<
    string,
    {
      readonly discovery: SandboxPackDiscovery;
      readonly module: SandboxDiscoveredModule;
    }
  >();
  const unavailableSpecifiers = new Set<string>();
  const statuses: SandboxModuleStatus[] = [...hostStatuses];
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
        throw new Error(
          `duplicate sandbox module specifier: ${module.specifier}`
        );
      }
      discoveredBySpecifier.set(module.specifier, { discovery, module });
    }
  }

  const packs = new Map<string, PackDelivery>();
  for (const discovery of discoveries) {
    packs.set(discovery.name, packDelivery(discovery));
  }

  const summaries = [...discoveredBySpecifier.values()]
    .map(({ discovery, module }): SandboxModuleSummary => {
      // The one-line tier: the skill's own description, flattened and capped.
      // The body never travels with a summary — that is the tool's job.
      const description =
        discovery.skill === undefined
          ? ""
          : sanitizeSandboxDescription(discovery.skill.description);
      const summary: SandboxModuleSummary = {
        specifier: module.specifier,
        packName: discovery.name,
        kind: module.kind,
        contentDigest: module.digest
      };
      if (discovery.version !== undefined) {
        summary.packVersion = discovery.version;
      }
      if (description !== "") {
        summary.description = description;
      }
      return summary;
    })
    .sort((left, right) => left.specifier.localeCompare(right.specifier));

  const skillsByPack = new Map<string, SandboxPackSkillDisclosure>();
  for (const discovery of discoveries) {
    if (discovery.skill === undefined) continue;
    const disclosure: SandboxPackSkill & {
      packName: string;
      packVersion?: string;
      trusted: boolean;
    } = {
      ...discovery.skill,
      packName: discovery.name,
      trusted: isTrusted(discovery.name)
    };
    if (discovery.version !== undefined) {
      disclosure.packVersion = discovery.version;
    }
    skillsByPack.set(discovery.name, disclosure);
  }

  return {
    summaries: () => summaries,
    diagnostics: () => statuses,
    packSkill: (packName) => skillsByPack.get(packName),
    // Asynchronous by contract; the v1 entitlement decision is synchronous.
    authorizeDelivery: (moduleId) =>
      Promise.resolve(
        authorizeDelivery(
          moduleId,
          discoveredBySpecifier,
          unavailableSpecifiers,
          packs
        )
      ),
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

function trustFromConfig(): (packName: string) => boolean {
  const trust = resolvePackTrust();
  return (packName) => isPackTrusted(packName, trust);
}

interface PackDelivery {
  readonly discovery: SandboxPackDiscovery;
  readonly filesById: ReadonlyMap<string, SandboxDiscoveredFile>;
  /** The graph digest of the module each file belongs to. */
  readonly digestByFileId: ReadonlyMap<string, string>;
}

/**
 * Index one pack's graph for delivery.
 *
 * Every file gets the graph digest of the public module that reaches it. A file
 * shared by two entry modules belongs to both graphs and therefore has two
 * candidate digests; the lexicographically first specifier wins, so the answer
 * is stable across processes. The digest identifies the module graph a file was
 * delivered as part of — it is never a hash of that one file.
 */
function packDelivery(discovery: SandboxPackDiscovery): PackDelivery {
  const filesById = new Map(discovery.graph.map((file) => [file.id, file]));
  const digestByFileId = new Map<string, string>();
  const entries = [...discovery.modules]
    // A compiled npm entry has no authored file, and a host module has no file
    // at all — neither contributes a graph file to walk.
    .filter((module) => module.npm === undefined && module.kind !== "host")
    .sort((left, right) => left.specifier.localeCompare(right.specifier));
  for (const module of entries) {
    const pending = [module.id];
    const seen = new Set<string>();
    for (let index = 0; index < pending.length; index += 1) {
      const id = pending[index];
      if (id === undefined || seen.has(id)) continue;
      seen.add(id);
      if (!digestByFileId.has(id)) digestByFileId.set(id, module.digest);
      const file = filesById.get(id);
      if (file !== undefined) pending.push(...file.dependencies);
    }
  }
  return { discovery, filesById, digestByFileId };
}

/**
 * Resolve one opaque module id to browser-safe content.
 *
 * Public entry specifiers and internal graph-file ids are both deliverable: the
 * browser loader needs the whole graph, not just the entry. v1 entitlement
 * policy is that any request reaching the catalog is authorized — the seam
 * exists so a later private-pack rule is a policy change, not new plumbing.
 */
function authorizeDelivery(
  moduleId: string,
  discoveredBySpecifier: ReadonlyMap<
    string,
    {
      readonly discovery: SandboxPackDiscovery;
      readonly module: SandboxDiscoveredModule;
    }
  >,
  unavailableSpecifiers: ReadonlySet<string>,
  packs: ReadonlyMap<string, PackDelivery>
): SandboxModuleDeliveryResult {
  const entry = discoveredBySpecifier.get(moduleId);
  if (entry !== undefined) {
    const { discovery, module } = entry;
    if (module.npm !== undefined) {
      return sandboxDeliveryRefusal(
        "unavailable",
        `Sandbox module ${moduleId} is not available for delivery.`
      );
    }
    if (module.kind === "host") {
      // The facade is the only artifact a host module has; the client verifies
      // and caches it like any other JavaScript, and `hostId` lets it rebuild
      // the resolved module without a second request.
      if (module.source === undefined || module.hostId === undefined) {
        return sandboxDeliveryRefusal(
          "unavailable",
          `Sandbox module ${moduleId} has no host facade.`
        );
      }
      const hostDelivery: SandboxModuleDeliveryResult = {
        authorized: true,
        moduleId,
        fileId: module.id,
        internal: false,
        packName: discovery.name,
        contentDigest: module.digest,
        contentSha256: sha256(Buffer.from(module.source, "utf8")),
        dependencies: [],
        kind: "host",
        mediaType: SandboxDeliveryMediaType.JS,
        hostId: module.hostId,
        source: module.source
      };
      if (discovery.version !== undefined) {
        hostDelivery.packVersion = discovery.version;
      }
      return hostDelivery;
    }
    const content: DeliveryContent = {
      moduleId,
      fileId: module.id,
      // A public entry is the pack's advertised surface, never an internal file.
      internal: false,
      digest: module.digest,
      kind: module.kind,
      dependencies: module.dependencies
    };
    if (module.source !== undefined) {
      content.source = module.source;
    }
    if (module.bytes !== undefined) {
      content.bytes = module.bytes;
    }
    // Only a public entry carries the call contract the facade is built from.
    if (module.wasm !== undefined) {
      content.wasm = module.wasm;
    }
    return deliveryFor(discovery, content);
  }
  if (unavailableSpecifiers.has(moduleId)) {
    return sandboxDeliveryRefusal(
      "unavailable",
      `Sandbox module ${moduleId} is not available for delivery.`
    );
  }

  const parsed = parseSandboxGraphFileModuleId(moduleId);
  const pack = parsed === undefined ? undefined : packs.get(parsed.packName);
  const file =
    parsed === undefined || pack === undefined
      ? undefined
      : pack.filesById.get(parsed.fileId);
  const digest =
    parsed === undefined || pack === undefined
      ? undefined
      : pack.digestByFileId.get(parsed.fileId);
  if (
    parsed === undefined ||
    pack === undefined ||
    file === undefined ||
    digest === undefined
  ) {
    return sandboxDeliveryRefusal(
      "not-found",
      `Sandbox module ${moduleId} is not installed.`
    );
  }
  const content: DeliveryContent = {
    moduleId,
    fileId: parsed.fileId,
    internal: file.internal,
    digest,
    kind: file.kind,
    dependencies: file.dependencies
  };
  if (file.source !== undefined) {
    content.source = file.source;
  }
  if (file.bytes !== undefined) {
    content.bytes = file.bytes;
  }
  return deliveryFor(pack.discovery, content);
}

interface DeliveryContent {
  readonly moduleId: string;
  readonly fileId: string;
  readonly internal: boolean;
  readonly digest: string;
  readonly kind: "js" | "wasm";
  source?: string;
  bytes?: Uint8Array;
  wasm?: SandboxWasmContract;
  readonly dependencies: readonly string[];
}

function deliveryFor(
  discovery: SandboxPackDiscovery,
  content: DeliveryContent
): SandboxModuleDeliveryResult {
  type CommonFields = {
    authorized: true;
    moduleId: string;
    fileId: string;
    internal: boolean;
    packName: string;
    packVersion?: string;
    contentDigest: string;
    dependencies: string[];
  };
  const common: CommonFields = {
    authorized: true as const,
    moduleId: content.moduleId,
    fileId: content.fileId,
    internal: content.internal,
    packName: discovery.name,
    contentDigest: content.digest,
    dependencies: content.dependencies.map((dependency) =>
      sandboxGraphFileModuleId(discovery.name, dependency)
    )
  };
  if (discovery.version !== undefined) {
    common.packVersion = discovery.version;
  }
  if (content.kind === "js") {
    if (content.source === undefined) {
      return sandboxDeliveryRefusal(
        "unavailable",
        `Sandbox module ${content.moduleId} has no JavaScript source.`
      );
    }
    return {
      ...common,
      kind: "js",
      mediaType: SandboxDeliveryMediaType.JS,
      contentSha256: sha256(Buffer.from(content.source, "utf8")),
      source: content.source
    };
  }
  if (content.bytes === undefined) {
    return sandboxDeliveryRefusal(
      "unavailable",
      `Sandbox module ${content.moduleId} has no WASM bytes.`
    );
  }
  const wasmDelivery: SandboxModuleDeliveryResult = {
    ...common,
    kind: "wasm",
    mediaType: SandboxDeliveryMediaType.WASM,
    contentSha256: sha256(content.bytes),
    bytes: new Uint8Array(content.bytes)
  };
  if (content.wasm !== undefined) {
    wasmDelivery.wasm = content.wasm;
  }
  return wasmDelivery;
}

/** Hash of exactly the bytes a client receives, so the client can check them. */
function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function toResolvedModule(
  discovery: SandboxPackDiscovery,
  module: SandboxDiscoveredModule
): ResolvedSandboxModule {
  const graph =
    module.kind === "host" ? [] : moduleGraph(discovery.graph, module.id);
  type CommonFields2 = {
    specifier: string;
    packName: string;
    packVersion?: string;
    contentDigest: string;
    moduleId: string;
    graph: typeof graph;
  };
  const common: CommonFields2 = {
    specifier: module.specifier,
    packName: discovery.name,
    contentDigest: module.digest,
    moduleId: module.id,
    graph
  };
  if (discovery.version !== undefined) {
    common.packVersion = discovery.version;
  }
  if (module.kind === "host") {
    if (module.hostId === undefined) {
      throw new Error(
        `sandbox module ${module.specifier} has no host module id`
      );
    }
    return { ...common, kind: "host", hostId: module.hostId };
  }
  if (module.kind === "js") {
    if (module.source === undefined) {
      throw new Error(
        `sandbox module ${module.specifier} has no JavaScript source`
      );
    }
    return { ...common, kind: "js", source: module.source };
  }
  if (module.bytes === undefined) {
    throw new Error(`sandbox module ${module.specifier} has no WASM bytes`);
  }
  if (module.wasm === undefined) {
    throw new Error(
      `sandbox module ${module.specifier} has no WASM call contract`
    );
  }
  return {
    ...common,
    kind: "wasm",
    bytes: new Uint8Array(module.bytes),
    wasm: module.wasm
  };
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
  return [...reachable]
    .map((id) => {
      const file = filesById.get(id);
      if (file === undefined) {
        throw new Error(`sandbox graph is missing ${id}`);
      }
      return toGraphFile(file);
    })
    .sort((left, right) => left.id.localeCompare(right.id));
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
