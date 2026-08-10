import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "acorn";
import {
  generateSandboxWasmFacade,
  normalizeSandboxSpecifier,
  parseWasmBinary,
  RESERVED_IDENTIFIERS,
  SANDBOX_WASM_FACADE_VERSION,
  SandboxModuleManifestSchema,
  SandboxPackManifestSchema,
  wasmExportContractViolation,
  WasmBinaryError,
  type ParsedWasmBinary,
  type SandboxModuleManifest,
  type SandboxPackManifest,
  type SandboxModuleStatus,
  type SandboxWasmContract
} from "@nodetool-ai/protocol";
export { normalizeSandboxSpecifier } from "@nodetool-ai/protocol";

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const ENCODED_PATH_CHARACTER = /%(?:2e|2f|5c)/i;
const JS_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Static resource limits enforced while discovering sandbox package artifacts. */
export const SANDBOX_PACKAGE_LIMITS = {
  authoredJsBytes: 256 * 1024,
  npmBundledJsBytes: 1024 * 1024,
  wasmBytes: 4 * 1024 * 1024,
  packBytes: 8 * 1024 * 1024,
  skillBytes: 16 * 1024
} as const;

/** One validated file in a discovered sandbox package's module graph. */
export interface SandboxDiscoveredFile {
  readonly id: string;
  readonly kind: "js" | "wasm";
  readonly source?: string;
  readonly bytes?: Uint8Array;
  readonly dependencies: readonly string[];
  readonly internal: boolean;
}

/** A public sandbox entry module discovered without executing pack code. */
export interface SandboxDiscoveredModule {
  readonly specifier: string;
  readonly kind: "js" | "wasm";
  readonly id: string;
  /** Digest of this public module and every transitive source it imports. */
  readonly digest: string;
  readonly file?: string;
  readonly npm?: string;
  readonly source?: string;
  readonly bytes?: Uint8Array;
  /** WASM modules only: the validated scalar call contract the host enforces. */
  readonly wasm?: SandboxWasmContract;
  readonly dependencies: readonly string[];
}

type UndigestedSandboxModule = Omit<SandboxDiscoveredModule, "digest"> & {
  readonly declaration: SandboxModuleManifest;
};

/** Validated sandbox artifacts and diagnostics read from one package directory. */
export interface SandboxPackDiscovery {
  readonly name: string;
  readonly version?: string;
  readonly dir: string;
  readonly modules: readonly SandboxDiscoveredModule[];
  /** Complete source graph, including transitive and internal files. */
  readonly graph: readonly SandboxDiscoveredFile[];
  readonly internal: readonly string[];
  readonly digest: string;
  readonly statuses: readonly SandboxModuleStatus[];
}

/** Raised when a sandbox package's static artifacts violate the discovery contract. */
export class SandboxPackDiscoveryError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SandboxPackDiscoveryError";
  }
}

type AstNode = {
  type: string;
  source?: { type: string; value?: unknown };
  name?: unknown;
  callee?: AstNode;
  [key: string]: unknown;
};

type StoredFile = {
  readonly path: string;
  readonly bytes: Buffer;
  readonly kind: "js" | "wasm";
  readonly specifier?: string;
};

