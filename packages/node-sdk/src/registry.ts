import type { NodeDescriptor } from "@nodetool/protocol";
import type { NodeExecutor, ResolvedNodeType } from "@nodetool/kernel";
import type { NodeClass } from "./base-node.js";
import type {
  NodeMetadata,
  PythonMetadataLoadOptions,
  PythonMetadataLoadResult
} from "./metadata.js";
import { loadPythonPackageMetadata } from "./metadata.js";
import { getNodeMetadata } from "./node-metadata.js";

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

    if (metadata) {
      this._registeredMetadataByType.set(nodeClass.nodeType, metadata);
    } else if (this._strictMetadata) {
      throw new Error(
        `Missing resolved metadata for node type: ${nodeClass.nodeType}`
      );
    }
    this._classes.set(nodeClass.nodeType, nodeClass);
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
    return this.list().filter(
      (nodeType) => this.getMetadata(nodeType) === undefined
    );
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
  const args = (typeMeta.type_args ?? [])
    .map(typeMetadataToString)
    .filter(Boolean);
  return args.length > 0
    ? `${typeMeta.type}[${args.join(", ")}]`
    : typeMeta.type;
}

function deriveNamespace(nodeType: string): string {
  const lastDot = nodeType.lastIndexOf(".");
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
      const NodeClass = registry.getClass(nodeType);
      const syncMode = NodeClass?.syncMode;
      return {
        nodeType: metadata.node_type,
        propertyTypes,
        outputs,
        isDynamic: metadata.is_dynamic ?? false,
        descriptorDefaults: {
          name: metadata.title,
          ...(metadata.is_streaming_input && { is_streaming_input: true }),
          ...(metadata.is_streaming_output && { is_streaming_output: true }),
          ...(metadata.is_controlled && { is_controlled: true }),
          ...(syncMode !== undefined && { sync_mode: syncMode }),
          ...(Object.keys(propertyMeta).length > 0 && { propertyMeta })
        }
      };
    }
  };
}
