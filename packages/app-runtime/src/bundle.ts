/**
 * The ApplicationBundle: one JSON document carrying an application together
 * with the full graphs of every workflow its operations bind, so an app
 * ships, exports, and imports as a single artifact.
 *
 * Inside a bundle an operation's `workflowId` holds a bundle-local **key**
 * (`workflows[].key`), not a real workflow id. Import creates the workflows
 * and rewrites the keys to the new ids — the same indirection `.nodetool`
 * bundles use for `bundle://` asset refs. An asset-carrying bundle is this
 * JSON riding inside the existing `.nodetool` zip alongside the asset entries,
 * with the refs inside the graphs left as `bundle://`; nothing here needs to
 * change for that path.
 *
 * Everything in this module is pure. Persistence — creating workflow rows,
 * inserting the application, unpacking a zip — stays in the server and CLI
 * callers.
 */

import {
  parseApplicationDocument,
  type ApplicationDocument
} from "./document.js";

/** Bumped whenever the bundle parser needs a new branch. */
export const APPLICATION_BUNDLE_SCHEMA_VERSION = 1 as const;

/**
 * A workflow graph, structural so this package stays dependency-free. The
 * pinned Zod contract lives in `@nodetool-ai/protocol`.
 */
export interface BundleGraph {
  nodes: unknown[];
  edges: unknown[];
}

/** One workflow carried by a bundle, addressed by its bundle-local `key`. */
export interface BundledWorkflow {
  /** Bundle-local identifier that operations reference in place of an id. */
  key: string;
  name: string;
  description?: string;
  graph: BundleGraph;
  /**
   * What the release pinned for this workflow: the workflow version written
   * at publish time and the hash of the graph frozen with it. Both null for a
   * draft export, which pins nothing.
   */
  version?: number | null;
  graphHash?: string | null;
}

export interface ApplicationBundle {
  schemaVersion: number;
  name: string;
  description: string;
  /** The application document; its operations reference `workflows[].key`. */
  app: ApplicationDocument;
  workflows: BundledWorkflow[];
}

/** The application side of an export — an application row, structurally. */
export interface BundleApplicationSource {
  name: string;
  description?: string;
  document: ApplicationDocument;
}

/**
 * One workflow to carry, keyed by the real id the document's operations use.
 * Mirrors an entry of `application_versions.workflow_graphs` plus the
 * workflow's name, so a released app exports exactly what it runs.
 */