/** Discover a single installed pack without importing or executing pack code. */
export function discoverSandboxPack(packDir: string): SandboxPackDiscovery | undefined {
  const dir = realpathOrThrow(packDir);
  const packageJsonPath = join(dir, "package.json");
  if (!existsSync(packageJsonPath) || !isRegularFile(packageJsonPath)) return undefined;

  const packageJson = readJson(packageJsonPath);
  const packageName = typeof packageJson.name === "string" ? packageJson.name : undefined;
  const nodetool = isRecord(packageJson.nodetool) ? packageJson.nodetool : undefined;
  if (nodetool === undefined || nodetool.sandboxModules === undefined) return undefined;
  if (packageName === undefined) {
    throw new SandboxPackDiscoveryError("sandbox pack has no valid package name");
  }

  const manifestResult = SandboxPackManifestSchema.safeParse({
    apiVersion: nodetool.apiVersion,
    sandboxModules: nodetool.sandboxModules,
    internal: nodetool.internal
  });
  if (!manifestResult.success) {
    throw new SandboxPackDiscoveryError(
      `${packageName}: invalid nodetool.sandboxModules manifest: ${manifestResult.error.message}`
    );
  }
  const manifest = manifestResult.data;
  if (manifest.sandboxModules.length === 0) return undefined;

  const statuses: SandboxModuleStatus[] = [];
  const files = new Map<string, StoredFile>();
  const normalizedInternal = manifest.internal.map((file) => normalizeRelativeId(file));
  const internalIds = new Set(normalizedInternal);
  for (const internal of manifest.internal) {
    const id = normalizeRelativeId(internal);
    if (!id.endsWith(".js")) {
      throw new SandboxPackDiscoveryError(`${packageName}: internal file must be JavaScript: ${internal}`);
    }
    addFile(dir, internal, "js", undefined, files);
  }

  const publicModules: UndigestedSandboxModule[] = [];
  for (const module of manifest.sandboxModules) {
    const specifier = normalizeSandboxSpecifier(packageName, module.name);
    if (module.kind === "js" && module.npm !== undefined) {
      statuses.push({
        packName: packageName,
        specifier,
        status: "skipped",
        code: "npm-module-unsupported",
        message: `npm module ${module.npm} is validated but requires the M3 compiler`
      });
      publicModules.push({ specifier, kind: "js", id: `npm:${module.npm}`, npm: module.npm, dependencies: [], declaration: module });
      continue;
    }
    const moduleFile = module.file;
    if (moduleFile === undefined) {
      throw new SandboxPackDiscoveryError(`${packageName}: module ${specifier} has no file`);
    }
    const normalizedModuleId = normalizeRelativeId(moduleFile);
    if (internalIds.has(normalizedModuleId)) {
      throw new SandboxPackDiscoveryError(`${packageName}: public module duplicates internal file ${moduleFile}`);
    }
    const id = addFile(dir, moduleFile, module.kind, specifier, files);
    const artifact = files.get(id);
    if (artifact === undefined) throw new SandboxPackDiscoveryError(`${packageName}: missing ${module.file}`);
    const contract = module.kind === "wasm"
      ? validateWasmModule(artifact.bytes, module, packageName, specifier)
      : undefined;
    publicModules.push({
      specifier,
      kind: module.kind,
      id,
      file: artifact.path,
      ...(module.kind === "js" ? { source: artifact.bytes.toString("utf8") } : { bytes: artifact.bytes }),
      ...(contract === undefined ? {} : { wasm: contract }),
      dependencies: [],
      declaration: module
    });
  }

  const dependenciesById = new Map<string, string[]>();
  const pending = [...files.keys()];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (id === undefined || dependenciesById.has(id)) continue;
    const artifact = files.get(id);
    if (artifact === undefined) throw new SandboxPackDiscoveryError(`${packageName}: missing module ${id}`);
    if (artifact.kind !== "js") {
      dependenciesById.set(id, []);
      continue;
    }
    const dependencies = inspectJavaScript(artifact.bytes.toString("utf8"), id, dir, files, packageName);
    dependenciesById.set(id, dependencies);
    for (const dependency of dependencies) {
      if (!pending.includes(dependency)) pending.push(dependency);
    }
  }
  const totalBytes = [...files.values()].reduce((sum, file) => sum + file.bytes.byteLength, 0);
  if (totalBytes > SANDBOX_PACKAGE_LIMITS.packBytes) {
    throw new SandboxPackDiscoveryError(`${packageName}: sandbox files exceed the ${SANDBOX_PACKAGE_LIMITS.packBytes} byte pack cap`);
  }
  assertAcyclic(dependenciesById, packageName);

  const version = typeof packageJson.version === "string" ? packageJson.version : undefined;
  const resolvedModules: SandboxDiscoveredModule[] = publicModules.map(({ declaration, ...module }) => ({
    ...module,
    dependencies: dependenciesById.get(module.id) ?? [],
    digest: module.npm === undefined
      ? computeModuleDigest({ ...module, declaration }, files, dependenciesById, packageName, version)
      : computeNpmPlaceholderDigest({ ...module, declaration }, packageName, version)
  }));
  const graph = [...files.entries()].map(([id, file]) => ({
    id,
    kind: file.kind,
    ...(file.kind === "js" ? { source: file.bytes.toString("utf8") } : { bytes: new Uint8Array(file.bytes) }),
    dependencies: dependenciesById.get(id) ?? [],
    internal: internalIds.has(id)
  })).sort(compareById);

  const skillCandidate = join(dir, "SKILL.md");
  if (!existsSync(skillCandidate)) {
    statuses.push({ packName: packageName, status: "warning", code: "skill-missing", message: "SKILL.md is missing; agent discoverability is disabled" });
  } else {
    let skill: Buffer | undefined;
    try {
      const skillPath = resolveContainedFile(dir, "SKILL.md");
      skill = readFileWithinLimit(skillPath, SANDBOX_PACKAGE_LIMITS.skillBytes);
    } catch {
      // SKILL.md is optional; read and containment failures only disable discoverability.
      skill = undefined;
    }
    if (skill === undefined || !isValidSkill(skill.toString("utf8"))) {
      statuses.push({ packName: packageName, status: "warning", code: "skill-invalid", message: "SKILL.md is invalid, unavailable, or exceeds the 16 KB cap; agent discoverability is disabled" });
    }
  }

  return {
    name: packageName,
    ...(version === undefined ? {} : { version }),
    dir,
    modules: resolvedModules,
    graph,
    internal: [...internalIds].sort(compareStrings),
    digest: computeDigest(resolvedModules, files, internalIds, manifest, packageName, version),
    statuses
  };
}

