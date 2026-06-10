import type {
  InputMode,
  NodeDescriptor,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
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
  body?: string;

  recommendedModels?: unknown[];
  inlineFields?: string[];
  inputFields?: string[];
  requiredSettings?: string[];
  requiredRuntimes?: string[];
  isStreamingInput: boolean;
  isStreamingOutput: boolean;
  inputMode?: InputMode;
  outputCorrelation?: Record<string, OutputCorrelation>;
  supportsDynamicInputs: boolean;
  isControlled: boolean;
  isJoinNode: boolean;
  supportsDynamicOutputs?: boolean;
  autoSaveAsset: boolean;
  modelPacks?: unknown[];
  /**
   * Deployment platforms this node supports. See `@nodetool-ai/protocol`'s
   * Platform type. Unset is treated as ["node"].
   */
  platforms?: readonly Platform[];
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

/**
 * Find an `isStreamingOutput` declared explicitly on `cls` or one of its
 * ancestors below BaseNode. BaseNode's own `false` default is "unset" —
 * only a subclass's own declaration counts, so `static isStreamingOutput =
 * false` is a real opt-out rather than indistinguishable from the default.
 */
const explicitStreamingOutputFlag = (cls: NodeClass): boolean | undefined => {
  let current: unknown = cls;
  while (typeof current === "function" && current !== BaseNode) {
    if (Object.prototype.hasOwnProperty.call(current, "isStreamingOutput")) {
      return (current as NodeClass).isStreamingOutput;
    }
    current = Object.getPrototypeOf(current);
  }
  return undefined;
};

/**
 * True if a class is a streaming-output node. Resolution order:
 *
 *   1. Explicit static `isStreamingOutput` flag wins (rare opt-in/out).
 *      Only a flag declared on the class (or an ancestor below BaseNode)
 *      counts — `false` declared explicitly suppresses the inference below.
 *   2. Subclass overrides `genProcess` → it yields multiple values.
 *   3. Any output handle declares `forward`, `iteration`, or `chunk`
 *      correlation → the node emits per-input or per-iteration. `single`
 *      and `aggregate` correlations indicate one value per execution.
 *
 * This lets pure-`process()` filter/reroute/forward nodes (IfNode, Output,
 * FilterNone, etc.) declare streaming via correlation alone — no flag, no
 * generator needed.
 */
export const hasStreamingOutput = (cls: NodeClass): boolean => {
  const explicit = explicitStreamingOutputFlag(cls);
  if (explicit !== undefined) {
    return explicit;
  }
  const proto = (cls as unknown as { prototype?: { genProcess?: unknown } })
    .prototype;
  if (
    // Stryker disable next-line OptionalChaining: a class constructor always has a .prototype, so proto is never nullish here (equivalent).
    !!proto?.genProcess &&
    proto.genProcess !== BaseNode.prototype.genProcess
  ) {
    return true;
  }
  const corr = cls.outputCorrelation;
  if (corr) {
    for (const c of Object.values(corr)) {
      if (c.kind === "forward" || c.kind === "iteration" || c.kind === "chunk") {
        return true;
      }
    }
  }
  return false;
};

export abstract class BaseNode {
  static readonly nodeType: string = "";
  static readonly title: string = "";
  static readonly description: string = "";
  static readonly layout: string | undefined = undefined;
  /**
   * Node body renderer key. Set to "content_card" to render a media/text-forward
   * content card instead of the generic input/output body. Generator packages
   * typically derive this from the primary output type on a shared base class
   * (mirrors the Python `_body`/`body()` convention).
   */
  static readonly body: string | undefined = undefined;

  static readonly recommendedModels: unknown[] | undefined = undefined;
  static readonly inlineFields: string[] | undefined = undefined;
  static readonly inputFields: string[] | undefined = undefined;
  static readonly requiredSettings: string[] | undefined = undefined;
  static readonly requiredRuntimes: string[] | undefined = undefined;
  static readonly isStreamingInput: boolean = false;
  static readonly isStreamingOutput: boolean = false;
  static readonly inputMode: InputMode | undefined = undefined;
  static readonly outputCorrelation:
    | Record<string, OutputCorrelation>
    | undefined = undefined;
  static readonly supportsDynamicInputs: boolean = false;
  static readonly isControlled: boolean = false;
  /**
   * `Zip` and `Cross` set this to true so static correlation analysis allows
   * incomparable input scopes on these nodes only. See
   * docs/correlation-design.md §7.
   */
  static readonly isJoinNode: boolean = false;
  static readonly supportsDynamicOutputs: boolean | undefined = undefined;
  static readonly autoSaveAsset: boolean = false;
  static readonly modelPacks: unknown[] | undefined = undefined;
  /**
   * Deployment platforms this node supports. Defaults to ["node"]; nodes
   * that work in V8 isolates should claim "workers" and/or "edge"
   * explicitly. See `@nodetool-ai/protocol`'s Platform type.
   */
  static readonly platforms: readonly Platform[] | undefined = undefined;
  static readonly metadataOutputTypes: DeclaredOutputTypes | undefined =
    undefined;
  static readonly outputTypes: DeclaredOutputTypes = {};

  __node_id = "";
  __node_name = "";

  protected dynamicProps = new Map<string, unknown>();

  /**
   * Framework-injected internals (resolved `_secrets`, the `_control_context`,
   * …). Kept separate from `dynamicProps` so reserved `_`-prefixed values never
   * leak into user-facing dynamic-input iteration (prompt template vars, API
   * args) or into `serialize()`. Read/written through getDynamic/setDynamic,
   * which route `_`-prefixed keys here.
   */
  private _internalProps = new Map<string, unknown>();

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
      if (
        Object.prototype.hasOwnProperty.call(properties, name) &&
        // An explicit `undefined` means "absent", same as omitting the key —
        // it must not suppress the declared default below.
        properties[name] !== undefined
      ) {
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
          // Stryker disable next-line ConditionalExpression,LogicalOperator: the guard only matters for object defaults (covered by the deep-copy test); for scalars the JSON round-trip is identity, so every variant still deep-copies objects and passes scalars through (equivalent).
          def !== null && typeof def === "object"
            ? JSON.parse(JSON.stringify(def))
            : def;
      }
    }
    // For dynamic nodes, store undeclared properties. Reserved, framework-
    // injected keys (anything `_`-prefixed, e.g. `_secrets`, `_control_context`)
    // are routed to `_internalProps` instead of `dynamicProps` so they never
    // leak into user-facing dynamic-input iteration or `serialize()`.
    if (ctor.supportsDynamicInputs) {
      for (const [key, value] of Object.entries(properties)) {
        if (declaredNames.has(key)) continue;
        // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: __node_id/__node_name are "_"-prefixed, so removing this explicit skip routes them to _internalProps anyway — never into dynamicProps or serialize() (equivalent).
        if (key === "__node_id" || key === "__node_name") continue;
        if (key.startsWith("_")) {
          this._internalProps.set(key, value);
        } else {
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
    if (ctor.supportsDynamicInputs) {
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
    if (key.startsWith("_")) {
      this._internalProps.set(key, value);
    } else {
      this.dynamicProps.set(key, value);
    }
  }

  getDynamic<T = unknown>(key: string): T | undefined {
    const store = key.startsWith("_") ? this._internalProps : this.dynamicProps;
    return store.get(key) as T | undefined;
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
   * Resolve requiredSettings from the context's secret store. Returns an
   * empty record when nothing is required or nothing resolves.
   */
  private async _resolveSecrets(
    context?: ProcessingContext
  ): Promise<Record<string, string>> {
    const ctor = this.constructor as typeof BaseNode;
    const required = ctor.requiredSettings;
    // Stryker disable next-line EqualityOperator,ConditionalExpression: the `required.length === 0` arm is a redundant fast-path — an empty requiredSettings list runs the loop zero times and returns an empty map, so mutating this comparison is equivalent (the `!required` arm is covered by the no-requiredSettings test).
    if (!required || required.length === 0) {
      return {};
    }
    if (!context) {
      console.warn(
        // Stryker disable next-line StringLiteral: operator diagnostic text only.
        `[_resolveSecrets] No context for ${ctor.nodeType}, required: ${required.join(", ")}`
      );
      return {};
    }

    const secrets: Record<string, string> = {};
    for (const key of required) {
      const value = await context.getSecret(key);
      if (value) {
        secrets[key] = value;
      } else {
        console.warn(
          // Stryker disable next-line StringLiteral: operator diagnostic text only.
          `[_injectSecrets] Secret "${key}" not found for ${ctor.nodeType}`
        );
      }
    }
    return secrets;
  }

  /**
   * Resolve requiredSettings from the context's secret store and inject
   * them as `inputs._secrets` so node process() can access API keys.
   */
  private async _injectSecrets(
    inputs: Record<string, unknown>,
    context?: ProcessingContext
  ): Promise<Record<string, unknown>> {
    const secrets = await this._resolveSecrets(context);
    // Stryker disable next-line ConditionalExpression: short-circuits an empty secrets map; emitting `_secrets: {}` instead is indistinguishable through the _secrets getter, which coalesces undefined and {} alike (equivalent).
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
        const { _secrets, _control_context, ...props } = merged;
        // Stryker disable next-line ConditionalExpression: storing an undefined internal is indistinguishable from not storing it — getDynamic returns undefined either way and the getters coalesce to {} (equivalent).
        if (_secrets) this.setDynamic("_secrets", _secrets);
        // Stryker disable next-line ConditionalExpression: storing an undefined internal is indistinguishable from not storing it (equivalent).
        if (_control_context) this.setDynamic("_control_context", _control_context);
        this.assign(props);
        return this.process(context);
      },
      genProcess: async function* (
        this: BaseNode,
        inputs: Record<string, unknown>,
        context?: ProcessingContext
      ) {
        const merged = await this._injectSecrets(inputs, context);
        const { _secrets, _control_context, ...props } = merged;
        // Stryker disable next-line ConditionalExpression: storing an undefined internal is indistinguishable from not storing it — getDynamic returns undefined either way and the getters coalesce to {} (equivalent).
        if (_secrets) this.setDynamic("_secrets", _secrets);
        // Stryker disable next-line ConditionalExpression: storing an undefined internal is indistinguishable from not storing it (equivalent).
        if (_control_context) this.setDynamic("_control_context", _control_context);
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
      ) => {
        // run() receives StreamingInputs rather than a property bag, so
        // secrets can't ride along on the inputs — store them on the
        // instance so this._secrets works inside run() like in process().
        const secrets = await this._resolveSecrets(context);
        if (Object.keys(secrets).length > 0) {
          this.setDynamic("_secrets", { ...this._secrets, ...secrets });
        }
        return this.run!(inputs, outputs, context);
      };
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
      is_streaming_output: hasStreamingOutput(cls as unknown as NodeClass),
      input_mode: cls.inputMode,
      output_correlation: cls.outputCorrelation,
      is_controlled: cls.isControlled,
      is_join_node: cls.isJoinNode || undefined
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
