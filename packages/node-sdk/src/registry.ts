import type {
  GraphData,
  HydratedGraphData,
  NodeDescriptor,
  Platform
} from "@nodetool-ai/protocol";
import { supportsPlatform } from "@nodetool-ai/protocol";
import type { NodeExecutor, ResolvedNodeType } from "@nodetool-ai/kernel";
import type { NodeClass } from "./base-node.js";
import { hasStreamingOutput } from "./base-node.js";
import type {
  NodeMetadata,
  PythonMetadataLoadOptions,
  PythonMetadataLoadResult
} from "./metadata.js";
import { loadPythonPackageMetadata } from "./metadata.js";
import { getNodeMetadata } from "./node-metadata.js";
import type { NodePropertyValidationIssue } from "./validation.js";
import type { ScoredNode, ScoreOptions } from "./search.js";
import { NodeSearchIndex } from "./search.js";

export interface NodeRegistryOptions {
  metadataByType?: Map<string, NodeMetadata>;
  strictMetadata?: boolean;
}

export interface RegisterNodeOptions {
  metadata?: NodeMetadata;
}

export interface RegistryGraphResolverOptions {
  loadNamespace?: (
    namespace: string,
    registry: NodeRegistry
  ) => Promise<void> | void;
}

export class NodeRegistry {
  private _classes = new Map<string, NodeClass>();
  private _loadedMetadataByType = new Map<string, NodeMetadata>();
  private _registeredMetadataByType = new Map<string, NodeMetadata>();
  private _strictMetadata: boolean;

  // Memoized derived views of the metadata maps above. Both are O(n) to build,
  // and `listMetadata`/`searchMetadata` are called many times per graph build
  // (the planner searches the same registry 5–10× per attempt). They are
  // rebuilt lazily and invalidated by every mutation (`register`, `unregister`,
  // `clear`, `loadMetadata`, `loadPythonMetadata`).
  private _mergedMetadataCache: NodeMetadata[] | null = null;
  private _searchIndexCache: NodeSearchIndex | null = null;

  constructor(options: NodeRegistryOptions = {}) {
    // Stryker disable next-line LogicalOperator,BooleanLiteral: _strictMetadata only gated the (unreachable) strict-throw branch, so its value has no observable effect — the default is inert (equivalent).
    this._strictMetadata = options.strictMetadata ?? false;
    if (options.metadataByType) {
      for (const [nodeType, metadata] of options.metadataByType.entries()) {
        this._loadedMetadataByType.set(nodeType, metadata);
      }
    }
  }

  register(nodeClass: NodeClass, options: RegisterNodeOptions = {}): void {
    if (!nodeClass.nodeType) {
      throw new Error(
        `Cannot register node class without nodeType: ${nodeClass.name}`
      );
    }
    // Last write wins (needed for hot reload), but warn so accidental node
    // type collisions between packages don't go unnoticed.
    const existing = this._classes.get(nodeClass.nodeType);
    if (existing && existing !== nodeClass) {
      console.warn(
        // Stryker disable next-line StringLiteral: operator diagnostic text only.
        `[NodeRegistry] Replacing existing registration for node type: ${nodeClass.nodeType}`
      );
    }
    // TS class definitions are the source of truth for TS nodes.
    // Python metadata is NOT merged — it is only used for Python-only
    // node packs (huggingface, mlx, etc.) that have no TS class.
    const metadata = options.metadata ?? getNodeMetadata(nodeClass);

    // Stryker disable ConditionalExpression,BlockStatement,StringLiteral: getNodeMetadata always returns a populated object for a valid class, so `metadata` is always truthy and the strict-mode else branch is unreachable dead defensive code.
    if (metadata) {
      this._registeredMetadataByType.set(nodeClass.nodeType, metadata);
    } else if (this._strictMetadata) {
      throw new Error(
        `Missing resolved metadata for node type: ${nodeClass.nodeType}`
      );
    }
    // Stryker restore ConditionalExpression,BlockStatement,StringLiteral
    this._classes.set(nodeClass.nodeType, nodeClass);
    this.invalidateMetadataCaches();
  }

