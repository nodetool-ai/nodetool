/**
 * What replaces the `Tool` class: a spec (the schema-shaped identity), an
 * implementation that takes a run context as its first argument, and a per-run
 * object carrying everything a capability needs that only exists per run.
 *
 * The class dissolves into data plus a function. Per-run state moves from
 * *construction* time (today's fresh belt per turn) to *call* time, which is
 * the property a process-level registry needs.
 *
 * Design: docs/tool-class-retirement-design.md § "What replaces `Tool`".
 */

import type {
  BaseProvider,
  JsonSchema,
  ProcessingContext
} from "@nodetool-ai/runtime";
import type { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { PermissionGateOptions } from "../tools/tool-permissions.js";
import type { PermissionCategory } from "../tools/tool-permissions.js";
import type { SubAgentToolRuntime } from "../subagent.js";
import type {
  ExampleWorkflowCatalog,
  ModelCatalogs,
  PackageAssetLister,
  SketchLoader,
  TimelineLoader,
  WorkflowDslExporter,
  WorkflowEnvironmentProvider
} from "../tools/mcp-tools.js";

export type { PermissionCategory };

/** The schema-shaped identity of one capability. */
export interface CapabilitySpec {
  /** Wire name, unchanged from the tool it replaces: "list_workflows". */
  readonly name: string;
  readonly description: string;
  /** Rendered for prompts, `searchTools()`, and MCP. */
  readonly inputSchema: JsonSchema;
  /**
   * REQUIRED — there is no default-to-`external` fallback here. The string-keyed
   * map's conservative default is right for a map and wrong for a typed
   * registry: a required field plus a drift test turns a misclassification into
   * a reviewable diff instead of a runtime surprise.
   */
  readonly category: PermissionCategory;
  /** User-facing status template, the analog of `Tool.userMessage`. */
  userMessage?(args: Record<string, unknown>): string;
}

/** One capability's implementation. The run threads through every call. */
export type CapabilityImpl = (
  run: CapabilityRun,
  args: Record<string, unknown>
) => Promise<unknown>;

/**
 * The permission gate a run carries. Identical to the options `gateTools` takes
 * today — mode, the shared session allow-set, the approval round trip, and the
 * optional security-monitor consult — because the gate that moves into
 * {@link CapabilityRun.invoke} is that gate, not a second one.
 */
export type CapabilityGate = PermissionGateOptions;

/**
 * Browser round trip for `ui_*` capabilities. Those are schemas, not host
 * functions: the chat runner routes them over the ToolBridge and the MCP mount
 * routes the document tools to a live renderer. Absent on headless runs.
 */
export interface ClientToolRouter {
  execute(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/**
 * provider, model, `parentTools()`, `forwardMessage` — what `run_subtask` and
 * `run_search` take as constructor options today.
 */
export type SubAgentRuntime = SubAgentToolRuntime;

/** Row loaders for the surfaces whose API is tRPC-only. */
export interface CapabilityLoaders {
  timeline?: TimelineLoader;
  sketch?: SketchLoader;
}

/** Everything a capability call needs that only exists per run. */
export interface CapabilityRun {
  readonly context: ProcessingContext;
  /** The one gate. decide → (ask ↔ UI) → monitor → run; owns the session allow-set. */
  readonly gate: CapabilityGate;
  /** Browser round trip for `ui_*` capabilities; absent on headless runs. */
  readonly client?: ClientToolRouter;
  /** What `run_subtask` / `run_search` need. */
  readonly subAgent?: SubAgentRuntime;
  // The injected singletons `getAllMcpTools` takes today (mcp-tools.ts).
  readonly nodeRegistry?: NodeRegistry;
  readonly providers?: Record<string, BaseProvider>;
  readonly examples?: ExampleWorkflowCatalog;
  readonly exportDsl?: WorkflowDslExporter;
  /**
   * Provider/model catalogs the graph checks validate against. Defaults to the
   * runtime's own where a run supplies none — this is the constructor argument
   * `create_workflow` and `validate_workflow` took, so a caller with a
   * different catalog (or a test) can still supply one.
   */
  readonly modelCatalogs?: ModelCatalogs;
  readonly listPackageAssets?: PackageAssetLister;
  readonly workflowEnvironment?: WorkflowEnvironmentProvider;
  readonly loaders?: CapabilityLoaders;
  /** The single choke point: lookup → gate → impl. Every surface calls this. */
  invoke(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** One registered capability: what it is, and what it does. */
export interface CapabilityExport {
  readonly spec: CapabilitySpec;
  readonly impl: CapabilityImpl;
}

/** One namespace's capabilities — the unit the registry loads lazily. */
export interface CapabilityModule {
  /** Module key, matching its slot in the registry table: "workflows". */
  readonly module: string;
  readonly exports: readonly CapabilityExport[];
}

/** Every category a spec may carry, for walks and validation. */
export const PERMISSION_CATEGORIES: readonly PermissionCategory[] = [
  "read",
  "write",
  "execute",
  "external"
];