/** Discover sandbox modules from package directories without ambiguous pack ownership. */
export function discoverSandboxPacks(packageDirs: readonly string[]): SandboxPackDiscovery[] {
  const found = new Map<string, SandboxPackDiscovery>();
  for (const packageDir of packageDirs) {
    const discovery = discoverSandboxPack(packageDir);
    if (discovery === undefined) continue;
    if (found.has(discovery.name)) {
      throw new SandboxPackDiscoveryError(
        `duplicate sandbox package discovery: ${discovery.name}`
      );
    }
    found.set(discovery.name, discovery);
  }
  return [...found.values()];
}

/** Compute the canonical digest for a complete sandbox package graph. */
export function computeSandboxModuleGraphDigest(
  modules: readonly SandboxDiscoveredModule[],
  files: ReadonlyMap<string, { bytes: Uint8Array; kind?: "js" | "wasm" }>,
  internal: ReadonlySet<string>,
  metadata?: { manifest?: SandboxPackManifest; packageName?: string; packageVersion?: string }
): string {
  return computeDigest(modules, files, internal, metadata?.manifest, metadata?.packageName, metadata?.packageVersion);
}

function computeDigest(
  modules: readonly SandboxDiscoveredModule[],
  files: ReadonlyMap<string, { bytes: Uint8Array; kind?: "js" | "wasm" }>,
  internal: ReadonlySet<string>,
  manifest: SandboxPackManifest | undefined,
  packageName: string | undefined,
  packageVersion: string | undefined
): string {
  const publicById = new Map(modules.filter((module) => !module.id.startsWith("npm:")).map((module) => [module.id, module]));
  const entries = [...files.entries()].map(([id, file]) => {
    const module = publicById.get(id);
    return {
      id,
      kind: file.kind ?? "js",
      specifier: module?.specifier,
      dependencies: module === undefined ? [] : [...module.dependencies].sort(compareStrings),
      internal: internal.has(id),
      bytes: bytesDigest(file.bytes)
    };
  }).sort(compareById);
  const manifestMetadata = manifest === undefined ? undefined : {
    apiVersion: manifest.apiVersion,
    internal: [...manifest.internal].sort(compareStrings),
    sandboxModules: [...manifest.sandboxModules].sort((left, right) => compareStrings(left.name, right.name)).map((module) =>
      module.kind === "js"
        ? { name: module.name, kind: module.kind, file: module.file, npm: module.npm }
        : { name: module.name, kind: module.kind, file: module.file, memoryPagesMax: module.memoryPagesMax, limits: module.limits, exports: [...module.exports].sort(compareExportNames) }
    )
  };
  return createHash("sha256").update(JSON.stringify({ packageName, packageVersion, manifest: manifestMetadata, entries })).digest("hex");
}

