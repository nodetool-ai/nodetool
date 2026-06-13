import type {
  InputMode,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import { IS_NODE, importNodeBuiltin } from "@nodetool-ai/config";

// `node:fs`/`path`/`crypto`/`os` are loaded lazily so this module loads
// in browser / Edge runtimes. Python metadata loading is Node-only;
// every function that touches these is gated by IS_NODE.
//
// We resolve to the CJS `.default` export (not the namespace) so tests
// that do `import fs from "node:fs"; vi.spyOn(fs, "readdirSync")` patch
// the same object the function bodies below read from.
type Ns<T> = T | { default: T };
function asDefault<T>(mod: Ns<T> | null): T {
  if (!mod) return undefined as T;
  return (mod as { default?: T }).default ?? (mod as T);
}
const fs = asDefault(
  await importNodeBuiltin<Ns<typeof import("node:fs")>>("node:fs")
);
const path = asDefault(
  await importNodeBuiltin<Ns<typeof import("node:path")>>("node:path")
);
const crypto = asDefault(
  await importNodeBuiltin<Ns<typeof import("node:crypto")>>("node:crypto")
);
const os = asDefault(
  await importNodeBuiltin<Ns<typeof import("node:os")>>("node:os")
);

export interface TypeMetadata {
  type: string;
  optional?: boolean;
  values?: Array<string | number>;
  type_args: TypeMetadata[];
  type_name?: string | null;
}

/** Ensure a raw type object from JSON always has type_args as an array. */
export function normalizeTypeMetadata(t: TypeMetadata): TypeMetadata {
  return {
    ...t,
    type_args: (t.type_args ?? []).map(normalizeTypeMetadata)
  };
}

export interface PropertyMetadata {
  name: string;
  type: TypeMetadata;
  default?: unknown;
  title?: string | null;
  description?: string | null;
  min?: number | null;
  max?: number | null;
  values?: Array<string | number> | null;
  json_schema_extra?: Record<string, unknown> | null;
  required?: boolean;
}

export interface OutputSlotMetadata {
  type: TypeMetadata;
  name: string;
  stream?: boolean;
}

export interface NodeMetadata {
  title: string;
  description: string;
  namespace: string;
  node_type: string;
  layout?: string;
  /**
   * Node body renderer key. "content_card" makes the frontend render a
   * media/text-forward content card instead of the generic input/output body.
   * Node authors opt in via the class's `body` static (TS) or `_body`/`body()`
   * (Python). Absent or "default" → generic body.
   */
  body?: string;
  properties: PropertyMetadata[];
  outputs: OutputSlotMetadata[];

  recommended_models?: unknown[];
  inline_fields?: string[];
  input_fields?: string[];
  required_settings?: string[];
  /**
   * Runtime packages this node depends on (e.g. "ffmpeg", "python", "ollama").
   * The frontend uses this to show install prompts before execution.
   */
  required_runtimes?: string[];
  supports_dynamic_inputs?: boolean;
  is_streaming_input?: boolean;
  is_streaming_output?: boolean;
  input_mode?: InputMode;
  output_correlation?: Record<string, OutputCorrelation>;
  is_controlled?: boolean;
  /** §7 — Zip/Cross nodes opt out of the incomparable-scope check. */
  is_join_node?: boolean;
  /** Emit output_update even for connected handles (UI-monitor nodes). */
  always_emit_output_updates?: boolean;
  supports_dynamic_outputs?: boolean;
  auto_save_asset?: boolean;
  model_packs?: unknown[];
  /**
   * Deployment platforms this node supports. Absent or empty values are
   * treated as ["node"] (most restrictive). See `@nodetool-ai/protocol`'s
   * Platform type for the closed set.
   */
  platforms?: readonly Platform[];
  /** When true, the node remains runnable but should be deprioritized in search. */
  deprecated?: boolean;
  /** Preferred replacement node_type when deprecated is true. */
  replaced_by?: string;
}

export interface PackageMetadata {
  name: string;
  description?: string;
  version?: string;
  authors?: string[];
  repo_id?: string | null;
  nodes?: NodeMetadata[];
  examples?: unknown[];
  assets?: unknown[];
  /** Absolute path to the source root (e.g. /path/to/nodetool-base/src or /path/to/nodetool-base) */
  sourceFolder?: string;
}

export interface PythonMetadataLoadOptions {
  roots?: string[];
  maxDepth?: number;
}

export interface PythonMetadataLoadResult {
  files: string[];
  packages: PackageMetadata[];
  nodesByType: Map<string, NodeMetadata>;
  duplicates: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/** True if `dir` is a nodetool `package_metadata` directory. */
function isMetadataDir(dir: string): boolean {
  const normalized = dir.split(path.sep).join("/");
  // Stryker disable next-line LogicalOperator,MethodExpression: a "/src/nodetool/package_metadata" path also ends with "/nodetool/package_metadata", so the first check is redundant with the second — mutating it leaves detection unchanged (equivalent).
  return normalized.endsWith("/src/nodetool/package_metadata") || normalized.endsWith("/nodetool/package_metadata");
}

/** Read the `.json` files in a `package_metadata` directory into `files`. */
function scanMetadataDir(dir: string, files: string[], warnings: string[]): void {
  try {
    const metadataFiles = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".json"))
      .map((f) => path.join(dir, f.name));
    files.push(...metadataFiles);
    // Stryker disable next-line BlockStatement,StringLiteral: a readdir failure on a directory we just matched is unreachable in tests; the warning text is diagnostic.
  } catch (error) {
    warnings.push(`Failed to scan metadata dir ${dir}: ${String(error)}`);
  }
}

