import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { loadPythonPackageMetadata } from "@nodetool-ai/node-sdk";

export interface ExampleWorkflowLoadOptions {
  examplesDir?: string;
  /** Fallback thumbnail directory when the sibling of examplesDir has no JPGs. */
  examplesAssetsFallbackDir?: string;
  metadataRoots?: string[];
  metadataMaxDepth?: number;
}

function directoryHasGalleryThumbnails(dir: string): boolean {
  if (!existsSync(dir)) {
    return false;
  }
  try {
    return readdirSync(dir).some((file) => /\.(jpg|jpeg|png)$/i.test(file));
  } catch {
    return false;
  }
}

/**
 * Resolve the directory containing gallery thumbnail JPGs/PNGs for an examples dir.
 * Prefer the sibling `assets/<package>` layout; fall back to bundled assets when
 * examples are mounted elsewhere (common in Docker compose overrides).
 */
export function deriveExampleAssetsDir(
  examplesDir: string,
  fallbackAssetsDir?: string | null
): string {
  const derived = nodePath.join(
    nodePath.dirname(nodePath.dirname(examplesDir)),
    "assets",
    nodePath.basename(examplesDir)
  );
  if (directoryHasGalleryThumbnails(derived)) {
    return derived;
  }
  if (
    fallbackAssetsDir &&
    existsSync(fallbackAssetsDir) &&
    directoryHasGalleryThumbnails(fallbackAssetsDir)
  ) {
    return fallbackAssetsDir;
  }
  return derived;
}

/** Resolve a display name, slug, or filename to an on-disk example JSON path. */
export function resolveExampleJsonPath(
  examplesDir: string,
  exampleRef: string
): string | null {
  const ref = exampleRef.trim();
  if (!ref) {
    return null;
  }

  const directCandidates = ref.toLowerCase().endsWith(".json")
    ? [nodePath.join(examplesDir, nodePath.basename(ref))]
    : [
        nodePath.join(examplesDir, `${ref}.json`),
        nodePath.join(examplesDir, ref)
      ];

  for (const candidate of directCandidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  let files: string[];
  try {
    files = readdirSync(examplesDir).filter((file) =>
      file.toLowerCase().endsWith(".json")
    );
  } catch {
    return null;
  }

  for (const file of files) {
    if (file === ref || file === `${ref}.json`) {
      return nodePath.join(examplesDir, file);
    }
  }

  for (const file of files) {
    try {
      const raw = readFileSync(nodePath.join(examplesDir, file), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.name === "string" && parsed.name === ref) {
        return nodePath.join(examplesDir, file);
      }
      if (typeof parsed.id === "string" && parsed.id === ref) {
        return nodePath.join(examplesDir, file);
      }
    } catch {
      // skip invalid example files
    }
  }

  return null;
}

function loadExampleGraphFromDir(
  examplesDir: string,
  exampleRef: string
): Record<string, unknown> | null {
  const examplePath = resolveExampleJsonPath(examplesDir, exampleRef);
  if (!examplePath) {
    return null;
  }
  try {
    const raw = readFileSync(examplePath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function loadExampleGraphFromPythonPackage(
  packageName: string,
  exampleRef: string,
  options: ExampleWorkflowLoadOptions
): Record<string, unknown> | null {
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth
  });
  const pkg = loaded.packages.find((p) => p.name === packageName);
  if (!pkg?.sourceFolder) {
    return null;
  }

  const examplesDir = nodePath.join(
    pkg.sourceFolder,
    "nodetool",
    "examples",
    packageName
  );
  return loadExampleGraphFromDir(examplesDir, exampleRef);
}

/** Load a full example workflow JSON (including graph) for workflow creation. */
export function loadExampleGraph(
  packageName: string,
  exampleRef: string,
  options: ExampleWorkflowLoadOptions = {}
): Record<string, unknown> | null {
  if (options.examplesDir && existsSync(options.examplesDir)) {
    const fromDir = loadExampleGraphFromDir(options.examplesDir, exampleRef);
    if (fromDir) {
      return fromDir;
    }
  }

  if (packageName) {
    return loadExampleGraphFromPythonPackage(packageName, exampleRef, options);
  }

  return null;
}

export function defaultExamplePackageName(
  options: ExampleWorkflowLoadOptions
): string | null {
  if (options.examplesDir && existsSync(options.examplesDir)) {
    return nodePath.basename(options.examplesDir);
  }
  return null;
}
