/**
 * Browser-side sandbox module catalog.
 *
 * A Code node's `packages` declaration names modules the guest may import. On
 * the server those sources come off disk through the node-sdk catalog; in the
 * browser they come over `GET /api/sandbox-modules/<opaque id>` — one response
 * per file, each naming the ids it imports so the client can walk the closure.
 *
 * Two halves, because the catalog contract is synchronous and fetching is not:
 *
 * 1. {@link fetchSandboxModuleClosure} runs **before** the run. It fetches every
 *    declared specifier, verifies each response body against the
 *    `X-Content-Sha256` header, follows `X-Sandbox-Module-Dependencies` until
 *    the closure is complete, and caches what it verified.
 * 2. {@link createSeededSandboxModuleCatalog} turns those records into a
 *    `SandboxModuleCatalog` whose `resolveForExecution` answers from memory.
 *
 * The records are plain, structured-cloneable data, so the prefetch happens once
 * on the main thread and the same records seed a catalog inside the Web Worker.
 *
 * The cache is keyed by module id with the module-graph digest as its version:
 * a pack upgrade moves the digest, so the stale entry misses naturally. The
 * digest is *not* a hash of any one response — every file of a graph shares it —
 * which is why verification uses the per-file `contentSha256` instead.
 */

// Type-only: the contract lives in runtime, but nothing of runtime's
// implementation belongs in a browser bundle.
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime/context";
import {
  parseSandboxGraphFileModuleId,
  sandboxDeliveryRefusal,
  type ResolvedSandboxModule,
  type SandboxModuleDeclaration,
  type SandboxModuleGraphFile,
  type SandboxModuleResolution,
  type SandboxModuleStatus,
  type SandboxModuleSummary,
  type SandboxWasmContract,
  SandboxWasmContractSchema
} from "@nodetool-ai/protocol";

import { restFetch } from "../rest-fetch";
import type { WorkflowGraph } from "../../stores/ApiTypes";

const ROUTE_PREFIX = "/api/sandbox-modules/";

/** What every delivered sandbox module file carries, whatever its kind. */
interface DeliveredSandboxFile {
  /** The opaque id it was fetched by — an entry specifier or `<pack>::<file>`. */
  moduleId: string;
  /** Pack-relative file id; relative imports inside the file resolve against it. */
  fileId: string;
  internal: boolean;
  packName: string;
  packVersion?: string;
  /** The module-graph digest — the cache version, not a hash of this body. */
  contentDigest: string;
  /** SHA-256 of this body, verified before the record is cached. */
  contentSha256: string;
  /** Opaque ids of the modules this file imports. */
  dependencies: string[];
}

/** One delivered sandbox module file, as plain cloneable data. */
export type SandboxModuleRecord =
  | (DeliveredSandboxFile & { kind: "js"; source: string })
  // The buffer is pinned to `ArrayBuffer` (not `ArrayBufferLike`) to match the
  // protocol schema a resolution is built against. `wasm` is the call contract
  // the facade is built from; only a pack's public entry carries one.
  | (DeliveredSandboxFile & {
      kind: "wasm";
      bytes: Uint8Array<ArrayBuffer>;
      wasm?: SandboxWasmContract;
    })
  // A host module. The body is the generated facade — verified and cached like
  // any other JavaScript — and `hostId` is what the resolution carries; the
  // export list and the dispatcher's checks come from the protocol registry.
  | (DeliveredSandboxFile & {
      kind: "host";
      hostId: string;
      source: string;
    });

const CODE_NODE_TYPE = "nodetool.code.Code";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The `packages` declarations of every Code node in `graph`, deduped by
 * specifier. Read from any of the three graph shapes the editor produces: a
 * `data.properties` bag, a `properties` bag, or props flattened onto `data`.
 */
