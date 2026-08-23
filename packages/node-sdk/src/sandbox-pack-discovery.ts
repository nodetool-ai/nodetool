import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parse } from "acorn";
import { isString } from "./type-predicates.js";
import {
  generateSandboxHostFacade,
  generateSandboxWasmFacade,
  normalizeSandboxSpecifier,
  sandboxHostModule,
  sandboxHostModuleViolation,
  SANDBOX_HOST_FACADE_VERSION,
  parseSkillDocument,
  parseWasmBinary,
  skillSections,
  RESERVED_IDENTIFIERS,
  SANDBOX_CAPABILITY_PACK,
  SANDBOX_WASM_FACADE_VERSION,
  SandboxModuleManifestSchema,
  SandboxPackManifestSchema,
  wasmExportContractViolation,
  WasmBinaryError,
  type ParsedWasmBinary,
  type SandboxModuleManifest,
  type SandboxPackManifest,
  type SandboxPackSkill,
  type SandboxModuleStatus,
  type SandboxWasmContract
} from "@nodetool-ai/protocol";
import {
  npmModuleId,
  type SandboxCompiledNpmArtifact,
  type SandboxCompiledNpmLookup
} from "./sandbox-npm-artifacts.js";
export { normalizeSandboxSpecifier } from "@nodetool-ai/protocol";
export {
  npmModuleId,
  isNpmModuleId,
  type SandboxCompiledNpmArtifact,
  type SandboxCompiledNpmLookup,
  type SandboxNpmCompileOutcome,
  type SandboxNpmCompileRequest
} from "./sandbox-npm-artifacts.js";

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

/** The id a host module carries in a pack's module table. Never a file path. */
export function hostModuleId(hostId: string): string {
  return `host:${hostId}`;
}

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
  readonly kind: "js" | "wasm" | "host";
  readonly id: string;
  /** Digest of this public module and every transitive source it imports. */
  readonly digest: string;
  readonly file?: string;
  readonly npm?: string;
  readonly source?: string;
  readonly bytes?: Uint8Array;
  /** WASM modules only: the validated scalar call contract the host enforces. */
  readonly wasm?: SandboxWasmContract;
  /** Host modules only: the registry id whose implementation serves the calls. */
  readonly hostId?: string;
  readonly dependencies: readonly string[];
}

/** The same shape with its `readonly` modifiers dropped, for step-by-step construction. */
type Mutable<T> = { -readonly [K in keyof T]: T[K] };

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
  /**
   * The pack's parsed SKILL.md, absent when it is missing or does not parse.
   * A skill is documentation: a frontmatter typo is a warning, never a reason
   * to withhold modules that are otherwise valid.
   */
  readonly skill?: SandboxPackSkill;
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
  readonly path?: string;
  readonly bytes: Buffer;
  readonly kind: "js" | "wasm";
  readonly specifier?: string;
};

/** Host-supplied input discovery cannot produce on its own. */
export interface SandboxPackDiscoveryOptions {
  /**
   * Compiled npm artifacts, keyed by pack and dependency name.
   *
   * Discovery stays synchronous and engine-free: it never runs esbuild and
   * never starts QuickJS. A host that already compiled injects the results
   * here; without them an npm entry is reported as `pending-compile`.
   */
  readonly compiled?: SandboxCompiledNpmLookup;
}