  /**
   * Drop the memoized metadata array and search index. Called by every
   * mutation so the next read rebuilds from the current maps.
   */
  private invalidateMetadataCaches(): void {
    this._mergedMetadataCache = null;
    this._searchIndexCache = null;
  }

  /**
   * Merged metadata for every node (loaded Python metadata first, registered TS
   * metadata last so a TS class wins on a node_type collision). Built once and
   * memoized; callers that mutate the result must copy it first.
   */
  private mergedMetadata(): NodeMetadata[] {
    if (this._mergedMetadataCache === null) {
      const merged = new Map<string, NodeMetadata>();
      for (const [nodeType, metadata] of this._loadedMetadataByType.entries()) {
        merged.set(nodeType, metadata);
      }
      for (const [
        nodeType,
        metadata
      ] of this._registeredMetadataByType.entries()) {
        merged.set(nodeType, metadata);
      }
      this._mergedMetadataCache = [...merged.values()];
    }
    return this._mergedMetadataCache;
  }

  /**
   * Validate a node descriptor against its registered class's @prop schema.
   *
   * Returns an empty array when:
   *   - the class is not registered (the runner will surface that elsewhere), or
   *   - all required/model fields are populated.
   */
  validateNode(
    descriptor: NodeDescriptor,
    connectedHandles?: ReadonlySet<string> | ReadonlyArray<string>
  ): NodePropertyValidationIssue[] {
    const NodeClass = this._classes.get(descriptor.type);
    if (!NodeClass) return [];
    const properties =
      (descriptor.properties as Record<string, unknown> | undefined) ?? {};
    return NodeClass.validateProperties(properties, {
      connectedHandles,
      nodeId: descriptor.id
    });
  }

  /**
   * Create a validator function compatible with WorkflowRunnerOptions.validateNode.
   * Bound to this registry, so the runner can call it without holding a
   * reference to the registry itself.
   */
  createNodeValidator(): (
    descriptor: NodeDescriptor,
    connectedHandles: ReadonlySet<string>
  ) => NodePropertyValidationIssue[] {
    return (descriptor, connectedHandles) =>
      this.validateNode(descriptor, connectedHandles);
  }

  /**
   * Return a new NodeRegistry containing only the node classes that declare
   * support for `target`. Loaded (Python) metadata is copied across when the
   * matching class is included.
   *
   * Used at bundle / deployment time to construct a registry tailored to the
   * active platform — the workflow runner then naturally fails on any graph
   * referencing an unsupported node type.
   */
  forPlatform(target: Platform): NodeRegistry {
    // Stryker disable next-line ObjectLiteral: _strictMetadata only gated the unreachable strict-throw, so propagating it (vs {}) has no observable effect (equivalent).
    const filtered = new NodeRegistry({
      strictMetadata: this._strictMetadata
    });
    for (const [nodeType, nodeClass] of this._classes) {
      if (!supportsPlatform(nodeClass.platforms, target)) continue;
      const metadata = this._registeredMetadataByType.get(nodeType);
      filtered.register(nodeClass, metadata ? { metadata } : {});
      const loaded = this._loadedMetadataByType.get(nodeType);
      // Stryker disable next-line ConditionalExpression: every kept node is re-registered with derived metadata above (which getMetadata returns first), so copying the loaded entry is unobservable (equivalent).
      if (loaded) filtered._loadedMetadataByType.set(nodeType, loaded);
    }
    return filtered;
  }