function computeModuleDigest(
  module: UndigestedSandboxModule,
  files: ReadonlyMap<string, { bytes: Uint8Array; kind?: "js" | "wasm" }>,
  dependenciesById: ReadonlyMap<string, readonly string[]>,
  packageName: string,
  packageVersion: string | undefined
): string {
  const pending = [module.id];
  const reachable = new Set<string>();
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (id === undefined || reachable.has(id)) continue;
    reachable.add(id);
    pending.push(...(dependenciesById.get(id) ?? []));
  }
  const entries = [...reachable].map((id) => {
    const file = files.get(id);
    if (file === undefined) {
      throw new SandboxPackDiscoveryError(`${packageName}: missing sandbox graph file ${id}`);
    }
    return {
      id,
      kind: file.kind ?? "js",
      dependencies: [...(dependenciesById.get(id) ?? [])].sort(compareStrings),
      bytes: bytesDigest(file.bytes)
    };
  }).sort(compareById);
  return createHash("sha256").update(JSON.stringify({
    packageName,
    packageVersion,
    specifier: module.specifier,
    moduleId: module.id,
    kind: module.kind,
    declaration: moduleDigestDeclaration(module.declaration),
    // A WASM module's guest surface is generated, so the generator is part of
    // what the digest pins: regenerate the facade differently and a workflow's
    // saved digest stops matching, exactly as a changed binary would.
    ...(module.wasm === undefined ? {} : {
      facadeVersion: SANDBOX_WASM_FACADE_VERSION,
      facade: generateSandboxWasmFacade(module.specifier, module.wasm)
    }),
    entries
  })).digest("hex");
}

function computeNpmPlaceholderDigest(
  module: UndigestedSandboxModule,
  packageName: string,
  packageVersion: string | undefined
): string {
  return createHash("sha256").update(JSON.stringify({
    packageName,
    packageVersion,
    specifier: module.specifier,
    npm: module.npm,
    declaration: moduleDigestDeclaration(module.declaration)
  })).digest("hex");
}

function moduleDigestDeclaration(module: SandboxModuleManifest): object {
  if (module.kind === "js") {
    return { name: module.name, kind: module.kind, file: module.file, npm: module.npm };
  }
  return {
    name: module.name,
    kind: module.kind,
    file: module.file,
    memoryPagesMax: module.memoryPagesMax,
    limits: module.limits,
    exports: [...module.exports].sort(compareExportNames)
  };
}

function bytesDigest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function addFile(packDir: string, relativeFile: string, kind: "js" | "wasm", specifier: string | undefined, files: Map<string, StoredFile>): string {
  const id = normalizeRelativeId(relativeFile);
  const path = resolveContainedFile(packDir, relativeFile);
  const limit = kind === "js" ? SANDBOX_PACKAGE_LIMITS.authoredJsBytes : SANDBOX_PACKAGE_LIMITS.wasmBytes;
  const bytes = readRequiredFileWithinLimit(path, limit, `${id}: ${kind} module cap`);
  const existing = files.get(id);
  if (existing !== undefined) {
    throw new SandboxPackDiscoveryError(`${id}: duplicate sandbox file`);
  }
  files.set(id, { path, bytes, kind, ...(specifier === undefined ? {} : { specifier }) });
  return id;
}