/** Discover a single installed pack without importing or executing pack code. */
export function discoverSandboxPack(
  packDir: string,
  options: SandboxPackDiscoveryOptions = {}
): SandboxPackDiscovery | undefined {
  const dir = realpathOrThrow(packDir);
  const packageJsonPath = join(dir, "package.json");
  if (!existsSync(packageJsonPath) || !isRegularFile(packageJsonPath))
    return undefined;

  const packageJson = readJson(packageJsonPath);
  const packageName = isString(packageJson.name) ? packageJson.name : undefined;
  const nodetool = isRecord(packageJson.nodetool)
    ? packageJson.nodetool
    : undefined;
  if (nodetool === undefined || nodetool.sandboxModules === undefined)
    return undefined;
  if (packageName === undefined) {
    throw new SandboxPackDiscoveryError(
      "sandbox pack has no valid package name"
    );
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
  const normalizedInternal = manifest.internal.map((file) =>
    normalizeRelativeId(file)
  );
  const internalIds = new Set(normalizedInternal);
  for (const internal of manifest.internal) {
    const id = normalizeRelativeId(internal);
    if (!id.endsWith(".js")) {
      throw new SandboxPackDiscoveryError(
        `${packageName}: internal file must be JavaScript: ${internal}`
      );
    }
    addFile(dir, internal, "js", undefined, files);
  }

  const publicModules: UndigestedSandboxModule[] = [];
  const npmArtifacts = new Map<string, SandboxCompiledNpmArtifact>();
  for (const module of manifest.sandboxModules) {
    const specifier = normalizeSandboxSpecifier(packageName, module.name);
    if (module.kind === "js" && module.npm !== undefined) {
      const id = npmModuleId(module.npm);
      const outcome = options.compiled?.({
        packName: packageName,
        packDir: dir,
        specifier,
        npmName: module.npm
      });
      const pending: UndigestedSandboxModule = {
        specifier,
        kind: "js",
        id,
        npm: module.npm,
        dependencies: [],
        declaration: module
      };
      if (outcome === undefined) {
        statuses.push({
          packName: packageName,
          specifier,
          status: "skipped",
          code: "pending-compile",
          message: `npm module ${module.npm} is not compiled yet; run \`nodetool packs compile\` to build it`
        });
        publicModules.push(pending);
        continue;
      }
      if (outcome.status === "skipped") {
        statuses.push({
          packName: packageName,
          specifier,
          status: "skipped",
          code: outcome.code,
          message: outcome.message
        });
        publicModules.push(pending);
        continue;
      }
      const source = outcome.artifact.source;
      const bytes = Buffer.from(source, "utf8");
      if (bytes.byteLength > SANDBOX_PACKAGE_LIMITS.npmBundledJsBytes) {
        statuses.push({
          packName: packageName,
          specifier,
          status: "skipped",
          code: "npm-module-too-large",
          message: `npm module ${module.npm} compiles to ${bytes.byteLength} bytes, over the ${SANDBOX_PACKAGE_LIMITS.npmBundledJsBytes} byte cap`
        });
        publicModules.push(pending);
        continue;
      }
      if (files.has(id)) {
        throw new SandboxPackDiscoveryError(
          `${packageName}: duplicate npm module ${module.npm}`
        );
      }
      files.set(id, { bytes, kind: "js", specifier });
      npmArtifacts.set(id, outcome.artifact);
      for (const warning of outcome.warnings ?? []) {
        statuses.push({
          packName: packageName,
          specifier,
          status: "warning",
          code: "npm-module-warning",
          message: warning
        });
      }
      statuses.push({
        packName: packageName,
        specifier,
        status: "ready",
        code: "npm-module-compiled",
        message: `npm module ${module.npm} compiled to ${bytes.byteLength} bytes`
      });
      publicModules.push({ ...pending, source });
      continue;
    }
    if (module.kind === "host") {
      // The trust rule, enforced where a manifest first meets NodeTool: an id
      // that is not in the registry, or one claimed by a package the registry
      // does not pin it to, never becomes a module. A pack ships no code for a
      // host module, so there is nothing else to read.
      const violation = sandboxHostModuleViolation(packageName, module.host);
      if (violation !== undefined) {
        throw new SandboxPackDiscoveryError(
          `${packageName}/${specifier}: ${violation}`
        );
      }
      const spec = sandboxHostModule(module.host);
      if (spec === undefined) {
        throw new SandboxPackDiscoveryError(
          `${packageName}/${specifier}: unknown host module`
        );
      }
      publicModules.push({
        specifier,
        kind: "host",
        id: hostModuleId(module.host),
        hostId: module.host,
        // The generated facade is the module's whole guest-visible surface, so
        // it is both what delivery serves and what the digest is over.
        source: generateSandboxHostFacade(specifier, spec),
        dependencies: [],
        declaration: module
      });
      continue;
    }
    const moduleFile = module.file;
    if (moduleFile === undefined) {
      throw new SandboxPackDiscoveryError(
        `${packageName}: module ${specifier} has no file`
      );
    }
    const normalizedModuleId = normalizeRelativeId(moduleFile);
    if (internalIds.has(normalizedModuleId)) {
      throw new SandboxPackDiscoveryError(
        `${packageName}: public module duplicates internal file ${moduleFile}`
      );
    }
    const id = addFile(dir, moduleFile, module.kind, specifier, files);
    const artifact = files.get(id);
    if (artifact === undefined)
      throw new SandboxPackDiscoveryError(
        `${packageName}: missing ${module.file}`
      );
    const contract =
      module.kind === "wasm"
        ? validateWasmModule(artifact.bytes, module, packageName, specifier)
        : undefined;
    type PublicModuleFields = Mutable<UndigestedSandboxModule>;
    const publicModule: PublicModuleFields = {
      specifier,
      kind: module.kind,
      id,
      file: artifact.path,
      dependencies: [],
      declaration: module
    };
    if (module.kind === "js") {
      publicModule.source = artifact.bytes.toString("utf8");
    } else {
      publicModule.bytes = artifact.bytes;
    }
    if (contract !== undefined) {
      publicModule.wasm = contract;
    }
    publicModules.push(publicModule);
  }

  const dependenciesById = new Map<string, string[]>();
  const pending = [...files.keys()];
  for (let index = 0; index < pending.length; index += 1) {
    const id = pending[index];
    if (id === undefined || dependenciesById.has(id)) continue;
    const artifact = files.get(id);
    if (artifact === undefined)
      throw new SandboxPackDiscoveryError(
        `${packageName}: missing module ${id}`
      );
    // A compiled npm bundle is a self-contained leaf: the compiler already
    // proved it resolves nothing, with a stricter scope-aware analysis than the
    // authored-file scan below.
    if (artifact.kind !== "js" || npmArtifacts.has(id)) {
      dependenciesById.set(id, []);
      continue;
    }
    const dependencies = inspectJavaScript(
      artifact.bytes.toString("utf8"),
      id,
      dir,
      files,
      packageName
    );
    dependenciesById.set(id, dependencies);
    for (const dependency of dependencies) {
      if (!pending.includes(dependency)) pending.push(dependency);
    }
  }
  const totalBytes = [...files.values()].reduce(
    (sum, file) => sum + file.bytes.byteLength,
    0
  );
  if (totalBytes > SANDBOX_PACKAGE_LIMITS.packBytes) {
    throw new SandboxPackDiscoveryError(
      `${packageName}: sandbox files exceed the ${SANDBOX_PACKAGE_LIMITS.packBytes} byte pack cap`
    );
  }
  assertAcyclic(dependenciesById, packageName);

  const version = isString(packageJson.version)
    ? packageJson.version
    : undefined;
  const resolvedModules: SandboxDiscoveredModule[] = publicModules.map(
    ({ declaration, ...module }) => {
      const artifact = npmArtifacts.get(module.id);
      if (module.kind === "host") {
        return {
          ...module,
          dependencies: [],
          digest: computeHostDigest(
            { ...module, declaration },
            packageName,
            version
          )
        };
      }
      return {
        ...module,
        dependencies: dependenciesById.get(module.id) ?? [],
        digest:
          module.npm === undefined
            ? computeModuleDigest(
                { ...module, declaration },
                files,
                dependenciesById,
                packageName,
                version
              )
            : artifact === undefined
              ? computeNpmPlaceholderDigest(
                  { ...module, declaration },
                  packageName,
                  version
                )
              : computeNpmCompiledDigest(
                  { ...module, declaration },
                  artifact,
                  packageName,
                  version
                )
      };
    }
  );
  const graph = [...files.entries()]
    .map(([id, file]) => ({
      id,
      kind: file.kind,
      ...(file.kind === "js"
        ? { source: file.bytes.toString("utf8") }
        : { bytes: new Uint8Array(file.bytes) }),
      dependencies: dependenciesById.get(id) ?? [],
      internal: internalIds.has(id)
    }))
    .sort(compareById);

  const skillCandidate = join(dir, "SKILL.md");
  let skill: SandboxPackSkill | undefined;
  if (!existsSync(skillCandidate)) {
    statuses.push({
      packName: packageName,
      status: "warning",
      code: "skill-missing",
      message: "SKILL.md is missing; agent discoverability is disabled"
    });
  } else {
    let source: Buffer | undefined;
    try {
      const skillPath = resolveContainedFile(dir, "SKILL.md");
      source = readFileWithinLimit(
        skillPath,
        SANDBOX_PACKAGE_LIMITS.skillBytes
      );
    } catch {
      // SKILL.md is optional; read and containment failures only disable discoverability.
      source = undefined;
    }
    skill =
      source === undefined
        ? undefined
        : parseSandboxPackSkill(source.toString("utf8"));
    if (skill === undefined) {
      statuses.push({
        packName: packageName,
        status: "warning",
        code: "skill-invalid",
        message:
          "SKILL.md is invalid, unavailable, or exceeds the 16 KB cap; agent discoverability is disabled"
      });
    }
  }

  type DiscoveryFields = Mutable<SandboxPackDiscovery>;
  const discovery: DiscoveryFields = {
    name: packageName,
    dir,
    modules: resolvedModules,
    graph,
    internal: [...internalIds].sort(compareStrings),
    digest: computeDigest(
      resolvedModules,
      files,
      internalIds,
      manifest,
      packageName,
      version,
      npmArtifacts
    ),
    statuses
  };
  if (version !== undefined) {
    discovery.version = version;
  }
  if (skill !== undefined) {
    discovery.skill = skill;
  }
  return discovery;
}

/** Parse a pack's SKILL.md with the skill system's own rules. */
function parseSandboxPackSkill(source: string): SandboxPackSkill | undefined {
  const document = parseSkillDocument(source);
  if (document === null) return undefined;
  return {
    name: document.name,
    description: document.description,
    body: document.instructions,
    sections: skillSections(document.instructions)
  };
}

/** Discover sandbox modules from package directories without ambiguous pack ownership. */
export function discoverSandboxPacks(
  packageDirs: readonly string[],
  options: SandboxPackDiscoveryOptions = {}
): SandboxPackDiscovery[] {
  const found = new Map<string, SandboxPackDiscovery>();
  for (const packageDir of packageDirs) {
    const discovery = discoverSandboxPack(packageDir, options);
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
  metadata?: {
    manifest?: SandboxPackManifest;
    packageName?: string;
    packageVersion?: string;
    /** Compiler identity per compiled npm module id, keyed by graph id. */
    npmArtifacts?: ReadonlyMap<string, SandboxCompiledNpmArtifact>;
  }
): string {
  return computeDigest(
    modules,
    files,
    internal,
    metadata?.manifest,
    metadata?.packageName,
    metadata?.packageVersion,
    metadata?.npmArtifacts
  );
}

function computeDigest(
  modules: readonly SandboxDiscoveredModule[],
  files: ReadonlyMap<string, { bytes: Uint8Array; kind?: "js" | "wasm" }>,
  internal: ReadonlySet<string>,
  manifest: SandboxPackManifest | undefined,
  packageName: string | undefined,
  packageVersion: string | undefined,
  npmArtifacts?: ReadonlyMap<string, SandboxCompiledNpmArtifact>
): string {
  // An npm module without a compiled artifact has no file in the graph, so it
  // cannot contribute an entry; one with an artifact is a file like any other.
  const publicById = new Map(
    modules
      .filter((module) => files.has(module.id))
      .map((module) => [module.id, module])
  );
  const compiled = [...(npmArtifacts?.entries() ?? [])]
    .map(([id, artifact]) => ({
      id,
      compilerVersion: artifact.compilerVersion,
      optionsDigest: artifact.optionsDigest,
      inputsDigest: artifact.inputsDigest
    }))
    .sort(compareById);
  const entries = [...files.entries()]
    .map(([id, file]) => {
      const module = publicById.get(id);
      return {
        id,
        kind: file.kind ?? "js",
        specifier: module?.specifier,
        dependencies:
          module === undefined
            ? []
            : [...module.dependencies].sort(compareStrings),
        internal: internal.has(id),
        bytes: bytesDigest(file.bytes)
      };
    })
    .sort(compareById);
  const manifestMetadata =
    manifest === undefined
      ? undefined
      : {
          apiVersion: manifest.apiVersion,
          internal: [...manifest.internal].sort(compareStrings),
          sandboxModules: [...manifest.sandboxModules]
            .sort((left, right) => compareStrings(left.name, right.name))
            .map((module) => moduleDigestDeclaration(module))
        };
  return createHash("sha256")
    .update(
      JSON.stringify({
        packageName,
        packageVersion,
        manifest: manifestMetadata,
        entries,
        compiled
      })
    )
    .digest("hex");
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
  const entries = [...reachable]
    .map((id) => {
      const file = files.get(id);
      if (file === undefined) {
        throw new SandboxPackDiscoveryError(
          `${packageName}: missing sandbox graph file ${id}`
        );
      }
      return {
        id,
        kind: file.kind ?? "js",
        dependencies: [...(dependenciesById.get(id) ?? [])].sort(
          compareStrings
        ),
        bytes: bytesDigest(file.bytes)
      };
    })
    .sort(compareById);
  type PayloadFields = {
    packageName: string | undefined;
    packageVersion: string | undefined;
    specifier: string;
    moduleId: string;
    kind: string;
    declaration: unknown;
    facadeVersion?: number;
    facade?: string;
    entries: typeof entries;
  };
  const payload: PayloadFields = {
    packageName,
    packageVersion,
    specifier: module.specifier,
    moduleId: module.id,
    kind: module.kind,
    declaration: moduleDigestDeclaration(module.declaration),
    entries
  };
  // A WASM module's guest surface is generated, so the generator is part of
  // what the digest pins: regenerate the facade differently and a workflow's
  // saved digest stops matching, exactly as a changed binary would.
  if (module.wasm !== undefined) {
    payload.facadeVersion = SANDBOX_WASM_FACADE_VERSION;
    payload.facade = generateSandboxWasmFacade(module.specifier, module.wasm);
  }
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

/**
 * Digest for an npm module that has a compiled artifact.
 *
 * The bundled source is what the guest evaluates, so it is what the digest is
 * over — plus the compiler's version and options digest, because the same
 * package version compiled under different resolver conditions is a different
 * module. A saved workflow whose pack was recompiled therefore reports drift
 * instead of quietly running different code.
 */
function computeNpmCompiledDigest(
  module: UndigestedSandboxModule,
  artifact: SandboxCompiledNpmArtifact,
  packageName: string,
  packageVersion: string | undefined
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        packageName,
        packageVersion,
        specifier: module.specifier,
        moduleId: module.id,
        npm: module.npm,
        declaration: moduleDigestDeclaration(module.declaration),
        compilerVersion: artifact.compilerVersion,
        optionsDigest: artifact.optionsDigest,
        inputsDigest: artifact.inputsDigest,
        source: createHash("sha256").update(artifact.source).digest("hex")
      })
    )
    .digest("hex");
}

