/**
 * The shipped example workflow catalog: lightweight list entries from the
 * examples directory or the installed Python packages, and the agent-facing
 * catalog the MCP tools read.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import nodePath from "node:path";
import { createLogger } from "@nodetool-ai/config";
import {
  loadPythonPackageMetadata,
  type NodeRegistry
} from "@nodetool-ai/node-sdk";
import { isObjectLike, isString, scanExampleNeeds } from "@nodetool-ai/protocol";
import { withCacheBuster } from "./example-thumbnail.js";
import {
  defaultExamplePackageName,
  deriveExampleAssetsDir,
  loadExampleGraph,
  shippedWorkflowExamplesDir
} from "./example-workflows.js";

const log = createLogger("nodetool.examples");

/** Where the examples come from. The server passes its HTTP options. */
export interface ExampleSourceOptions {
  examplesDir?: string;
  examplesAssetsFallbackDir?: string;
  registry?: NodeRegistry;
  metadataRoots?: string[];
  metadataMaxDepth?: number;
}

// ── Workflow examples ──────────────────────────────────────────────────

/** URL prefix for example workflow thumbnail images served by this API. */
const EXAMPLES_THUMBNAILS_PREFIX = "/api/workflows/examples/thumbnails/";

interface ExampleMetadata {
  id?: string;
  name: string;
  description?: string;
  tags?: string[];
}

/**
 * Read example workflow metadata from a directory of JSON files.
 * Returns lightweight objects (no graph data) suitable for the /examples list.
 *
 * When the sibling `assets` directory exists (e.g.
 * `packages/base-nodes/nodetool/assets/nodetool-base`), a `thumbnail_url`
 * pointing to `/api/workflows/examples/thumbnails/<name>` is set so the
 * frontend can display the pre-generated JPG thumbnails.
 */
function buildExamplesFromDir(
  examplesDir: string,
  examplesAssetsFallbackDir?: string,
  registry?: NodeRegistry
): unknown[] {
  if (!existsSync(examplesDir)) return [];
  const assetsDir = deriveExampleAssetsDir(
    examplesDir,
    examplesAssetsFallbackDir
  );
  const now = new Date().toISOString();
  const workflows: unknown[] = [];
  let files: string[];
  try {
    files = readdirSync(examplesDir)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));
  } catch (err) {
    log.warn(`Failed to read examples directory ${examplesDir}: ${err}`);
    return [];
  }
  for (const file of files) {
    try {
      const raw = readFileSync(nodePath.join(examplesDir, file), "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const name = isString(parsed.name)
        ? parsed.name
        : file.replace(/\.json$/i, "");
      // Point thumbnail_url to the served JPG when the file exists in
      // assets. withCacheBuster() appends ?v=<md5-8> so the browser cache
      // invalidates whenever the JPG is regenerated.
      const jpgFile = `${name}.jpg`;
      const jpgPath = nodePath.join(assetsDir, jpgFile);
      const thumbnailUrl = existsSync(jpgPath)
        ? withCacheBuster(
            `${EXAMPLES_THUMBNAILS_PREFIX}${encodeURIComponent(jpgFile)}`,
            jpgPath
          )
        : null;
      workflows.push({
        id: file,
        access: "public",
        created_at: now,
        updated_at: now,
        name,
        tool_name: null,
        description: isString(parsed.description) ? parsed.description : "",
        tags: Array.isArray(parsed.tags) ? parsed.tags.filter(isString) : [],
        thumbnail: thumbnailUrl ? jpgFile : null,
        thumbnail_url: thumbnailUrl,
        graph: { nodes: [], edges: [] },
        input_schema: null,
        output_schema: null,
        settings: null,
        package_name: isString(parsed.package_name)
          ? parsed.package_name
          : null,
        path: null,
        run_mode: null,
        workspace_id: null,
        required_providers: null,
        required_models: null,
        needs: scanExampleNeeds(
          parsed.graph,
          (nodeType) => registry?.getMetadata(nodeType)?.required_settings
        ),
        html_app: null,
        app_doc: isObjectLike(parsed.app_doc) ? parsed.app_doc : null,
        etag: null
      });
    } catch (err) {
      log.debug(`Skipping invalid example workflow file ${file}: ${err}`);
    }
  }
  return workflows;
}

export function buildExampleWorkflows(
  options: ExampleSourceOptions
): unknown[] {
  if (options.examplesDir) {
    return buildExamplesFromDir(
      options.examplesDir,
      options.examplesAssetsFallbackDir,
      options.registry
    );
  }
  const loaded = loadPythonPackageMetadata({
    roots: options.metadataRoots,
    maxDepth: options.metadataMaxDepth
  });
  const now = new Date().toISOString();
  const workflows: unknown[] = [];
  for (const pkg of loaded.packages) {
    if (!pkg.examples || pkg.examples.length === 0) continue;
    for (const ex of pkg.examples) {
      const meta = ex as ExampleMetadata;
      workflows.push({
        id: meta.id ?? "",
        access: "public",
        created_at: now,
        updated_at: now,
        name: meta.name,
        tool_name: null,
        description: meta.description ?? "",
        tags: meta.tags ?? [],
        thumbnail: null,
        thumbnail_url: null,
        graph: { nodes: [], edges: [] },
        input_schema: null,
        output_schema: null,
        settings: null,
        package_name: pkg.name,
        path: null,
        run_mode: null,
        workspace_id: null,
        required_providers: null,
        required_models: null,
        html_app: null,
        app_doc: null,
        etag: null
      });
    }
  }
  const shippedDirectory = shippedWorkflowExamplesDir();
  const shipped = shippedDirectory
    ? buildExamplesFromDir(shippedDirectory, options.examplesAssetsFallbackDir, options.registry)
    : [];
  const seen = new Set<string>();
  return [...workflows, ...shipped].filter((workflow) => {
    if (!isObjectLike(workflow)) {
      return false;
    }
    const key = JSON.stringify([
      workflow.package_name ?? "nodetool-base",
      isString(workflow.id) && workflow.id !== "" ? workflow.id : workflow.name
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