function inspectJavaScript(source: string, moduleId: string, packDir: string, files: Map<string, StoredFile>, packageName: string): string[] {
  let parsed: unknown;
  try {
    parsed = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: invalid JavaScript`, { cause: error });
  }
  const dependencies: string[] = [];
  walkAst(parsed, (node) => {
    if (node.type === "ImportExpression") throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: dynamic import() is not allowed`);
    if (node.type === "CallExpression" && node.callee?.type === "Identifier" && node.callee.name === "require") {
      throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: require() is not allowed`);
    }
    if (node.type !== "ImportDeclaration" && node.type !== "ExportNamedDeclaration" && node.type !== "ExportAllDeclaration") return;
    const value = node.source?.value;
    if (typeof value !== "string") return;
    if (!value.startsWith(".")) throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: import outside the pack: ${value}`);
    const packRoot = realpathOrThrow(packDir);
    const importedCandidate = resolve(packRoot, dirname(moduleId), value);
    if (importedCandidate !== packRoot && !importedCandidate.startsWith(`${packRoot}${sep}`)) { // key-boundary-ok: `${sep}` anchors this filesystem containment boundary.
      throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: import escapes the package: ${value}`);
    }
    const importedId = normalizeRelativeId(relative(packRoot, importedCandidate));
    const imported = files.get(importedId);
    if (imported === undefined) {
      throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: imported file ${value} is not declared as a public or internal file`);
    } else if (imported.kind !== "js") {
      throw new SandboxPackDiscoveryError(`${packageName}/${moduleId}: JS import targets non-JS module ${value}`);
    }
    if (!dependencies.includes(importedId)) dependencies.push(importedId);
  });
  return dependencies.sort(compareStrings);
}

/**
 * Validate a WASM binary against its manifest and return the call contract.
 *
 * Every rejection names the export and the rule it broke — "is a memory, not a
 * function", "uses i64, which maps to bigint rather than number" — so a pack
 * author is told what to change, not that something is unsupported.
 */
function validateWasmModule(bytes: Uint8Array, manifest: Extract<SandboxModuleManifest, { kind: "wasm" }>, packageName: string, specifier: string): SandboxWasmContract {
  const validationBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(validationBuffer).set(bytes);
  if (!WebAssembly.validate(validationBuffer)) throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: invalid WASM binary`);
  let module: ParsedWasmBinary;
  try {
    module = parseWasmBinary(bytes);
  } catch (error) {
    if (error instanceof WasmBinaryError) {
      throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: ${error.message}`, { cause: error });
    }
    throw error;
  }
  if (module.importCount !== 0) throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: WASM imports are not allowed`);
  for (const memory of module.memories) {
    if (memory.shared || memory.maximum === undefined) throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: every WASM memory must be unshared and declare a maximum`);
    if (memory.maximum < memory.minimum || memory.maximum > manifest.memoryPagesMax || memory.maximum > 4096) throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: memory maximum exceeds the declared or host ceiling`);
  }
  const exports = manifest.exports.map((exported) => {
    const wasmName = typeof exported === "string" ? exported : exported.wasm;
    const alias = typeof exported === "string" ? exported : exported.as;
    // The manifest schema already holds this, but discovery is its own
    // enforcement point: a binary export that is not an identifier must be
    // renamed with `{ "wasm": …, "as": … }`, and the alias must be one.
    if (!JS_IDENTIFIER.test(alias) || RESERVED_IDENTIFIERS.has(alias)) {
      throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: export ${wasmName} is exposed as "${alias}", which is not a usable JavaScript identifier — map it with { "wasm": "${wasmName}", "as": "<identifier>" }`);
    }
    const entry = module.exports.get(wasmName);
    const violation = wasmExportContractViolation(entry, entry === undefined ? undefined : module.functions[entry.index]);
    if (violation !== undefined) {
      throw new SandboxPackDiscoveryError(`${packageName}/${specifier}: export ${wasmName} ${violation}`);
    }
    return { wasm: wasmName, as: alias };
  });
  return {
    memoryPagesMax: manifest.memoryPagesMax,
    exports,
    ...(manifest.limits === undefined ? {} : { limits: manifest.limits })
  };
}

function walkAst(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) { for (const item of value) walkAst(item, visit); return; }
  if (!isRecord(value)) return;
  if (typeof value.type === "string") visit(value as AstNode);
  for (const child of Object.values(value)) walkAst(child, visit);
}