export function collectSandboxModuleDeclarations(
  graph: WorkflowGraph | null | undefined
): SandboxModuleDeclaration[] {
  const bySpecifier = new Map<string, SandboxModuleDeclaration>();
  for (const node of graph?.nodes ?? []) {
    if (node.type !== CODE_NODE_TYPE) continue;
    const data = asRecord(node.data);
    const props =
      asRecord((node as { properties?: unknown }).properties) ??
      asRecord(data?.["properties"]) ??
      data ??
      {};
    const declared = props["packages"];
    if (!Array.isArray(declared)) continue;
    for (const entry of declared) {
      const specifier =
        typeof entry === "string"
          ? entry
          : typeof asRecord(entry)?.["specifier"] === "string"
            ? (asRecord(entry)!["specifier"] as string)
            : undefined;
      if (specifier === undefined || specifier.length === 0) continue;
      if (bySpecifier.has(specifier)) continue;
      const fields = asRecord(entry);
      const packVersion = fields?.["resolvedPackVersion"];
      const contentDigest = fields?.["contentDigest"];
      bySpecifier.set(specifier, {
        specifier,
        ...(typeof packVersion === "string"
          ? { resolvedPackVersion: packVersion }
          : {}),
        ...(typeof contentDigest === "string" ? { contentDigest } : {})
      });
    }
  }
  return [...bySpecifier.values()];
}

// ---------------------------------------------------------------------------
// Fetch + verify + cache
// ---------------------------------------------------------------------------

/** Verified records, keyed by module id. The digest is the version. */
const cache = new Map<string, SandboxModuleRecord>();

/** Drop everything cached — for tests, and for a pack reload. */
export function clearSandboxModuleCache(): void {
  cache.clear();
}

