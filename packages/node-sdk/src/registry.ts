import type { NodeDescriptor, Platform } from "@nodetool-ai/protocol";
import { supportsPlatform } from "@nodetool-ai/protocol";
import type { NodeExecutor, ResolvedNodeType } from "@nodetool-ai/kernel";
import type { NodeClass } from "./base-node.js";
import type {
  NodeMetadata,
  PythonMetadataLoadOptions,
  PythonMetadataLoadResult
} from "./metadata.js";
import { loadPythonPackageMetadata } from "./metadata.js";
import { getNodeMetadata } from "./node-metadata.js";
import type { NodePropertyValidationIssue } from "./validation.js";

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
      (instance as any)._dynamic_outputs = descriptor.dynamic_outputs;
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
    return [...merged.values()];
  }

  listRegisteredNodeTypesWithoutMetadata(): string[] {
    // Stryker disable next-line ArrowFunction,ConditionalExpression: register() always stores derived metadata, so getMetadata is never undefined for a registered type — this filter always yields [] regardless of the predicate (equivalent).
    return this.list().filter((nodeType) => this.getMetadata(nodeType) === undefined);
  }

  /** Add or replace metadata for a node type (e.g. from Python bridge). */
  loadMetadata(nodeType: string, metadata: NodeMetadata): void {
    this._loadedMetadataByType.set(nodeType, metadata);
  }

  loadPythonMetadata(
    options: PythonMetadataLoadOptions = {}
  ): PythonMetadataLoadResult {
    const loaded = loadPythonPackageMetadata(options);
    for (const [nodeType, metadata] of loaded.nodesByType.entries()) {
      this._loadedMetadataByType.set(nodeType, metadata);
    }
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
    return hadClass;
  }

  clear(): void {
    this._classes.clear();
    this._loadedMetadataByType.clear();
    this._registeredMetadataByType.clear();
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
          ...(metadata.is_streaming_input && { is_streaming_input: true }),
          ...(metadata.is_streaming_output && { is_streaming_output: true }),
          ...(metadata.input_mode && { input_mode: metadata.input_mode }),
          ...(metadata.output_correlation && {
            output_correlation: metadata.output_correlation
          }),
          ...(metadata.is_controlled && { is_controlled: true }),
          ...(metadata.is_join_node && { is_join_node: true }),
          ...(Object.keys(propertyMeta).length > 0 && { propertyMeta })
        }
      };
    }
  };
}