/**
 * Digest for a host module.
 *
 * A host module ships no bytes, so what versions it is the surface the guest
 * sees: the registry id, the export list behind it, and the facade generator.
 * Drop an export from the registry and every workflow that pinned this digest
 * reports drift, which is the point — the guest surface really did change.
 */
function computeHostDigest(
  module: UndigestedSandboxModule,
  packageName: string,
  packageVersion: string | undefined
): string {
  const spec =
    module.hostId === undefined ? undefined : sandboxHostModule(module.hostId);
  return createHash("sha256")
    .update(
      JSON.stringify({
        packageName,
        packageVersion,
        specifier: module.specifier,
        moduleId: module.id,
        hostId: module.hostId,
        exports: [...(spec?.exports ?? [])].sort(compareStrings),
        facadeVersion: SANDBOX_HOST_FACADE_VERSION,
        facade: module.source
      })
    )
    .digest("hex");
}

function computeNpmPlaceholderDigest(
  module: UndigestedSandboxModule,
  packageName: string,
  packageVersion: string | undefined
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        packageName,
        packageVersion,
        specifier: module.specifier,
        npm: module.npm,
        declaration: moduleDigestDeclaration(module.declaration)
      })
    )
    .digest("hex");
}

function moduleDigestDeclaration(module: SandboxModuleManifest): object {
  if (module.kind === "js") {
    return {
      name: module.name,
      kind: module.kind,
      file: module.file,
      npm: module.npm
    };
  }
  if (module.kind === "host") {
    return { name: module.name, kind: module.kind, host: module.host };
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

function addFile(
  packDir: string,
  relativeFile: string,
  kind: "js" | "wasm",
  specifier: string | undefined,
  files: Map<string, StoredFile>
): string {
  const id = normalizeRelativeId(relativeFile);
  const path = resolveContainedFile(packDir, relativeFile);
  const limit =
    kind === "js"
      ? SANDBOX_PACKAGE_LIMITS.authoredJsBytes
      : SANDBOX_PACKAGE_LIMITS.wasmBytes;
  const bytes = readRequiredFileWithinLimit(
    path,
    limit,
    `${id}: ${kind} module cap`
  );
  const existing = files.get(id);
  if (existing !== undefined) {
    throw new SandboxPackDiscoveryError(`${id}: duplicate sandbox file`);
  }
  type StoredFields = Mutable<StoredFile>;
  const stored: StoredFields = { path, bytes, kind };
  if (specifier !== undefined) {
    stored.specifier = specifier;
  }
  files.set(id, stored);
  return id;
}

function inspectJavaScript(
  source: string,
  moduleId: string,
  packDir: string,
  files: Map<string, StoredFile>,
  packageName: string
): string[] {
  let parsed: unknown;
  try {
    parsed = parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new SandboxPackDiscoveryError(
      `${packageName}/${moduleId}: invalid JavaScript`,
      { cause: error }
    );
  }
  const dependencies: string[] = [];
  walkAst(parsed, (node) => {
    if (node.type === "ImportExpression")
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: dynamic import() is not allowed`
      );
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === "require"
    ) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: require() is not allowed`
      );
    }
    if (
      node.type !== "ImportDeclaration" &&
      node.type !== "ExportNamedDeclaration" &&
      node.type !== "ExportAllDeclaration"
    )
      return;
    const value = node.source?.value;
    if (!isString(value)) return;
    if (!value.startsWith(".")) {
      // Capability-module specifiers are the one sanctioned external import:
      // the guest loader resolves them to a mounted facade, mounting still
      // requires the node body to import the module, and every call passes
      // the per-call permission gate — so a pack module holding this import
      // gains nothing the body did not already consent to.
      if (
        value === SANDBOX_CAPABILITY_PACK ||
        value.startsWith(`${SANDBOX_CAPABILITY_PACK}/`)
      )
        return;
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: import outside the pack: ${value}`
      );
    }
    const packRoot = realpathOrThrow(packDir);
    const importedCandidate = resolve(packRoot, dirname(moduleId), value);
    if (
      importedCandidate !== packRoot &&
      !importedCandidate.startsWith(`${packRoot}${sep}`) // key-boundary-ok: `${sep}` anchors this boundary.
    ) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: import escapes the package: ${value}`
      );
    }
    const importedId = normalizeRelativeId(
      relative(packRoot, importedCandidate)
    );
    const imported = files.get(importedId);
    if (imported === undefined) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: imported file ${value} is not declared as a public or internal file`
      );
    } else if (imported.kind !== "js") {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${moduleId}: JS import targets non-JS module ${value}`
      );
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
function validateWasmModule(
  bytes: Uint8Array,
  manifest: Extract<SandboxModuleManifest, { kind: "wasm" }>,
  packageName: string,
  specifier: string
): SandboxWasmContract {
  const validationBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(validationBuffer).set(bytes);
  if (!WebAssembly.validate(validationBuffer))
    throw new SandboxPackDiscoveryError(
      `${packageName}/${specifier}: invalid WASM binary`
    );
  let module: ParsedWasmBinary;
  try {
    module = parseWasmBinary(bytes);
  } catch (error) {
    if (error instanceof WasmBinaryError) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${specifier}: ${error.message}`,
        { cause: error }
      );
    }
    throw error;
  }
  if (module.importCount !== 0)
    throw new SandboxPackDiscoveryError(
      `${packageName}/${specifier}: WASM imports are not allowed`
    );
  for (const memory of module.memories) {
    if (memory.shared || memory.maximum === undefined)
      throw new SandboxPackDiscoveryError(
        `${packageName}/${specifier}: every WASM memory must be unshared and declare a maximum`
      );
    if (
      memory.maximum < memory.minimum ||
      memory.maximum > manifest.memoryPagesMax ||
      memory.maximum > 4096
    )
      throw new SandboxPackDiscoveryError(
        `${packageName}/${specifier}: memory maximum exceeds the declared or host ceiling`
      );
  }
  const exports = manifest.exports.map((exported) => {
    const wasmName = isString(exported) ? exported : exported.wasm;
    const alias = isString(exported) ? exported : exported.as;
    // The manifest schema already holds this, but discovery is its own
    // enforcement point: a binary export that is not an identifier must be
    // renamed with `{ "wasm": …, "as": … }`, and the alias must be one.
    if (!JS_IDENTIFIER.test(alias) || RESERVED_IDENTIFIERS.has(alias)) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${specifier}: export ${wasmName} is exposed as "${alias}", which is not a usable JavaScript identifier — map it with { "wasm": "${wasmName}", "as": "<identifier>" }`
      );
    }
    const entry = module.exports.get(wasmName);
    const violation = wasmExportContractViolation(
      entry,
      entry === undefined ? undefined : module.functions[entry.index]
    );
    if (violation !== undefined) {
      throw new SandboxPackDiscoveryError(
        `${packageName}/${specifier}: export ${wasmName} ${violation}`
      );
    }
    return { wasm: wasmName, as: alias };
  });
  type ContractFields = Mutable<SandboxWasmContract>;
  const contract: ContractFields = {
    memoryPagesMax: manifest.memoryPagesMax,
    exports
  };
  if (manifest.limits !== undefined) {
    contract.limits = manifest.limits;
  }
  return contract;
}