  /**
   * Validator that rejects nodes not supporting `target`. Compose with
   * {@link createNodeValidator} when enforcing platform constraints in a
   * registry that contains nodes for multiple platforms.
   */
  createPlatformValidator(
    target: Platform
  ): (
    descriptor: NodeDescriptor,
    connectedHandles: ReadonlySet<string>
  ) => NodePropertyValidationIssue[] {
    return (descriptor) => {
      const nodeClass = this._classes.get(descriptor.type);
      const platforms =
        nodeClass?.platforms ??
        this.resolveMetadata(descriptor.type)?.platforms;
      if (supportsPlatform(platforms, target)) return [];
      const supported =
        platforms && platforms.length > 0 ? platforms.join(", ") : "node";
      return [
        {
          nodeId: descriptor.id,
          nodeType: descriptor.type,
          property: "*",
          code: "unsupported_platform",
          message: `Node ${descriptor.type} is not supported on platform '${target}' (supports: ${supported})`
        }
      ];
    };
  }

  resolve(descriptor: NodeDescriptor): NodeExecutor {
    const NodeClass = this._classes.get(descriptor.type);
    if (!NodeClass) {
      throw new Error(`Unknown node type: ${descriptor.type}`);
    }
    const instance = new NodeClass(
      (descriptor.properties as Record<string, unknown> | undefined) ?? {}
    );
    instance.__node_id = descriptor.id;
    instance.__node_name = descriptor.name ?? descriptor.type;
    // Stryker disable next-line ConditionalExpression: forcing this true assigns _dynamic_outputs = undefined, which reads back identically to leaving it unset (equivalent).
    if (descriptor.dynamic_outputs) {
      (instance as unknown as Record<string, unknown>)._dynamic_outputs = descriptor.dynamic_outputs;
    }
    return instance.toExecutor();
  }

  getClass(nodeType: string): NodeClass | undefined {
    return this._classes.get(nodeType);
  }

  has(nodeType: string): boolean {
    return this._classes.has(nodeType);
  }

  list(): string[] {
    return [...this._classes.keys()];
  }

  getMetadata(nodeType: string): NodeMetadata | undefined {
    return (
      this._registeredMetadataByType.get(nodeType) ??
      this._loadedMetadataByType.get(nodeType)
    );
  }

  resolveMetadata(nodeType: string): NodeMetadata | undefined {
    const exact = this.getMetadata(nodeType);
    if (exact) return exact;
    if (nodeType.endsWith("Node")) {
      return this.getMetadata(nodeType.slice(0, -4));
    }
    return undefined;
  }

  listMetadata(): NodeMetadata[] {
    // Fresh copy each call: some callers (http-api, tRPC nodes router) sort the
    // result in place, which must not reorder the shared cache.
    return [...this.mergedMetadata()];
  }

  /**
   * Rank registered nodes against `terms` using a memoized search index.
   *
   * Equivalent to `rankNodeMetadata(this.listMetadata(), terms, options)` but
   * reuses a precomputed index across calls — the planner's inner loop. The
   * index is invalidated whenever the registry changes.
   */
  searchMetadata(
    terms: readonly string[],
    options: ScoreOptions = {}
  ): ScoredNode[] {
    if (this._searchIndexCache === null) {
      this._searchIndexCache = new NodeSearchIndex(this.mergedMetadata());
    }
    return this._searchIndexCache.rank(terms, options);
  }

  listRegisteredNodeTypesWithoutMetadata(): string[] {
    // Stryker disable next-line ArrowFunction,ConditionalExpression: register() always stores derived metadata, so getMetadata is never undefined for a registered type — this filter always yields [] regardless of the predicate (equivalent).
    return this.list().filter((nodeType) => this.getMetadata(nodeType) === undefined);
  }

  /** Add or replace metadata for a node type (e.g. from Python bridge). */
  loadMetadata(nodeType: string, metadata: NodeMetadata): void {
    this._loadedMetadataByType.set(nodeType, metadata);
    this.invalidateMetadataCaches();
  }