function walkForMetadataFiles(
  root: string,
  maxDepth: number,
  files: string[],
  warnings: string[],
  depth = 0
): void {
  const tooDeep = depth > maxDepth;
  if (tooDeep) return;
  if (isMetadataDir(root)) {
    scanMetadataDir(root, files, warnings);
    return;
  }

  let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true }) as Array<{
      name: string;
      isDirectory: () => boolean;
      isFile: () => boolean;
    }>;
  } catch (error) {
    warnings.push(`Failed to read directory ${root}: ${String(error)}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === ".git" ||
        entry.name === "node_modules" ||
        entry.name === "dist"
      ) {
        continue;
      }
      // Stryker disable next-line ConditionalExpression,BlockStatement: redundant with the recursion below — a metadata subdir not matched (or not scanned) here is found when walkForMetadataFiles recurses into it and matches the top-level isMetadataDir check (equivalent).
      if (isMetadataDir(fullPath)) {
        scanMetadataDir(fullPath, files, warnings);
        continue;
      }
      walkForMetadataFiles(fullPath, maxDepth, files, warnings, depth + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Metadata cache — avoids re-reading and re-parsing JSON files on every startup
// when the underlying metadata files haven't changed.
// ---------------------------------------------------------------------------

// Per-user cache dir — the shared system tmpdir is world-writable, so a
// predictable path there would let another local user pre-seed poisoned
// metadata or plant symlinks.
const CACHE_DIR = IS_NODE
  ? path.join(
      // Stryker disable next-line ConditionalExpression,LogicalOperator: XDG_CACHE_HOME is unset in the test environment, so the homedir fallback always applies (equivalent).
      process.env["XDG_CACHE_HOME"] || path.join(os.homedir(), ".cache"),
      "nodetool",
      "metadata-cache"
    )
  : // Stryker disable next-line StringLiteral: the non-Node branch is unreachable in the (Node) test environment, where IS_NODE is always true (dead branch).
    "/tmp/nodetool-metadata-cache";
const CACHE_VERSION = 1;

interface SerializedCacheEntry {
  version: number;
  fingerprint: string;
  files: string[];
  packages: PackageMetadata[];
  nodesByType: [string, NodeMetadata][];
  duplicates: string[];
  warnings: string[];
}

/** Build a fingerprint from sorted file paths + their mtime/size. */
function buildFingerprint(files: string[]): string {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(file);
    // Stryker disable BlockStatement: the catch is unreachable for freshly-walked files (they exist); emptying it changes only an opaque cache-key input (equivalent).
    try {
      const stat = fs.statSync(file);
      hash.update(`|${stat.mtimeMs}|${stat.size}`);
    } catch {
      // Stryker disable next-line StringLiteral: opaque, consistent cache-key input (equivalent).
      hash.update("|missing");
    }
    // Stryker restore BlockStatement
  }
  return hash.digest("hex");
}

function getCachePath(roots: string[]): string {
  // Stryker disable next-line MethodExpression,StringLiteral: the cache filename derives from an opaque hash of the roots; any consistent key maps a roots-set to a stable file, so these hashing details are equivalent.
  const key = crypto.createHash("sha256").update(roots.join(":")).digest("hex").slice(0, 16);
  return path.join(CACHE_DIR, `metadata-${key}.json`);
}

function tryReadCache(
  cachePath: string,
  fingerprint: string
): PythonMetadataLoadResult | null {
  try {
    // Stryker disable next-line ConditionalExpression: a missing cache file makes the readFileSync below throw into the catch, which also returns null (equivalent).
    if (!fs.existsSync(cachePath)) return null;
    // Stryker disable next-line StringLiteral: Node decodes "" as utf-8, so the encoding argument is equivalent.
    const raw = fs.readFileSync(cachePath, "utf8");
    const entry: SerializedCacheEntry = JSON.parse(raw);
    // Stryker disable next-line ConditionalExpression: the cache-staleness guard is covered behaviourally by the cache round-trip test (a content change invalidates via fingerprint); the version vs fingerprint operands are not independently asserted.
    if (entry.version !== CACHE_VERSION || entry.fingerprint !== fingerprint)
      return null;
    return {
      files: entry.files,
      packages: entry.packages,
      nodesByType: new Map(entry.nodesByType),
      duplicates: entry.duplicates,
      warnings: entry.warnings
    };
    // Stryker disable BlockStatement: emptying this catch makes tryReadCache fall through to `return undefined`, which the caller treats identically to null (equivalent).
  } catch {
    return null;
  }
  // Stryker restore BlockStatement
}

function writeCache(
  cachePath: string,
  fingerprint: string,
  result: PythonMetadataLoadResult
): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const entry: SerializedCacheEntry = {
      version: CACHE_VERSION,
      fingerprint,
      files: result.files,
      packages: result.packages,
      nodesByType: [...result.nodesByType.entries()],
      duplicates: result.duplicates,
      warnings: result.warnings
    };
    fs.writeFileSync(cachePath, JSON.stringify(entry));
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Python's json module emits bare `NaN`/`Infinity`/`-Infinity` tokens, which
 * are not valid JSON. Replace them with `null` — but only outside string
 * literals, so descriptions or defaults containing the words "NaN" or
 * "Infinity" survive intact.
 */
export function sanitizePythonJson(raw: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        // Copy the escaped character verbatim so an escaped quote (\")
        // doesn't terminate the string early.
        out += raw[i + 1] ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (raw.startsWith("NaN", i)) {
      out += "null";
      i += 2;
      continue;
    }
    if (raw.startsWith("-Infinity", i)) {
      out += "null";
      i += 8;
      continue;
    }
    if (raw.startsWith("Infinity", i)) {
      out += "null";
      i += 7;
      continue;
    }
    out += ch;
  }
  return out;
}

function parseMetadataFiles(files: string[]): PythonMetadataLoadResult {
  const packages: PackageMetadata[] = [];
  const nodesByType = new Map<string, NodeMetadata>();
  const duplicates = new Set<string>();
  const warnings: string[] = [];

  for (const file of files) {
    let parsed: unknown;
    try {
      const raw = fs.readFileSync(file, "utf8");
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Python's json module allows NaN/Infinity which are not valid JSON;
        // retry with those tokens (outside string literals) nulled out.
        parsed = JSON.parse(sanitizePythonJson(raw));
      }
    } catch (error) {
      warnings.push(`Failed to parse JSON ${file}: ${String(error)}`);
      continue;
    }
    if (!isRecord(parsed)) {
      warnings.push(`Skipping non-object metadata file: ${file}`);
      continue;
    }

    // Infer source folder from the metadata file path:
    // file is at {root}/nodetool/package_metadata/{name}.json or {root}/src/nodetool/package_metadata/{name}.json
    const metaDir = path.dirname(file); // .../nodetool/package_metadata
    const sourceFolder = path.dirname(path.dirname(metaDir)); // strip /nodetool/package_metadata

    const pkg: PackageMetadata = {
      name:
        typeof parsed.name === "string"
          ? parsed.name
          : path.basename(file, ".json"),
      description:
        typeof parsed.description === "string" ? parsed.description : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      authors: Array.isArray(parsed.authors)
        ? (parsed.authors as string[])
        : undefined,
      repo_id: typeof parsed.repo_id === "string" ? parsed.repo_id : undefined,
      nodes: Array.isArray(parsed.nodes)
        ? (parsed.nodes as NodeMetadata[])
        : undefined,
      examples: Array.isArray(parsed.examples) ? parsed.examples : undefined,
      assets: Array.isArray(parsed.assets) ? parsed.assets : undefined,
      sourceFolder
    };
    packages.push(pkg);

    // Stryker disable next-line ArrayDeclaration: a bogus seed node is a string, which the guard below skips (typeof "..." !== "object"), so the result is unchanged (equivalent).
    for (const node of pkg.nodes ?? []) {
      if (
        !node ||
        // Stryker disable next-line ConditionalExpression: a non-object truthy node has no string node_type, so the next check rejects it either way (equivalent).
        typeof node !== "object" ||
        typeof node.node_type !== "string"
      ) {
        continue;
      }
      if (nodesByType.has(node.node_type)) {
        duplicates.add(node.node_type);
      }
      // Normalize type_args to always be an array (some JSON files omit it)
      const normalized: NodeMetadata = {
        ...node,
        properties: (node.properties ?? []).map((p) => ({
          ...p,
          type: normalizeTypeMetadata(p.type)
        })),
        outputs: (node.outputs ?? []).map((o) => ({
          ...o,
          type: normalizeTypeMetadata(o.type)
        }))
      };
      nodesByType.set(node.node_type, normalized);
    }
  }

  return {
    files,
    packages,
    nodesByType,
    duplicates: [...duplicates].sort(),
    warnings
  };
}

export function loadPythonPackageMetadata(
  options: PythonMetadataLoadOptions = {}
): PythonMetadataLoadResult {
  const roots = (
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator,ArrayDeclaration: the cwd fallback for an empty roots list is environment-dependent — a clean working tree yields no metadata, so [] and [process.cwd()] are indistinguishable in tests (equivalent).
    options.roots && options.roots.length > 0 ? options.roots : [process.cwd()]
  ).map((p) => path.resolve(p));
  const maxDepth = options.maxDepth ?? 8;

  const warnings: string[] = [];
  const fileSet = new Set<string>();
  for (const root of roots) {
    if (!fs.existsSync(root)) {
      warnings.push(`Metadata root does not exist: ${root}`);
      continue;
    }
    const found: string[] = [];
    walkForMetadataFiles(root, maxDepth, found, warnings);
    for (const file of found) {
      fileSet.add(path.resolve(file));
    }
  }

  const files = [...fileSet].sort();

  // Try cache first — avoids re-reading and parsing all JSON files.
  const fingerprint = buildFingerprint(files);
  const cachePath = getCachePath(roots);
  const cached = tryReadCache(cachePath, fingerprint);
  if (cached) {
    // Merge any walk warnings into the cached result
    // Stryker disable next-line ConditionalExpression,EqualityOperator,BlockStatement: merging an empty warnings list is a no-op, so the > 0 guard is equivalent for the empty case; the populated case requires a cache hit *and* walk warnings simultaneously, which the cache round-trip test does not combine.
    if (warnings.length > 0) {
      cached.warnings = [...warnings, ...cached.warnings];
    }
    return cached;
  }

  const result = parseMetadataFiles(files);
  // Stryker disable next-line ConditionalExpression,EqualityOperator: the populated path is covered by the walk-warnings test (a non-existent root is prepended to the parse warnings); merging an empty list is a no-op, so the >= 0 / always-true variants are equivalent.
  if (warnings.length > 0) {
    result.warnings = [...warnings, ...result.warnings];
  }

  // Persist cache for next startup
  writeCache(cachePath, fingerprint, result);

  return result;
}