function walkAst(value: unknown, visit: (node: AstNode) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walkAst(item, visit);
    return;
  }
  if (!isRecord(value)) return;
  if (isString(value.type)) visit(value as AstNode);
  for (const child of Object.values(value)) walkAst(child, visit);
}

function assertAcyclic(
  graph: ReadonlyMap<string, readonly string[]>,
  packageName: string
): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id))
      throw new SandboxPackDiscoveryError(
        `${packageName}: internal module cycle includes ${id}`
      );
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
  if (resolved !== root && !resolved.startsWith(`${root}${sep}`)) // key-boundary-ok: `${sep}` anchors this boundary.
    throw new SandboxPackDiscoveryError(
      `${relativeFile}: file escapes the package directory`
    );
  assertNoSymlink(root, candidate);
  return resolved;
}

function assertNoSymlink(root: string, candidate: string): void {
  const relativePath = relative(root, candidate);
  let current = root;
  for (const part of relativePath.split(sep)) {
    if (part.length === 0) continue;
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink())
      throw new SandboxPackDiscoveryError(
        `${relativePath}: symlinks are not allowed in sandbox modules`
      );
  }
}

function normalizeRelativeId(file: string): string {
  const normalized = file.replaceAll("\\", "/");
  if (
    CONTROL_CHARACTERS.test(normalized) ||
    ENCODED_PATH_CHARACTER.test(normalized) ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === ".." || part.length === 0)
  ) {
    throw new SandboxPackDiscoveryError(
      `${file}: invalid package-relative path`
    );
  }
  const id = normalized
    .split("/")
    .filter((part) => part !== ".")
    .join("/");
  if (id.length === 0)
    throw new SandboxPackDiscoveryError(
      `${file}: invalid package-relative path`
    );
  return id;
}

