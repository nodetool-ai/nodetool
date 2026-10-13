import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, realpath } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "node:util";
import { z } from "zod";
import { register as registerEsm } from "tsx/esm/api";
import { register as registerCjs, require as tsxRequire } from "tsx/cjs/api";

let pending: Promise<unknown> = Promise.resolve();
const CJS_NAMESPACE = randomUUID();
const localDependencyGraphs = new Map<string, Set<NodeJS.Module>>();

function invalidateLocalDependencies(file: string): void {
  const previous = localDependencyGraphs.get(file);
  if (previous) {
    for (const [key, module] of Object.entries(tsxRequire.cache)) {
      if (module && previous.has(module)) {
        delete tsxRequire.cache[key];
      }
    }
  }
}

function packageBoundary(file: string, cache: Map<string, string | null>): string | null {
  let directory = dirname(file);
  const visited: string[] = [];
  while (!cache.has(directory)) {
    visited.push(directory);
    if (existsSync(join(directory, "package.json"))) {
      cache.set(directory, directory);
      break;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      cache.set(directory, null);
      break;
    }
    directory = parent;
  }
  const boundary = cache.get(directory) ?? null;
  for (const entry of visited) {
    cache.set(entry, boundary);
  }
  return boundary;
}

function rememberLocalDependencies(file: string, previous: ReadonlySet<NodeJS.Module>): void {
  const boundaries = new Map<string, string | null>();
  const rootBoundary = packageBoundary(file, boundaries);
  const pendingModules = Object.entries(tsxRequire.cache)
    .filter(([key, module]) => key.split("?")[0] === file || (module && !previous.has(module)))
    .flatMap(([, module]) => module ? [module] : []);
  const visited = new Set<NodeJS.Module>();
  while (pendingModules.length > 0) {
    const module = pendingModules.pop();
    if (!module || visited.has(module) || module.filename.split(sep).includes("node_modules") ||
      packageBoundary(module.filename.split("?")[0], boundaries) !== rootBoundary) {
      continue;
    }
    visited.add(module);
    for (const child of module.children) {
      pendingModules.push(child);
    }
  }
  localDependencyGraphs.set(file, visited);
}

const graphSchema = z.object({ nodes: z.array(z.unknown()), edges: z.array(z.unknown()) }).passthrough();
const workflowDocumentSchema = z.union([
  graphSchema,
  z.object({ graph: graphSchema }).passthrough()
]);
const exportsSchema = z.record(z.string(), z.unknown());
const packageSchema = z.object({ type: z.string().optional() }).passthrough();

async function isCommonJs(file: string): Promise<boolean> {
  const extension = extname(file);
  if (extension === ".cts" || extension === ".cjs") {
    return true;
  }
  if (extension === ".mts" || extension === ".mjs") {
    return false;
  }
  let directory = dirname(file);
  while (true) {
    try {
      const manifest = packageSchema.parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
      return manifest.type !== "module";
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        throw error;
      }
    }
    const parent = dirname(directory);
    if (parent === directory) {
      return true;
    }
    directory = parent;
  }
}

/** Load exported workflow documents or the JSON printed by legacy DSL files. */
export function importWorkflowFile(file: string): Promise<unknown> {
  const load = pending.then(async () => {
    const absolutePath = await realpath(resolve(file));
    const previousCwd = process.cwd();
    const moduleUrl = pathToFileURL(absolutePath);
    moduleUrl.searchParams.set("nodetool-reload", randomUUID());
    // tsImport namespaces collide within one millisecond. ESM gets a fresh UUID.
    // CJS keeps its scope stable and invalidates local dependencies explicitly.
    const commonJs = await isCommonJs(absolutePath);
    const namespace = commonJs ? CJS_NAMESPACE : randomUUID();
    const lines: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => { lines.push(format(...args)); };
    let module: unknown;
    let previousModules: ReadonlySet<NodeJS.Module> = new Set();
    const cjs = registerCjs({ namespace });
    const esm = registerEsm({ namespace });
    try {
      process.chdir(dirname(absolutePath));
      if (commonJs) {
        invalidateLocalDependencies(absolutePath);
        previousModules = new Set(Object.values(tsxRequire.cache).flatMap((value) => value ? [value] : []));
      }
      module = commonJs ? cjs.require(absolutePath, import.meta.url)
        : await esm.import(moduleUrl.href, import.meta.url);
    } finally {
      if (commonJs) {
        rememberLocalDependencies(absolutePath, previousModules);
      }
      try {
        cjs.unregister();
        await esm.unregister();
      } finally {
        console.log = originalLog;
        process.chdir(previousCwd);
      }
    }
    const parsedModule = exportsSchema.safeParse(module);
    if (parsedModule.success) {
      // tsx imports CommonJS TypeScript through a default namespace wrapper.
      const defaultExport = parsedModule.data["default"];
      const defaultNamespace = exportsSchema.safeParse(defaultExport);
      const exports = defaultNamespace.success && !workflowDocumentSchema.safeParse(defaultExport).success
        ? Object.values(defaultNamespace.data) : Object.values(parsedModule.data);
      const workflows = exports.filter((value) => workflowDocumentSchema.safeParse(value).success);
      if (workflows.length === 1) {
        return workflows[0];
      }
      if (workflows.length > 1) {
        throw new Error(`Multiple Workflow exports found in ${file}. Export one workflow.`);
      }
    }
    if (lines.length > 0) {
      return JSON.parse(lines.join("\n"));
    }
    throw new Error(`No Workflow export or printed JSON found in ${file}`);
  });
  pending = load.catch(() => undefined);
  return load;
}