  loadPythonMetadata(
    options: PythonMetadataLoadOptions = {}
  ): PythonMetadataLoadResult {
    const loaded = loadPythonPackageMetadata(options);
    for (const [nodeType, metadata] of loaded.nodesByType.entries()) {
      this._loadedMetadataByType.set(nodeType, metadata);
    }
    this.invalidateMetadataCaches();
    return loaded;
  }

  /**
   * Remove a node type from the registry.
   * Returns true if the node type was present and removed.
   */
  unregister(nodeType: string): boolean {
    const hadClass = this._classes.delete(nodeType);
    this._loadedMetadataByType.delete(nodeType);
    this._registeredMetadataByType.delete(nodeType);
    this.invalidateMetadataCaches();
    return hadClass;
  }

  clear(): void {
    this._classes.clear();
    this._loadedMetadataByType.clear();
    this._registeredMetadataByType.clear();
    this.invalidateMetadataCaches();
  }

  static readonly global = new NodeRegistry();
}

export function register(nodeClass: NodeClass): void {
  NodeRegistry.global.register(nodeClass);
}

function typeMetadataToString(
  typeMeta:
    | NodeMetadata["properties"][number]["type"]
    | NodeMetadata["outputs"][number]["type"]
): string {
  // Stryker disable next-line MethodExpression: .filter(Boolean) only drops empty renderings, which valid type metadata never produces (equivalent).
  const args = (typeMeta.type_args ?? []).map(typeMetadataToString).filter(Boolean);
  return args.length > 0 ? `${typeMeta.type}[${args.join(", ")}]` : typeMeta.type;
}

/**
 * Stamp streaming/control flags from the registry onto graph descriptors.
 * Graphs arriving from a client carry only `type` and `properties`, and the
 * kernel actor trusts `node.is_streaming_input` to pick run() over a one-shot
 * process() — without this every streaming node "completes" instantly with
 * empty outputs. The full-fat equivalent (which also resolves property/output
 * types and drops unknown node types) is `Graph.loadFromDict` with
 * `createGraphNodeTypeResolver`; this is the lightweight synchronous version
 * for runners that only need correct execution semantics.
 *
 * Flags are resolved from the node's registered TS class when present, else
 * from its loaded metadata (Python nodes have no TS class — they live only as
 * metadata loaded from the worker's `package_metadata`, so `getClass` returns
 * undefined and we must consult `resolveMetadata` or a streaming Python node
 * read from a saved graph silently runs one-shot). This mirrors
 * `Graph.loadFromDict`, which already reads the Python flag from metadata.
 * `is_streaming_output` is derived from a TS class via `hasStreamingOutput`
 * (purely structural: a `genProcess` override or iteration/forward/chunk
 * correlation — ForEach, Collection, RepeatCount), and from the metadata's
 * already-resolved boolean otherwise. Node types the registry doesn't know at
 * all keep their own flags, defaulted to false (resolveExecutor reports
 * unknown types loudly).
 */
export function hydrateGraphNodeFlags(
  graph: GraphData,
  registry: Pick<NodeRegistry, "getClass" | "resolveMetadata">
): HydratedGraphData {
  const nodes = graph.nodes.map((node) => {
    const cls = registry.getClass(node.type);
    // Fall back to loaded metadata only for class-less (Python) nodes.
    const meta = cls ? undefined : registry.resolveMetadata(node.type);
    return {
      ...node,
      // `??`, not `||`: a registered class always carries explicit booleans
      // (BaseNode defaults them to false), so the registry corrects a stale
      // saved `true` when a node type migrates away from streaming/control.
      // OR let the saved value win forever. Saved flags apply only when the
      // registry has no opinion (unknown type, or metadata omitting the flag).
      is_streaming_input:
        (cls ? cls.isStreamingInput : meta?.is_streaming_input) ??
        node.is_streaming_input ??
        false,
      is_streaming_output:
        (cls ? hasStreamingOutput(cls) : meta?.is_streaming_output) ??
        node.is_streaming_output ??
        false,
      is_controlled:
        (cls ? cls.isControlled : meta?.is_controlled) ??
        node.is_controlled ??
        false,
      is_join_node:
        (cls ? cls.isJoinNode : meta?.is_join_node) ??
        node.is_join_node ??
        false,
      always_emit_output_updates:
        (cls ? cls.alwaysEmitOutputUpdates : meta?.always_emit_output_updates) ??
        node.always_emit_output_updates ??
        false,
      input_mode: (cls ? cls.inputMode : meta?.input_mode) ?? node.input_mode,
      output_correlation:
        (cls ? cls.outputCorrelation : meta?.output_correlation) ??
        node.output_correlation
    };
  });
  return { nodes, edges: [...graph.edges] };
}