function assertAcyclic(graph: ReadonlyMap<string, readonly string[]>, packageName: string): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new SandboxPackDiscoveryError(`${packageName}: internal module cycle includes ${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of graph.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

function resolveContainedFile(packDir: string, relativeFile: string): string {
  const root = realpathOrThrow(packDir);
  const candidate = resolve(root, relativeFile);
  const resolved = realpathOrThrow(candidate);
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) throw new SandboxPackDiscoveryError(`${relativeFile}: file escapes the package directory`); // key-boundary-ok: `${sep}` anchors this filesystem containment boundary.
  assertNoSymlink(root, candidate);
  return resolved;
}

function assertNoSymlink(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);
  let current = root;
  for (const part of relativePath.split(sep)) {
    if (part.length === 0) continue;
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new SandboxPackDiscoveryError(`${relativePath}: symlinks are not allowed in sandbox modules`);
  }
}

function normalizeRelativeId(file: string): string {
  const normalized = file.replaceAll("\\", "/");
  if (CONTROL_CHARACTERS.test(normalized) || ENCODED_PATH_CHARACTER.test(normalized) || normalized.startsWith("/") || normalized.split("/").some((part) => part === ".." || part.length === 0)) {
    throw new SandboxPackDiscoveryError(`${file}: invalid package-relative path`);
  }
  const id = normalized.split("/").filter((part) => part !== ".").join("/");
  if (id.length === 0) throw new SandboxPackDiscoveryError(`${file}: invalid package-relative path`);
  return id;
}

function realpathOrThrow(path: string): string {
  try { return realpathSync(path); } catch (error) { throw new SandboxPackDiscoveryError(`sandbox path does not exist: ${path}`, { cause: error }); }
}

function readFileOrThrow(path: string): Buffer {
  try { return readFileSync(path); } catch (error) { throw new SandboxPackDiscoveryError(`cannot read sandbox file: ${path}`, { cause: error }); }
}

function readFileWithinLimit(path: string, limit: number, description?: string): Buffer | undefined {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    throw new SandboxPackDiscoveryError(`cannot stat sandbox file: ${path}`, { cause: error });
  }
  if (size > limit) {
    if (description !== undefined) {
      throw new SandboxPackDiscoveryError(`${description} exceeds the ${limit} byte limit`);
    }
    return undefined;
  }
  const bytes = readFileOrThrow(path);
  if (bytes.byteLength > limit) {
    if (description !== undefined) {
      throw new SandboxPackDiscoveryError(`${description} exceeds the ${limit} byte limit`);
    }
    return undefined;
  }
  return bytes;
}

function readRequiredFileWithinLimit(path: string, limit: number, description: string): Buffer {
  const bytes = readFileWithinLimit(path, limit, description);
  if (bytes === undefined) {
    throw new SandboxPackDiscoveryError(`${description} is unavailable`);
  }
  return bytes;
}

function isRegularFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    // An unreadable or missing candidate is not a package file.
    return false;
  }
}

function readJson(path: string): Record<string, unknown> {
  try { const value: unknown = JSON.parse(readFileSync(path, "utf8")); if (!isRecord(value)) throw new Error("package.json must be an object"); return value; } catch (error) { throw new SandboxPackDiscoveryError(`invalid package.json: ${error instanceof Error ? error.message : String(error)}`, { cause: error }); }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isValidSkill(source: string): boolean { if (!source.startsWith("---\n")) return false; const end = source.indexOf("\n---", 4); if (end < 0) return false; return source.slice(4, end).split("\n").every((line) => line.length === 0 || /^[A-Za-z][A-Za-z0-9_-]*:\s*[^\n]*$/.test(line)); }
function compareStrings(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function compareExportNames(left: string | { wasm: string; as: string }, right: string | { wasm: string; as: string }): number {
  const leftName = typeof left === "string" ? left : left.wasm;
  const rightName = typeof right === "string" ? right : right.wasm;
  return compareStrings(leftName, rightName);
}
function compareById<T extends { id: string }>(left: T, right: T): number { return compareStrings(left.id, right.id); }

/** Parse one untrusted sandbox-module declaration at the package boundary. */
export function sandboxModuleManifest(value: unknown): SandboxModuleManifest { return SandboxModuleManifestSchema.parse(value); }