/** What the browser says when a module cannot be had, wording the server's. */
function deliveryError(moduleId: string, detail: string): Error {
  return new Error(`Sandbox module ${moduleId} ${detail}`);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function parseDependencies(header: string | null): string[] {
  if (!header) return [];
  try {
    const parsed: unknown = JSON.parse(header);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Parse the WASM call contract a public entry is delivered with.
 *
 * The contract decides what the guest may call and with which argument types,
 * so a malformed one is refused rather than trusted: the module then resolves
 * as unavailable instead of running against a contract nobody validated.
 */
function parseWasmContract(
  moduleId: string,
  header: string | null
): SandboxWasmContract | undefined {
  if (!header) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(header);
  } catch {
    throw deliveryError(
      moduleId,
      "was delivered with an unreadable WASM call contract."
    );
  }
  const contract = SandboxWasmContractSchema.safeParse(parsed);
  if (!contract.success) {
    throw deliveryError(
      moduleId,
      "was delivered with a WASM call contract the schema refuses."
    );
  }
  return contract.data;
}

/**
 * Fetch one module by opaque id and verify its body before returning it.
 *
 * A body that does not hash to the header's `contentSha256` is not cached and
 * not returned: the point of the check is that nothing unverified reaches the
 * guest, and a poisoned cache would defeat it on the next run.
 */
async function fetchModule(moduleId: string): Promise<SandboxModuleRecord> {
  const response = await restFetch(
    `${ROUTE_PREFIX}${encodeURIComponent(moduleId)}`
  );
  if (!response.ok) {
    if (response.status === 404) {
      throw deliveryError(moduleId, "is not available on this server.");
    }
    if (response.status === 403) {
      throw deliveryError(moduleId, "is not available to this client.");
    }
    throw deliveryError(
      moduleId,
      `could not be fetched (HTTP ${response.status}).`
    );
  }

  const headers = response.headers;
  const contentDigest = headers.get("X-Content-Digest");
  const contentSha256 = headers.get("X-Content-Sha256");
  const packName = headers.get("X-Sandbox-Pack");
  const fileId = headers.get("X-Sandbox-File-Id");
  if (!contentDigest || !contentSha256 || !packName || !fileId) {
    throw deliveryError(moduleId, "was delivered without its content headers.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = await sha256Hex(bytes);
  if (actual !== contentSha256) {
    throw deliveryError(
      moduleId,
      `failed its content check — the server announced ${contentSha256} and delivered ${actual}.`
    );
  }

  const packVersion = headers.get("X-Sandbox-Pack-Version");
  const common: DeliveredSandboxFile = {
    moduleId,
    fileId,
    internal: headers.get("X-Sandbox-Internal") === "1",
    packName,
    ...(packVersion === null ? {} : { packVersion }),
    contentDigest,
    contentSha256,
    dependencies: parseDependencies(
      headers.get("X-Sandbox-Module-Dependencies")
    )
  };
  const isWasm =
    headers.get("Content-Type")?.startsWith("application/wasm") === true;
  const contract = isWasm
    ? parseWasmContract(moduleId, headers.get("X-Sandbox-Wasm-Contract"))
    : undefined;
  const hostId = headers.get("X-Sandbox-Host-Module");
  const record: SandboxModuleRecord = isWasm
    ? {
        ...common,
        kind: "wasm",
        bytes,
        ...(contract === undefined ? {} : { wasm: contract })
      }
    : hostId
      ? {
          ...common,
          kind: "host",
          hostId,
          source: new TextDecoder().decode(bytes)
        }
      : { ...common, kind: "js", source: new TextDecoder().decode(bytes) };
  cache.set(moduleId, record);
  return record;
}

/**
 * Fetch `moduleIds` and everything they import, transitively.
 *
 * The cache is consulted first, and the module-graph digest is what makes it
 * safe: a dependency's id (`<pack>::<file>`) is stable across pack versions, so
 * a cached entry from an older pack would otherwise be served forever. Every
 * file reached from one root must carry that root's digest; one that does not
 * is a leftover from a previous version and is re-fetched.
 *
 * Any failure rejects — a half-fetched closure only fails later inside the
 * guest, where the message says far less about what went wrong.
 */
export async function fetchSandboxModuleClosure(
  moduleIds: readonly string[]
): Promise<SandboxModuleRecord[]> {
  const collected = new Map<string, SandboxModuleRecord>();
  for (const root of moduleIds) {
    const rootRecord = cache.get(root) ?? (await fetchModule(root));
    const pending = [rootRecord];
    for (let index = 0; index < pending.length; index += 1) {
      const record = pending[index];
      if (record === undefined || collected.has(record.moduleId)) continue;
      collected.set(record.moduleId, record);
      for (const moduleId of record.dependencies) {
        const cached = cache.get(moduleId);
        pending.push(
          cached !== undefined &&
            cached.contentDigest === rootRecord.contentDigest
            ? cached
            : await fetchModule(moduleId)
        );
      }
    }
  }
  return [...collected.values()];
}

// ---------------------------------------------------------------------------
// The seeded catalog
// ---------------------------------------------------------------------------

/** The pack a specifier most likely belongs to, for a not-found status. */
function packNameForSpecifier(specifier: string): string {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/");
    return name === undefined ? specifier : `${scope}/${name}`;
  }
  return specifier.split("/")[0] ?? specifier;
}

function toGraphFile(record: SandboxModuleRecord): SandboxModuleGraphFile {
  const dependencies = record.dependencies.map(
    (id) => parseSandboxGraphFileModuleId(id)?.fileId ?? id
  );
  return record.kind !== "wasm"
    ? {
        id: record.fileId,
        kind: "js",
        source: record.source,
        dependencies,
        internal: record.internal
      }
    : {
        id: record.fileId,
        kind: "wasm",
        bytes: record.bytes,
        dependencies,
        internal: record.internal
      };
}

/** A catalog that answers only from the records it was seeded with. */
export function createSeededSandboxModuleCatalog(
  records: readonly SandboxModuleRecord[]
): SandboxModuleCatalog {
  const byModuleId = new Map(records.map((record) => [record.moduleId, record]));

  const summaries: SandboxModuleSummary[] = records
    .filter((record) => parseSandboxGraphFileModuleId(record.moduleId) === undefined)
    .map((record) => ({
      specifier: record.moduleId,
      packName: record.packName,
      ...(record.packVersion === undefined
        ? {}
        : { packVersion: record.packVersion }),
      kind: record.kind
    }))
    .sort((left, right) => left.specifier.localeCompare(right.specifier));

  return {
    summaries: () => summaries,
    diagnostics: () => [],
    // A browser client consumes the delivery route; it is never a source for it.
    authorizeDelivery: (moduleId) =>
      Promise.resolve(
        sandboxDeliveryRefusal(
          "not-found",
          `Sandbox module ${moduleId} is not deliverable from a browser client.`
        )
      ),
    resolveForExecution: (declarations) => {
      const modules: ResolvedSandboxModule[] = [];
      const statuses: SandboxModuleStatus[] = [];
      const seen = new Set<string>();
      for (const declaration of declarations) {
        if (seen.has(declaration.specifier)) continue;
        seen.add(declaration.specifier);
        const entry = byModuleId.get(declaration.specifier);
        if (entry === undefined) {
          statuses.push({
            packName: packNameForSpecifier(declaration.specifier),
            specifier: declaration.specifier,
            status: "error",
            code: "module-not-found",
            message: `Sandbox module ${declaration.specifier} is not installed.`
          });
          continue;
        }
        if (
          declaration.resolvedPackVersion !== undefined &&
          declaration.resolvedPackVersion !== entry.packVersion
        ) {
          statuses.push({
            packName: entry.packName,
            specifier: declaration.specifier,
            status: "warning",
            code: "version-mismatch",
            message: `Sandbox module ${declaration.specifier} was saved with pack version ${declaration.resolvedPackVersion}, but ${entry.packVersion ?? "an unversioned pack"} is installed.`
          });
        }
        if (
          declaration.contentDigest !== undefined &&
          declaration.contentDigest !== entry.contentDigest
        ) {
          statuses.push({
            packName: entry.packName,
            specifier: declaration.specifier,
            status: "warning",
            code: "content-digest-mismatch",
            message: `Sandbox module ${declaration.specifier} has changed since the workflow was saved.`
          });
        }

        // The closure reachable from the entry, in graph-file terms. The entry
        // is part of its own graph (the guest loader links it from there).
        const graph: SandboxModuleGraphFile[] = [];
        const pending = [entry.moduleId];
        const reached = new Set<string>();
        for (let index = 0; index < pending.length; index += 1) {
          const id = pending[index];
          if (id === undefined || reached.has(id)) continue;
          reached.add(id);
          const record = byModuleId.get(id);
          if (record === undefined) {
            statuses.push({
              packName: entry.packName,
              specifier: declaration.specifier,
              status: "error",
              code: "module-unavailable",
              message: `Sandbox module ${declaration.specifier} is missing ${id}, which it imports.`
            });
            continue;
          }
          graph.push(toGraphFile(record));
          pending.push(...record.dependencies);
        }
        graph.sort((left, right) => left.id.localeCompare(right.id));

        const common = {
          specifier: declaration.specifier,
          packName: entry.packName,
          ...(entry.packVersion === undefined
            ? {}
            : { packVersion: entry.packVersion }),
          contentDigest: entry.contentDigest,
          moduleId: entry.fileId,
          graph
        };
        if (entry.kind === "js") {
          modules.push({ ...common, kind: "js", source: entry.source });
          continue;
        }
        // A host entry resolves to its id. Nothing else travels: the guest
        // facade and the dispatcher's allowlist both come from the protocol
        // registry, so a delivery cannot widen what an id means.
        if (entry.kind === "host") {
          modules.push({ ...common, kind: "host", hostId: entry.hostId, graph: [] });
          continue;
        }
        // A WASM entry without its call contract has nothing to build a facade
        // from, so it is unavailable rather than resolved without one.
        if (entry.wasm === undefined) {
          statuses.push({
            packName: entry.packName,
            specifier: declaration.specifier,
            status: "error",
            code: "module-unavailable",
            message: `Sandbox module ${declaration.specifier} was delivered without its WASM call contract.`
          });
          continue;
        }
        modules.push({
          ...common,
          kind: "wasm",
          bytes: entry.bytes,
          wasm: entry.wasm
        });
      }
      return { modules, statuses };
    }
  };
}

/**
 * Everything a run needs to import its declared modules: fetch the closure of
 * every specifier the graph declares, then seed a catalog with it.
 *
 * Resolves `null` when the graph declares nothing — the run then installs no
 * loader at all, exactly as it does on the server. Rejects when a module cannot
 * be fetched or fails its content check, so the caller can fail the job before
 * anything executes.
 */
export async function prepareSandboxModulesForGraph(
  graph: WorkflowGraph | null | undefined
): Promise<SandboxModuleRecord[] | null> {
  const declarations = collectSandboxModuleDeclarations(graph);
  if (declarations.length === 0) return null;
  return fetchSandboxModuleClosure(
    declarations.map((declaration) => declaration.specifier)
  );
}
