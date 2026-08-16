import type { Mutable } from "./mutable.js";
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
  isCallable,
  isNonEmptyString,
  isNumber,
  isRecord,
  isString
} from "./predicates.js";
import {
  operationTarget,
  parseApplicationDocument,
  type ApplicationDocument,
  type OperationBinding
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
   * A stable identity for this workflow across installs. An importer that
   * already has the workflow this names reuses it rather than creating a
   * duplicate row — which is how two shipped example apps can bind the same
   * template and end up sharing one workflow. Absent on a hand-exported
   * bundle, which always creates fresh workflows.
   */
  sourceId?: string;
  /**
   * What the release pinned for this workflow: the workflow version written
   * at publish time and the hash of the graph frozen with it. Both null for a
   * draft export, which pins nothing.
   */
  version?: number | null;
  graphHash?: string | null;
}

/**
 * A JS script document, structural for the same reason {@link BundleGraph} is:
 * the pinned Zod contract lives in `@nodetool-ai/protocol`, which this package
 * does not depend on. A consumer that needs the real document parses it there.
 */
export interface BundleJsScriptDocument {
  schemaVersion: number;
  code: string;
  inputs: Array<{ name: string; type: string }>;
  outputs: Array<{ name: string; type: string }>;
}

/** One JS script carried by a bundle, addressed by its bundle-local `key`. */
export interface BundledJsScript {
  /** Bundle-local identifier that script operations reference in place of an id. */
  key: string;
  name: string;
  /** The document of the version the operations pin. */
  document: BundleJsScriptDocument;
  /** See {@link BundledWorkflow.sourceId}. */
  sourceId?: string;
  /** The version number the exporting install pinned; null when unpinned. */
  version?: number | null;
}

