import type { NodeDescriptor, SyncMode } from "@nodetool-ai/protocol";
import type { NodeExecutor } from "@nodetool-ai/kernel";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/runtime";
import { getDeclaredPropertiesForClass } from "./decorators.js";
import {
  validateNodeProperties,
  type NodePropertyValidationIssue
} from "./validation.js";

/**
 * Coerce an incoming property value to fit the declared type.
 *
 * The only coercion today: when the declared type is `list[T]` and the
 * value is a non-null scalar (not an array), wrap it in a one-element
 * array. This lets a single upstream value flow into a list-typed input
 * (e.g. a single Image into a `list[image]` slot) without a manual
 * wrapper node.
 */
function coerceToDeclaredType(value: unknown, declaredType: string): unknown {
  if (
    value !== null &&
    value !== undefined &&
    !Array.isArray(value) &&
    declaredType.startsWith("list[")
  ) {
    return [value];
  }
  return value;
}

export interface DeclaredOutputTypes {
  [name: string]: string;
}

export interface NodeValidationOptions {
  /**
   * Set of property names that are connected to incoming data edges. These
   * properties are produced at runtime by upstream nodes, so their current
   * value should not be flagged as missing.
   */
  connectedHandles?: ReadonlySet<string> | ReadonlyArray<string>;
  /** Node id to attach to issues. Defaults to the node's __node_id. */
  nodeId?: string;
}

export type NodeClass = {
  new (properties?: Record<string, unknown>): BaseNode;
  nodeType: string;
  title: string;
  description: string;
  layout?: string;

  recommendedModels?: unknown[];
  basicFields?: string[];
  requiredSettings?: string[];
  requiredRuntimes?: string[];
  isStreamingInput: boolean;
  isStreamingOutput: boolean;
  isDynamic: boolean;
  syncMode: SyncMode;
  isControlled: boolean;
  exposeAsTool?: boolean;
  supportsDynamicOutputs?: boolean;
  autoSaveAsset: boolean;
  modelPacks?: unknown[];
  metadataOutputTypes?: DeclaredOutputTypes;
  outputTypes: DeclaredOutputTypes;
  getDeclaredProperties(): Array<{
    name: string;
    options: { type: string; default?: unknown };
  }>;
  getDeclaredOutputs(): Record<string, string>;
  toDescriptor(id?: string): NodeDescriptor;
  validateProperties(
    properties: Record<string, unknown>,
    options?: NodeValidationOptions
  ): NodePropertyValidationIssue[];
};

// ---------------------------------------------------------------------------
// NodeProps<T> — extracts @prop-declared fields from a node class as a
// Partial type suitable for the `inputs` parameter of process().
//
// Excludes BaseNode's own members and underscore-prefixed fields so that
// only the user-declared @prop fields remain.
// ---------------------------------------------------------------------------

/** Keys that belong to BaseNode itself and should not appear in NodeProps. */
type BaseNodeKey = keyof BaseNode | "dynamicProps";

/**
 * Extract the @prop-declared fields of a node as an optional record.
 *
 * Usage:
 * ```ts
 * async process(): Promise<{ output: ImageRef }> {
 *   // Properties are assigned before process() is called
 *   const prompt = this.prompt; // typed via @prop
 * }
 * ```
 */
export type NodeProps<T extends BaseNode> = Partial<
  Pick<T, Exclude<keyof T, BaseNodeKey | `__${string}` | `_${string}`>>
>;

export abstract class BaseNode {
  static readonly nodeType: string = "";
  static readonly title: string = "";
  static readonly description: string = "";
  static readonly layout: string | undefined = undefined;

  static readonly recommendedModels: unknown[] | undefined = undefined;
  static readonly basicFields: string[] | undefined = undefined;
  static readonly requiredSettings: string[] | undefined = undefined;
  static readonly requiredRuntimes: string[] | undefined = undefined;
  static readonly isStreamingInput: boolean = false;
  static readonly isStreamingOutput: boolean = false;
  static readonly isDynamic: boolean = false;
  static readonly syncMode: SyncMode = "zip_all";
  static readonly isControlled: boolean = false;
  static readonly exposeAsTool: boolean | undefined = undefined;
  static readonly supportsDynamicOutputs: boolean | undefined = undefined;
  static readonly autoSaveAsset: boolean = false;
  static readonly modelPacks: unknown[] | undefined = undefined;
  static readonly metadataOutputTypes: DeclaredOutputTypes | undefined =
    undefined;
  static readonly outputTypes: DeclaredOutputTypes = {};

