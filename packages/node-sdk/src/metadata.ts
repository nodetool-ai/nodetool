import fs from "node:fs";
import path from "node:path";

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
    type_args: (t.type_args ?? []).map(normalizeTypeMetadata),
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
  properties: PropertyMetadata[];
  outputs: OutputSlotMetadata[];
  the_model_info?: Record<string, unknown>;
  recommended_models?: unknown[];
  basic_fields?: string[];
  required_settings?: string[];
  is_dynamic?: boolean;
  is_streaming_output?: boolean;
  expose_as_tool?: boolean;
  supports_dynamic_outputs?: boolean;
  model_packs?: unknown[];
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

function walkForMetadataFiles(
  root: string,
  maxDepth: number,
  files: string[],
  warnings: string[],
  depth = 0
): void {
  if (depth > maxDepth) return;
  const normalizedRoot = root.split(path.sep).join("/");
  if (
    normalizedRoot.endsWith("/src/nodetool/package_metadata") ||
    normalizedRoot.endsWith("/nodetool/package_metadata")
  ) {
    try {
      const metadataFiles = fs
        .readdirSync(root, { withFileTypes: true })
        .filter((f) => f.isFile() && f.name.endsWith(".json"))
        .map((f) => path.join(root, f.name));
      files.push(...metadataFiles);
    } catch (error) {
      warnings.push(`Failed to scan metadata dir ${root}: ${String(error)}`);
    }
    return;
  }

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    warnings.push(`Failed to read directory ${root}: ${String(error)}`);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "dist") {
        continue;
      }
      const normalized = fullPath.split(path.sep).join("/");
      if (
        normalized.endsWith("/src/nodetool/package_metadata") ||
        normalized.endsWith("/nodetool/package_metadata")
      ) {
        try {
          const metadataFiles = fs
            .readdirSync(fullPath, { withFileTypes: true })
            .filter((f) => f.isFile() && f.name.endsWith(".json"))
            .map((f) => path.join(fullPath, f.name));
          files.push(...metadataFiles);
        } catch (error) {
          warnings.push(`Failed to scan metadata dir ${fullPath}: ${String(error)}`);
        }
        continue;
      }
      walkForMetadataFiles(fullPath, maxDepth, files, warnings, depth + 1);
    }
  }
}

export function loadPythonPackageMetadata(
  options: PythonMetadataLoadOptions = {}
): PythonMetadataLoadResult {
  const roots = (options.roots && options.roots.length > 0 ? options.roots : [process.cwd()]).map((p) =>
    path.resolve(p)
  );
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
  const packages: PackageMetadata[] = [];
  const nodesByType = new Map<string, NodeMetadata>();
  const duplicates = new Set<string>();

  for (const file of files) {
    let parsed: unknown;
    try {
      // Python's json module allows NaN/Infinity which are not valid JSON; replace them with null.
      const raw = fs.readFileSync(file, "utf8").replace(/\bNaN\b|-?Infinity\b/g, "null");
      parsed = JSON.parse(raw);
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
      name: typeof parsed.name === "string" ? parsed.name : path.basename(file, ".json"),
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      version: typeof parsed.version === "string" ? parsed.version : undefined,
      authors: Array.isArray(parsed.authors) ? (parsed.authors as string[]) : undefined,
      repo_id: typeof parsed.repo_id === "string" ? parsed.repo_id : undefined,
      nodes: Array.isArray(parsed.nodes) ? (parsed.nodes as NodeMetadata[]) : undefined,
      examples: Array.isArray(parsed.examples) ? parsed.examples : undefined,
      assets: Array.isArray(parsed.assets) ? parsed.assets : undefined,
      sourceFolder,
    };
    packages.push(pkg);

    for (const node of pkg.nodes ?? []) {
      if (!node || typeof node !== "object" || typeof node.node_type !== "string") {
        continue;
      }
      if (nodesByType.has(node.node_type)) {
        duplicates.add(node.node_type);
      }
      // Normalize type_args to always be an array (some JSON files omit it)
      const normalized: NodeMetadata = {
        ...node,
        properties: (node.properties ?? []).map((p) => ({ ...p, type: normalizeTypeMetadata(p.type) })),
        outputs: (node.outputs ?? []).map((o) => ({ ...o, type: normalizeTypeMetadata(o.type) })),
      };
      nodesByType.set(node.node_type, normalized);
    }
  }

  return {
    files,
    packages,
    nodesByType,
    duplicates: [...duplicates].sort(),
    warnings,
  };
}
