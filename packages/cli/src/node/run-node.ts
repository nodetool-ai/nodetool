/**
 * Runs a single node in isolation — instantiate it from the registry, feed it a
 * property bag, and capture what its `process()` / `genProcess()` emits. Lets an
 * agent exercise one node's logic without authoring a whole workflow.
 *
 * Integration code (pulls in every node pack + a runtime context), so it's
 * exercised end-to-end rather than unit-tested.
 */
import { getDefaultAssetsPath } from "@nodetool-ai/config";
import { ProcessingContext, FileStorageAdapter } from "@nodetool-ai/runtime";
import { buildFullRegistry } from "../node-registry.js";

export interface NodeRunResult {
  nodeType: string;
  title: string | null;
  ok: boolean;
  error: string | null;
  durationMs: number;
  /** Every record emitted by the node (one entry for a one-shot process()). */
  chunks: Array<Record<string, unknown>>;
  /** Declared output handles, for reference. */
  outputs: Array<{ name: string; type: string }>;
}

export interface RunSingleNodeOptions {
  /** Property values keyed by @prop name. */
  props?: Record<string, unknown>;
  /**
   * Resolves secrets (API keys) for nodes that need them. Injected by the
   * caller so this module stays free of a hard `@nodetool-ai/models` import
   * (which would pull in the SQLite native binding for hermetic runs). When
   * omitted, every secret resolves to null.
   */
  secretResolver?: (key: string) => Promise<string | null>;
}

function typeMetaToString(tm: { type: string; type_args?: unknown[] } | undefined): string {
  if (!tm) return "";
  const args = ((tm.type_args ?? []) as Array<{ type: string; type_args?: unknown[] }>)
    .map(typeMetaToString)
    .filter(Boolean);
  return args.length > 0 ? `${tm.type}[${args.join(", ")}]` : tm.type;
}

export async function runSingleNode(
  nodeType: string,
  options: RunSingleNodeOptions = {}
): Promise<NodeRunResult> {
  const registry = buildFullRegistry();
  if (!registry.has(nodeType)) {
    throw new Error(
      `Unknown node type "${nodeType}". It is not in the local TS registry (Python-only nodes can't be run this way).`
    );
  }

  const cls = registry.getClass(nodeType)!;
  const meta = registry.getMetadata(nodeType);
  const title = meta?.title ?? null;
  const outputs = (meta?.outputs ?? []).map((o) => ({
    name: o.name,
    type: typeMetaToString(o.type)
  }));

  if ((cls as { isStreamingInput?: boolean }).isStreamingInput) {
    throw new Error(
      `Node "${nodeType}" is a streaming-input node — it consumes a live input stream and must run inside a graph. Use \`nodetool debug\` instead.`
    );
  }

  const props = options.props ?? {};
  const executor = registry.resolve({ id: "single-run", type: nodeType, properties: props });

  const context = new ProcessingContext({
    jobId: `node-run-${Date.now()}`,
    workflowId: null,
    userId: "1",
    secretResolver: options.secretResolver ?? (() => Promise.resolve(null)),
    storage: new FileStorageAdapter(getDefaultAssetsPath())
  });

  const startedAt = Date.now();
  const chunks: Array<Record<string, unknown>> = [];
  try {
    // Drain genProcess: this covers both one-shot nodes (the default genProcess
    // yields process() once) and streaming-output nodes that override it.
    for await (const chunk of executor.genProcess!(props, context)) {
      chunks.push(chunk);
    }
    return {
      nodeType,
      title,
      ok: true,
      error: null,
      durationMs: Date.now() - startedAt,
      chunks,
      outputs
    };
  } catch (err) {
    return {
      nodeType,
      title,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
      chunks,
      outputs
    };
  }
}