function realpathOrThrow(path: string): string {
  try {
    return realpathSync(path);
  } catch (error) {
    throw new SandboxPackDiscoveryError(
      `sandbox path does not exist: ${path}`,
      { cause: error }
    );
  }
}

function readFileOrThrow(path: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    throw new SandboxPackDiscoveryError(`cannot read sandbox file: ${path}`, {
      cause: error
    });
  }
}

function readFileWithinLimit(
  path: string,
  limit: number,
  description?: string
): Buffer | undefined {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    throw new SandboxPackDiscoveryError(`cannot stat sandbox file: ${path}`, {
      cause: error
    });
  }
  if (size > limit) {
    if (description !== undefined) {
      throw new SandboxPackDiscoveryError(
        `${description} exceeds the ${limit} byte limit`
      );
    }
    return undefined;
  }
  const bytes = readFileOrThrow(path);
  if (bytes.byteLength > limit) {
    if (description !== undefined) {
      throw new SandboxPackDiscoveryError(
        `${description} exceeds the ${limit} byte limit`
      );
    }
    return undefined;
  }
  return bytes;
}

function readRequiredFileWithinLimit(
  path: string,
  limit: number,
  description: string
): Buffer {
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
  try {
    const value: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (!isRecord(value)) throw new Error("package.json must be an object");
    return value;
  } catch (error) {
    throw new SandboxPackDiscoveryError(
      `invalid package.json: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function compareExportNames(
  left: string | { wasm: string; as: string },
  right: string | { wasm: string; as: string }
): number {
  const leftName = isString(left) ? left : left.wasm;
  const rightName = isString(right) ? right : right.wasm;
  return compareStrings(leftName, rightName);
}
function compareById<T extends { id: string }>(left: T, right: T): number {
  return compareStrings(left.id, right.id);
}

/** Parse one untrusted sandbox-module declaration at the package boundary. */
export function sandboxModuleManifest(value: unknown): SandboxModuleManifest {
  return SandboxModuleManifestSchema.parse(value);
}