  __node_id = "";
  __node_name = "";

  protected dynamicProps = new Map<string, unknown>();

  constructor(properties: Record<string, unknown> = {}) {
    this.assign(properties);
  }

  static getDeclaredProperties() {
    return getDeclaredPropertiesForClass(this);
  }

  static getDeclaredOutputs(): Record<string, string> {
    return { ...(this.outputTypes ?? {}) };
  }

  /**
   * Validate a property bag against this node's declared @prop metadata.
   *
   * Flags two classes of problem:
   *   - Properties declared `required: true` whose value is missing/empty.
   *   - Properties whose type ends in `_model` whose value carries the
   *     "empty" provider sentinel or an empty model id.
   *
   * Properties listed in `options.connectedHandles` are ignored — those
   * receive their value from an upstream node at runtime.
   *
   * Subclasses may override this to add custom rules. Most nodes won't
   * need to: declarative `@prop` metadata is enough.
   */
  static validateProperties(
    properties: Record<string, unknown>,
    options: NodeValidationOptions = {}
  ): NodePropertyValidationIssue[] {
    const cls = this as unknown as typeof BaseNode;
    return validateNodeProperties(cls.getDeclaredProperties(), properties, {
      connectedHandles: options.connectedHandles,
      nodeId: options.nodeId,
      nodeType: cls.nodeType
    });
  }

  assign(properties: Record<string, unknown>): void {
    const ctor = this.constructor as typeof BaseNode;
    const declared = ctor.getDeclaredProperties();

    if (Object.prototype.hasOwnProperty.call(properties, "__node_id")) {
      this.__node_id = String(properties.__node_id ?? "");
    }
    if (Object.prototype.hasOwnProperty.call(properties, "__node_name")) {
      this.__node_name = String(properties.__node_name ?? "");
    }
    const declaredNames = new Set(declared.map((p) => p.name));
    for (const { name, options } of declared) {
      if (Object.prototype.hasOwnProperty.call(properties, name)) {
        // Explicit value provided — use it (auto-wrap scalars into list[T]).
        (this as any)[name] = coerceToDeclaredType(
          properties[name],
          options.type
        );
      } else if (
        (this as any)[name] === undefined &&
        Object.prototype.hasOwnProperty.call(options, "default")
      ) {
        // No value on instance yet and a default exists — apply it.
        // Deep-copy mutable defaults so instances don't share references.
        const def = options.default;
        (this as any)[name] =
          def !== null && typeof def === "object"
            ? JSON.parse(JSON.stringify(def))
            : def;
      }
    }
    // For dynamic nodes, store undeclared properties in dynamicProps
    if (ctor.isDynamic) {
      const skip = new Set(["__node_id", "__node_name", "_secrets"]);
      for (const [key, value] of Object.entries(properties)) {
        if (!declaredNames.has(key) && !skip.has(key)) {
          this.dynamicProps.set(key, value);
        }
      }
    }
  }

  serialize(): Record<string, unknown> {
    const ctor = this.constructor as typeof BaseNode;
    const result: Record<string, unknown> = {};

    for (const { name } of ctor.getDeclaredProperties()) {
      result[name] = (this as any)[name];
    }

    // Include dynamic properties so round-trip serialization is lossless
    if (ctor.isDynamic) {
      for (const [key, value] of this.dynamicProps) {
        result[key] = value;
      }
    }

    return result;
  }

  deserialize(data: Record<string, unknown>): void {
    this.assign(data);
  }

  setDynamic(key: string, value: unknown): void {
    this.dynamicProps.set(key, value);
  }

  getDynamic<T = unknown>(key: string): T | undefined {
    return this.dynamicProps.get(key) as T | undefined;
  }

  async initialize(): Promise<void> {}
  async preProcess(): Promise<void> {}
  async finalize(): Promise<void> {}

