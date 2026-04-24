import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { NodeRegistry } from "./registry.js";
import type { PackageMetadata } from "./metadata.js";

export interface ScanPackageOptions {
  /** Directory containing the package (default: cwd). */
  packageDir?: string;
  /** Where to write package_metadata/<name>.json (default: <packageDir>/nodetool/package_metadata). */
  outputDir?: string;
  /** Verbose stderr logging. */
  verbose?: boolean;
}

export interface ScanPackageResult {
  metadataPath: string;
  metadata: PackageMetadata;
  nodeCount: number;
  exampleCount: number;
  assetCount: number;
}

interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  author?: string | { name?: string; email?: string };
  authors?: string[];
}

function pascalCase(s: string): string {
  return s
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

function candidateRegisterFunctionNames(packageName: string): string[] {
  const candidates = new Set<string>();
  candidates.add("registerNodes");
  const withoutPrefix = packageName.replace(/^@[^/]+\//, "").replace(/^nodetool-/, "");
  if (withoutPrefix) {
    candidates.add(`register${pascalCase(withoutPrefix)}`);
    candidates.add(`register${pascalCase(withoutPrefix)}Nodes`);
  }
  return [...candidates];
}

function readAuthors(pkg: PackageJson): string[] | undefined {
  if (Array.isArray(pkg.authors) && pkg.authors.length > 0) return pkg.authors;
  if (typeof pkg.author === "string" && pkg.author.trim()) return [pkg.author];
  if (pkg.author && typeof pkg.author === "object") {
    const name = pkg.author.name;
    if (typeof name === "string" && name.trim()) {
      return pkg.author.email ? [`${name} <${pkg.author.email}>`] : [name];
    }
  }
  return undefined;
}

function walkFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) results.push(full);
    }
  }
  return results;
}

function collectExamples(
  packageDir: string,
  packageName: string
): Array<Record<string, unknown>> {
  const examplesDir = path.join(packageDir, "examples");
  if (!fs.existsSync(examplesDir)) return [];
  const files = walkFiles(examplesDir).filter((f) => f.endsWith(".json"));
  const examples: Array<Record<string, unknown>> = [];
  for (const file of files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
    const record = parsed as Record<string, unknown>;
    const basename = path.basename(file, ".json");
    examples.push({
      id: typeof record["id"] === "string" ? record["id"] : basename,
      name: typeof record["name"] === "string" ? record["name"] : basename,
      description:
        typeof record["description"] === "string" ? record["description"] : "",
      package_name: packageName,
      path: path.relative(packageDir, file)
    });
  }
  return examples;
}

function collectAssets(
  packageDir: string,
  packageName: string
): Array<Record<string, unknown>> {
  const assetsDir = path.join(packageDir, "assets");
  if (!fs.existsSync(assetsDir)) return [];
  const files = walkFiles(assetsDir);
  return files.map((file) => ({
    package_name: packageName,
    name: path.basename(file),
    path: path.relative(packageDir, file)
  }));
}

async function callRegister(
  moduleExports: Record<string, unknown>,
  registry: NodeRegistry,
  packageName: string,
  verbose: boolean
): Promise<boolean> {
  for (const name of candidateRegisterFunctionNames(packageName)) {
    const fn = moduleExports[name];
    if (typeof fn === "function") {
      if (verbose) console.error(`[scan] calling ${name}()`);
      await (fn as (r: NodeRegistry) => void | Promise<void>)(registry);
      return true;
    }
  }
  return false;
}

export async function scanPackage(
  options: ScanPackageOptions = {}
): Promise<ScanPackageResult> {
  const packageDir = path.resolve(options.packageDir ?? process.cwd());
  const verbose = options.verbose ?? false;

  const packageJsonPath = path.join(packageDir, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`No package.json found in ${packageDir}`);
  }
  let pkgJson: PackageJson;
  try {
    pkgJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;
  } catch (error) {
    throw new Error(`Failed to parse ${packageJsonPath}: ${String(error)}`);
  }
  const packageName = pkgJson.name ?? path.basename(packageDir);

  const distEntry = path.join(packageDir, "dist", "index.js");
  if (!fs.existsSync(distEntry)) {
    throw new Error(
      `Missing ${distEntry}. Run 'npm run build' before scanning.`
    );
  }

  const registry = new NodeRegistry();
  let moduleExports: Record<string, unknown>;
  try {
    moduleExports = (await import(pathToFileURL(distEntry).href)) as Record<
      string,
      unknown
    >;
  } catch (error) {
    throw new Error(`Failed to import ${distEntry}: ${String(error)}`);
  }

  const registered = await callRegister(
    moduleExports,
    registry,
    packageName,
    verbose
  );
  if (!registered && verbose) {
    console.error(
      `[scan] no register function found on module; relying on side-effect registration`
    );
  }

  const nodes = registry.listMetadata();
  if (nodes.length === 0) {
    console.error(
      `[scan] warning: no nodes registered from ${packageName} (empty package?)`
    );
  }

  const examples = collectExamples(packageDir, packageName);
  const assets = collectAssets(packageDir, packageName);

  const metadata: PackageMetadata = {
    name: packageName,
    version: pkgJson.version,
    description: pkgJson.description,
    authors: readAuthors(pkgJson),
    nodes,
    examples,
    assets
  };

  const outputDir = path.resolve(
    options.outputDir ?? path.join(packageDir, "nodetool", "package_metadata")
  );
  fs.mkdirSync(outputDir, { recursive: true });

  const baseName = packageName.replace(/^@[^/]+\//, "");
  const metadataPath = path.join(outputDir, `${baseName}.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2) + "\n");

  if (verbose) {
    console.error(
      `[scan] wrote ${metadataPath} (${nodes.length} nodes, ${examples.length} examples, ${assets.length} assets)`
    );
  }

  return {
    metadataPath,
    metadata,
    nodeCount: nodes.length,
    exampleCount: examples.length,
    assetCount: assets.length
  };
}