export interface ApplicationBundle {
  schemaVersion: number;
  name: string;
  description: string;
  /**
   * The application document; its operations reference `workflows[].key` and
   * `scripts[].key` in place of real ids.
   */
  app: ApplicationDocument;
  workflows: BundledWorkflow[];
  scripts: BundledJsScript[];
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
/** One script to carry, keyed by the real id the document's operations use. */
export interface BundleJsScriptSource {
  scriptId: string;
  name: string;
  document: BundleJsScriptDocument;
  /** See {@link BundledWorkflow.sourceId}. */
  sourceId?: string;
  version?: number | null;
}

export interface BundleWorkflowSource {
  workflowId: string;
  name: string;
  description?: string;
  /** See {@link BundledWorkflow.sourceId}. */
  sourceId?: string;
  graph: BundleGraph;
  version?: number | null;
  graphHash?: string | null;
}

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

/** A readable, collision-free key per id, stable for a given input order. */
const assignKeys = (
  items: ReadonlyArray<{ id: string; name: string }>,
  fallback: string
): Map<string, string> => {
  const keys = new Map<string, string>();
  const taken = new Set<string>();
  for (const item of items) {
    if (keys.has(item.id)) continue;
    const base = slugify(item.name) || fallback;
    let key = base;
    let suffix = 2;
    while (taken.has(key)) {
      key = `${base}-${suffix}`;
      suffix += 1;
    }
    taken.add(key);
    keys.set(item.id, key);
  }
  return keys;
};

/**
 * Rewrite every operation's target id through the map for its kind, leaving
 * misses alone: an id no carried entry covers is a link that is already broken,
 * and dropping the operation would hide it.
 */
const rewriteOperations = (
  document: ApplicationDocument,
  workflowMap: ReadonlyMap<string, string>,
  scriptMap: ReadonlyMap<string, string>
): ApplicationDocument => ({
  ...document,
  operations: document.operations.map((operation): OperationBinding => {
    const target = operationTarget(operation);
    if (target.kind === "script") {
      const replacement = scriptMap.get(target.scriptId);
      return replacement === undefined
        ? operation
        : {
            ...operation,
            target: { ...target, scriptId: replacement }
          };
    }
    const replacement = workflowMap.get(operation.workflowId);
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
  workflows: readonly BundleWorkflowSource[],
  scripts: readonly BundleJsScriptSource[] = []
): ApplicationBundle => {
  const keys = assignKeys(
    workflows.map((workflow) => ({
      id: workflow.workflowId,
      name: workflow.name
    })),
    "workflow"
  );
  const scriptKeys = assignKeys(
    scripts.map((script) => ({ id: script.scriptId, name: script.name })),
    "script"
  );
  const seen = new Set<string>();
  const bundled: BundledWorkflow[] = [];
  for (const workflow of workflows) {
    if (seen.has(workflow.workflowId)) continue;
    seen.add(workflow.workflowId);
    const key = keys.get(workflow.workflowId);
    if (key === undefined) continue;
    type EntryFields = Mutable<BundledWorkflow>;
    const entry: EntryFields = {
      key,
      name: workflow.name,
      graph: workflow.graph,
      version: workflow.version ?? null,
      graphHash: workflow.graphHash ?? null
    };
    if (workflow.description !== undefined) {
      entry.description = workflow.description;
    }
    if (workflow.sourceId !== undefined) {
      entry.sourceId = workflow.sourceId;
    }
    bundled.push(entry);
  }
  const seenScripts = new Set<string>();
  const bundledScripts: BundledJsScript[] = [];
  for (const script of scripts) {
    if (seenScripts.has(script.scriptId)) continue;
    seenScripts.add(script.scriptId);
    const key = scriptKeys.get(script.scriptId);
    if (key === undefined) continue;
    type EntryFields2 = Mutable<BundledJsScript>;
    const entry: EntryFields2 = {
      key,
      name: script.name,
      document: script.document,
      version: script.version ?? null
    };
    if (script.sourceId !== undefined) {
      entry.sourceId = script.sourceId;
    }
    bundledScripts.push(entry);
  }
  return {
    schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
    name: app.name,
    description: app.description ?? "",
    app: rewriteOperations(app.document, keys, scriptKeys),
    workflows: bundled,
    scripts: bundledScripts
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
  scripts: ResolvedBundleJsScript[];
}

/** A script an importer must create, with the id it was assigned. */
export interface ResolvedBundleJsScript extends BundledJsScript {
  /** The id the caller persists this script under. */
  id: string;
}

export interface ApplyBundleOptions {
  /**
   * Mints the id each carried workflow is created under. Defaults to
   * `crypto.randomUUID()`; pass one in when the caller owns id generation
   * (the models layer's time-ordered uuid) or a test wants determinism.
   */
  newWorkflowId?: (workflow: BundledWorkflow, index: number) => string;
  /** Mints the id each carried script is created under. Same default. */
  newScriptId?: (script: BundledJsScript, index: number) => string;
}

const defaultMintedId = (option: string): string => {
  const uuid = globalThis.crypto?.randomUUID;
  if (!isCallable(uuid)) {
    throw new Error(
      `applyBundle needs a ${option} option: crypto.randomUUID is unavailable`
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
  const mint =
    options.newWorkflowId ?? (() => defaultMintedId("newWorkflowId"));
  const mintScript =
    options.newScriptId ?? (() => defaultMintedId("newScriptId"));
  const workflows: ResolvedBundleWorkflow[] = bundle.workflows.map(
    (workflow, index) => ({ ...workflow, id: mint(workflow, index) })
  );
  const scripts: ResolvedBundleJsScript[] = bundle.scripts.map(
    (script, index) => ({ ...script, id: mintScript(script, index) })
  );
  const keyToId = new Map(workflows.map((w) => [w.key, w.id]));
  const scriptKeyToId = new Map(scripts.map((s) => [s.key, s.id]));
  return {
    app: {
      name: bundle.name,
      description: bundle.description,
      document: rewriteOperations(bundle.app, keyToId, scriptKeyToId)
    },
    workflows,
    scripts
  };
};

const isPortList = (
  value: unknown
): value is BundleJsScriptDocument["inputs"] =>
  Array.isArray(value) &&
  value.every(
    (port) => isRecord(port) && isString(port.name) && isString(port.type)
  );

/**
 * Re-pin every script operation to the version the importer actually created.
 * A bundle carries one document per script; the row it lands in has its own
 * version numbering, so the number the export pinned means nothing here.
 */
export const pinScriptVersions = (
  document: ApplicationDocument,
  versionByScriptId: ReadonlyMap<string, number>
): ApplicationDocument => ({
  ...document,
  operations: document.operations.map((operation): OperationBinding => {
    const target = operationTarget(operation);
    if (target.kind !== "script") return operation;
    const version = versionByScriptId.get(target.scriptId);
    return version === undefined
      ? operation
      : { ...operation, target: { ...target, scriptVersion: version } };
  })
});

const parseScriptDocument = (value: unknown): BundleJsScriptDocument | null => {
  if (!isRecord(value)) return null;
  if (!isString(value.code)) return null;
  if (!isPortList(value.inputs) || !isPortList(value.outputs)) return null;
  // Everything past the ports is carried through untouched — the pinned Zod
  // contract in `@nodetool-ai/protocol` is what checks the rest, wherever the
  // document is actually run.
  return {
    ...(value as Record<string, unknown>),
    schemaVersion: isNumber(value.schemaVersion) ? value.schemaVersion : 1,
    code: value.code,
    inputs: value.inputs,
    outputs: value.outputs
  } as BundleJsScriptDocument;
};

const parseScript = (value: unknown): BundledJsScript | null => {
  if (!isRecord(value)) return null;
  const { key, name } = value;
  if (!isNonEmptyString(key)) return null;
  const document = parseScriptDocument(value.document);
  if (!document) return null;
  type ParsedFields = Mutable<BundledJsScript>;
  const parsed: ParsedFields = {
    key,
    name: isString(name) ? name : key,
    document,
    version: isNumber(value.version) ? value.version : null
  };
  if (isNonEmptyString(value.sourceId)) {
    parsed.sourceId = value.sourceId;
  }
  return parsed;
};

const parseWorkflow = (value: unknown): BundledWorkflow | null => {
  if (!isRecord(value)) return null;
  const { key, name, graph } = value;
  if (!isNonEmptyString(key)) return null;
  if (!isGraph(graph)) return null;
  type ParsedFields2 = Mutable<BundledWorkflow>;
  const parsed: ParsedFields2 = {
    key,
    name: isString(name) ? name : key,
    graph,
    version: isNumber(value.version) ? value.version : null,
    graphHash: isString(value.graphHash) ? value.graphHash : null
  };
  if (isString(value.description)) {
    parsed.description = value.description;
  }
  if (isNonEmptyString(value.sourceId)) {
    parsed.sourceId = value.sourceId;
  }
  return parsed;
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
  const schemaVersion = isNumber(value.schemaVersion)
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
  const scripts = Array.isArray(value.scripts)
    ? value.scripts
        .map(parseScript)
        .filter((script): script is BundledJsScript => script !== null)
    : [];
  return {
    schemaVersion: APPLICATION_BUNDLE_SCHEMA_VERSION,
    name: isString(value.name) ? value.name : "Untitled app",
    description: isString(value.description) ? value.description : "",
    app,
    workflows,
    scripts
  };
};

/** The bundle as a file's contents. */
export const serializeApplicationBundle = (bundle: ApplicationBundle): string =>
  `${JSON.stringify(bundle, null, 2)}\n`;