function deriveNamespace(nodeType: string): string {
  const lastDot = nodeType.lastIndexOf(".");
  // Stryker disable next-line EqualityOperator: at lastDot === 0 both arms yield "" (slice(0,0) === the else ""), so > 0 vs >= 0 are indistinguishable (equivalent).
  return lastDot > 0 ? nodeType.slice(0, lastDot) : "";
}

export function createGraphNodeTypeResolver(
  registry: NodeRegistry,
  options: RegistryGraphResolverOptions = {}
): { resolveNodeType: (nodeType: string) => Promise<ResolvedNodeType | null> } {
  return {
    resolveNodeType: async (
      nodeType: string
    ): Promise<ResolvedNodeType | null> => {
      let metadata = registry.resolveMetadata(nodeType);

      if (!metadata) {
        const namespace = deriveNamespace(nodeType);
        if (namespace && options.loadNamespace) {
          await options.loadNamespace(namespace, registry);
          metadata = registry.resolveMetadata(nodeType);
        }
      }

      if (!metadata) return null;

      const propertyTypes = Object.fromEntries(
        (metadata.properties ?? []).map((prop) => [
          prop.name,
          typeMetadataToString(prop.type)
        ])
      );
      const propertyMeta = Object.fromEntries(
        // Stryker disable next-line ArrayDeclaration: a bogus seed element lacks description/min/max, so the .filter below drops it — the result is unchanged (equivalent).
        (metadata.properties ?? [])
          .filter((p) => p.description || p.min != null || p.max != null)
          .map((p) => [
            p.name,
            {
              ...(p.description ? { description: p.description } : {}),
              ...(p.min != null ? { min: p.min } : {}),
              ...(p.max != null ? { max: p.max } : {})
            }
          ])
      );
      const outputs = Object.fromEntries(
        (metadata.outputs ?? []).map((output) => [
          output.name,
          typeMetadataToString(output.type)
        ])
      );
      return {
        nodeType: metadata.node_type,
        propertyTypes,
        outputs,
        supportsDynamicInputs: metadata.supports_dynamic_inputs ?? false,
        descriptorDefaults: {
          name: metadata.title,
          // Explicit booleans, never omitted: Graph.loadFromDict resolves each
          // flag as `descriptorDefaults.flag ?? saved ?? false`, so an omitted
          // false here would let a stale saved `true` survive a node type's
          // migration away from streaming/control. Metadata is built from the
          // class statics (BaseNode defaults false), so absent means false.
          is_streaming_input: metadata.is_streaming_input ?? false,
          is_streaming_output: metadata.is_streaming_output ?? false,
          is_controlled: metadata.is_controlled ?? false,
          is_join_node: metadata.is_join_node ?? false,
          ...(metadata.input_mode && { input_mode: metadata.input_mode }),
          ...(metadata.output_correlation && {
            output_correlation: metadata.output_correlation
          }),
          ...(metadata.always_emit_output_updates && {
            always_emit_output_updates: true
          }),
          ...(Object.keys(propertyMeta).length > 0 && { propertyMeta })
        }
      };
    }
  };
}