export interface BundleWorkflowSource {
  workflowId: string;
  name: string;
  description?: string;
  graph: BundleGraph;
  version?: number | null;
  graphHash?: string | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isGraph = (value: unknown): value is BundleGraph =>
  isRecord(value) && Array.isArray(value.nodes) && Array.isArray(value.edges);

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    // The collapse above leaves at most one dash at each end, so single-character
    // anchors suffice — `/^-+|-+$/` backtracks polynomially on dash-heavy names.
    .replace(/^-/, "")
    .replace(/-$/, "");

/** A readable, collision-free key per workflow, stable for a given input order. */
const assignKeys = (workflows: readonly BundleWorkflowSource[]): Map<string, string> => {
  const keys = new Map<string, string>();
  const taken = new Set<string>();
  for (const workflow of workflows) {
    if (keys.has(workflow.workflowId)) continue;
    const base = slugify(workflow.name) || "workflow";
    let key = base;
    let suffix = 2;
    while (taken.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(key);
    keys.set(workflow.workflowId, key);
  }
  return keys;
};

/** Rewrite every operation's `workflowId` through `map`, leaving misses alone. */
const rewriteOperations = (
  document: ApplicationDocument,
  map: ReadonlyMap<string, string>
): ApplicationDocument => ({
  ...document,
  operations: document.operations.map((operation) => {
    const replacement = map.get(operation.workflowId);
    return replacement === undefined
      ? operation
      : { ...operation, workflowId: replacement };
  })
});

/**
 * Serialize an application and its workflows into a bundle: operations stop
 * pointing at workflow ids and point at bundle-local keys instead.
 *
 * A workflow an operation binds but `workflows` does not carry keeps its raw
 * id — the link is already broken, and dropping the operation would hide it.
 */
export const bundleFromApplication = (
  app: BundleApplicationSource,
  workflows: readonly BundleWorkflowSource[]
): ApplicationBundle => {
  const keys = assignKeys(workflows);
  const seen = new Set<string>();
  const bundled: BundledWorkflow[] = [];
  for (const workflow of workflows) {
    if (seen.has(workflow.workflowId)) continue;
    seen.add(workflow.workflowId);
    const key = keys.get(workflow.workflowId);
    if (key === undefined) continue;
    bundled.push({
      key,
      name: workflow.name,
      ...(workflow.description === undefined
        ? {}
        : { description: workflow.description }),
      graph: workflow.graph,
      version: workflow.version ?? null,
      graphHash: workflow.graphHash ?? null
    });
  }
  return {
    schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
    name: app.name,
    description: app.description ?? "",
    app: rewriteOperations(app.document, keys),
    workflows: bundled
  };
};

/** A workflow an importer must create, with the id it was assigned. */
export interface ResolvedBundleWorkflow extends BundledWorkflow {
  /** The id the caller persists this workflow under. */
  id: string;
}

export interface ApplyBundleResult {
  app: {
    name: string;
    description: string;
    document: ApplicationDocument;
  };
  workflows: ResolvedBundleWorkflow[];
}

export interface ApplyBundleOptions {
  /**
   * Mints the id each carried workflow is created under. Defaults to
   * `crypto.randomUUID()`; pass one in when the caller owns id generation
   * (the models layer's time-ordered uuid) or a test wants determinism.
   */
  newWorkflowId?: (workflow: BundledWorkflow, index: number) => string;
}

const defaultWorkflowId = (): string => {
  const uuid = globalThis.crypto?.randomUUID;
  if (typeof uuid !== "function") {
    throw new Error(
      "applyBundle needs a newWorkflowId option: crypto.randomUUID is unavailable"
    );
  }
  return globalThis.crypto.randomUUID();
};

/**
 * Turn a bundle back into an application plus the workflows to create: every
 * carried workflow gets a fresh id, and the document's operations are
 * rewritten from bundle keys to those ids.
 *
 * Pure — the caller writes the rows, in whatever order its storage needs.
 */
export const applyBundle = (
  bundle: ApplicationBundle,
  options: ApplyBundleOptions = {}
): ApplyBundleResult => {
  const mint = options.newWorkflowId ?? defaultWorkflowId;
  const workflows: ResolvedBundleWorkflow[] = bundle.workflows.map(
    (workflow, index) => ({ ...workflow, id: mint(workflow, index) })
  );
  const keyToId = new Map(workflows.map((w) => [w.key, w.id]));
  return {
    app: {
      name: bundle.name,
      description: bundle.description,
      document: rewriteOperations(bundle.app, keyToId)
    },
    workflows
  };
};

const parseWorkflow = (value: unknown): BundledWorkflow | null => {
  if (!isRecord(value)) return null;
  const { key, name, graph } = value;
  if (typeof key !== "string" || key.length === 0) return null;
  if (!isGraph(graph)) return null;
  return {
    key,
    name: typeof name === "string" ? name : key,
    ...(typeof value.description === "string"
      ? { description: value.description }
      : {}),
    graph,
    version: typeof value.version === "number" ? value.version : null,
    graphHash: typeof value.graphHash === "string" ? value.graphHash : null
  };
};

/**
 * Parse an unknown value into an {@link ApplicationBundle}, or null when it is
 * not one. A future schema version is rejected rather than guessed at, and a
 * workflow entry without a key or a graph is dropped. The document goes
 * through `parseApplicationDocument`, so a bundle carrying a legacy
 * `{ version, data }` document parses too.
 */
export const parseApplicationBundle = (
  value: unknown
): ApplicationBundle | null => {
  if (!isRecord(value)) return null;
  const schemaVersion =
    typeof value.schemaVersion === "number"
      ? value.schemaVersion
      : APPLICATION_BUNDLE_SCHEMA_VERSION;
  if (schemaVersion > APPLICATION_BUNDLE_SCHEMA_VERSION) return null;
  const app = parseApplicationDocument(value.app);
  if (!app) return null;
  const workflows = Array.isArray(value.workflows)
    ? value.workflows
        .map(parseWorkflow)
        .filter((w): w is BundledWorkflow => w !== null)
    : [];
  return {
    schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
    name: typeof value.name === "string" ? value.name : "Untitled app",
    description: typeof value.description === "string" ? value.description : "",
    app,
    workflows
  };
};

/** The bundle as a file's contents. */
export const serializeApplicationBundle = (bundle: ApplicationBundle): string =>
  `${JSON.stringify(bundle, null, 2)}\n`;