  /**
   * Validate the current property values on this instance.
   *
   * Default implementation defers to the class's static validateProperties
   * over the result of `serialize()`. Subclasses can override to add
   * runtime-only rules (for example, mutually-exclusive fields).
   */
  validate(
    options: NodeValidationOptions = {}
  ): NodePropertyValidationIssue[] {
    const ctor = this.constructor as typeof BaseNode;
    return ctor.validateProperties(this.serialize(), {
      connectedHandles: options.connectedHandles,
      nodeId: options.nodeId ?? (this.__node_id || undefined)
    });
  }

  abstract process(
    context?: ProcessingContext
  ): Promise<Record<string, unknown>>;

  async *genProcess(
    context?: ProcessingContext
  ): AsyncGenerator<Record<string, unknown>> {
    yield await this.process(context);
  }

  /**
   * Streaming input+output processing.
   * Override this for nodes with isStreamingInput=true.
   * Drain inputs via `inputs.stream()` / `inputs.any()` and
   * push results via `outputs.emit()`.
   */
  async run?(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void>;

  /**
   * Resolve requiredSettings from the context's secret store and inject
   * them as `inputs._secrets` so node process() can access API keys.
   */
  private async _injectSecrets(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const ctor = this.constructor as typeof BaseNode;
    const required = ctor.requiredSettings;
    if (!required || required.length === 0) {
      return inputs;
    }
    if (!context) {
      console.warn(
        `[_injectSecrets] No context for ${ctor.nodeType}, required: ${required.join(", ")}`
      );
      return inputs;
    }

    const secrets: Record<string, string> = {};
    for (const key of required) {
      const value = await context.getSecret(key);
      if (value) {
        secrets[key] = value;
      } else {
        console.warn(
          `[_injectSecrets] Secret "${key}" not found for ${ctor.nodeType}`
        );
      }
    }
    if (Object.keys(secrets).length === 0) return inputs;
    return {
      ...inputs,
      _secrets: {
        ...((inputs._secrets as Record<string, string>) ?? {}),
        ...secrets
      }
    };
  }

  /** Get resolved secrets (available during process()). */
  get _secrets(): Record<string, string> {
    return this.getDynamic<Record<string, string>>("_secrets") ?? {};
  }

  toExecutor(): NodeExecutor {
    const executor: NodeExecutor = {
      process: async (
        inputs: Record<string, unknown>,
        context?: ProcessingContext
      ) => {
        const merged = await this._injectSecrets(inputs, context);
        const { _secrets, ...props } = merged;
        if (_secrets) this.setDynamic("_secrets", _secrets);
        this.assign(props);
        return this.process(context);
      },
      genProcess: async function* (
        this: BaseNode,
        inputs: Record<string, unknown>,
        context?: ProcessingContext
      ) {
        const merged = await this._injectSecrets(inputs, context);
        const { _secrets, ...props } = merged;
        if (_secrets) this.setDynamic("_secrets", _secrets);
        this.assign(props);
        yield* this.genProcess(context);
      }.bind(this) as NodeExecutor["genProcess"],
      preProcess: () => this.preProcess(),
      finalize: () => this.finalize(),
      initialize: () => this.initialize()
    };
    if (this.run) {
      executor.run = async (
        inputs: StreamingInputs,
        outputs: StreamingOutputs,
        context?: ProcessingContext
      ) => this.run!(inputs, outputs, context);
    }
    return executor;
  }

  static toDescriptor(id?: string): NodeDescriptor {
    const cls = this as unknown as typeof BaseNode;
    const propertyTypes = Object.fromEntries(
      cls
        .getDeclaredProperties()
        .map((entry) => [entry.name, entry.options.type])
    );
    const desc: NodeDescriptor = {
      id: id ?? cls.nodeType,
      type: cls.nodeType,
      name: cls.title,
      is_streaming_input: cls.isStreamingInput,
      is_streaming_output: cls.isStreamingOutput,
      sync_mode: cls.syncMode,
      is_controlled: cls.isControlled
    };
    if (Object.keys(propertyTypes).length > 0) {
      desc.propertyTypes = propertyTypes;
    }
    const outputs = cls.getDeclaredOutputs();
    if (Object.keys(outputs).length > 0) {
      desc.outputs = outputs;
    }
    return desc;
  }
}
