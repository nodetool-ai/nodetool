import type {
  DynamicSlotMeta,
  InputMode,
  NodeDescriptor,
  NodeEffect,
  OutputCorrelation,
  Platform
} from "@nodetool-ai/protocol";
import type { NodeExecutor } from "@nodetool-ai/kernel";
import type {
  ProcessingContext,
  StreamingInputs,
  StreamingOutputs,
  TriggerEvent
} from "@nodetool-ai/runtime";
import { getDeclaredPropertiesForClass } from "./decorators.js";
import type { TypeMetadata } from "./metadata.js";
import { slotTypeToString } from "./type-compat.js";
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
/** A URI string promoted to the tagged asset reference its slot declares. */
export interface CoercedAssetRef {
  type: string;
  uri: string;
}

export function coerceToDeclaredType<TValue>(
  value: TValue,
  declaredType: string
): TValue | TValue[] | CoercedAssetRef {
  // A URI string standing in for an asset ref. Callers reach for the plain
  // string — `--params '{"clip":"file:///clip.mp4"}'`, a REST body, a webhook
  // payload — and without this the ref stays empty, the node reads no bytes,
  // and the run reports success carrying a zero-valued result. Only strings
  // with a scheme convert, so a prompt or a caption is never mistaken for a
  // location.
  if (
    typeof value === "string" &&
    ASSET_REF_TYPES.has(declaredType) &&
    URI_WITH_SCHEME.test(value)
  ) {
    return { type: declaredType, uri: value };
  }
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

/**
 * Declared types whose runtime value is an asset reference — a tagged object
 * carrying `uri`/`asset_id`/`data` rather than a bare scalar.
 */
const ASSET_REF_TYPES = new Set([
  "image",
  "video",
  "audio",
  "document",
  "folder",
  "model_3d"
]);

/** `file://`, `https://`, `asset://`, `data:` and the like. */
const URI_WITH_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Coerce a value against a typed dynamic slot's declared type. Slots with no
 * resolvable type string pass the value through untouched (legacy `any` slot).
 */
export function coerceToSlotType<TValue>(
  value: TValue,
  slot: DynamicSlotMeta | undefined
): TValue | TValue[] | CoercedAssetRef {
  const declaredType = slotTypeToString(slot);
  return declaredType ? coerceToDeclaredType(value, declaredType) : value;
}

/**
 * Read the `_dynamic_inputs` framework property injected by the registry into
 * a slot-declaration map. Malformed entries are dropped rather than thrown on:
 * the map is user/graph data and a bad slot must never break node construction.
 */
function parseDynamicSlots(
  raw: unknown
): Map<string, DynamicSlotMeta> | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const slots = new Map<string, DynamicSlotMeta>();
  for (const [name, meta] of Object.entries(raw as Record<string, unknown>)) {
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
      continue;
    }
    slots.set(name, meta as DynamicSlotMeta);
  }
  return slots;
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
  /**
   * Typed dynamic input slot declarations for this node instance
   * (`Node.dynamic_inputs`). Slots absent from this map are untyped legacy
   * slots and are never validated.
   */
  dynamicSlots?: Record<string, DynamicSlotMeta>;
  /**
   * Inline values of the dynamic properties (`Node.dynamic_properties`).
   * Defaults to the dynamic entries of `properties` when omitted.
   */
  dynamicValues?: Record<string, unknown>;
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
  /**
   * Per-instance override of {@link isStreamingInput}. See
   * `BaseNode.resolveStreamingInput`.
   */
  resolveStreamingInput?: (node: {
    properties?: Record<string, unknown>;
  }) => boolean;
  isTrigger: boolean;
  alwaysEmitOutputUpdates?: boolean;
  inputMode?: InputMode;
  outputCorrelation?: Record<string, OutputCorrelation>;
  supportsDynamicInputs: boolean;
  /**
   * Types a user may pick for a dynamic input slot on this node. Unset means
   * the full type palette. Surfaced as `allowed_dynamic_slot_types`.
   */
  allowedDynamicSlotTypes?: TypeMetadata[];
  isControlled: boolean;
  isJoinNode: boolean;
  supportsDynamicOutputs?: boolean;
  autoSaveAsset: boolean;
  /** Opt-in: re-running with identical inputs is safe. See `BaseNode.retrySafe`. */
  retrySafe: boolean;
  cacheTtl?: number | "forever";
  effect?: NodeEffect;
  primaryOutput?: string;
  modelPacks?: unknown[];
  /**
   * Deployment platforms this node supports. See `@nodetool-ai/protocol`'s
   * Platform type. Unset is treated as ["node"].
   */
  platforms?: readonly Platform[];
  /**
   * Requires a WebGPU device when run in the browser. The in-browser runner
   * routes graphs containing these nodes to the server (where a GPU is always
   * available via Dawn) when `navigator.gpu` is unavailable, instead of failing
   * the run. Server execution is unaffected. Set via `tagAsBrowserGpu`.
   */
  requiresGpu?: boolean;
  deprecated: boolean;
  /**
   * Hide from node-discovery UIs (palette, search) while keeping the node
   * registered and runnable. Unlike `deprecated` (which down-ranks and badges
   * a still-discoverable node), a hidden node is filtered out of the palette
   * entirely. Used for internal nodes the user never adds by hand. Set via a
   * `static readonly hidden = true` on the node class.
   */
  hidden?: boolean;
  replacedBy?: string;
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
 * True if a class is a streaming-output node. Streaming is purely structural:
 *
 *   1. Subclass overrides `genProcess` → it yields multiple values.
 *   2. Any output handle declares `forward`, `iteration`, or `chunk`
 *      correlation → the node emits per-input or per-iteration. `single`
 *      and `aggregate` correlations indicate one value per execution.
 *
 * This lets pure-`process()` filter/reroute/forward nodes (IfNode, Output,
 * FilterNone, etc.) declare streaming via correlation alone, and generator
 * nodes (ForEach, Collection, GetVariable) via the `genProcess` override —
 * no flag needed. Mirrors the Python side, which derives the same boolean
 * solely from whether `gen_process` is overridden.
 */
/**
 * What {@link hasStreamingOutput} reads. Written as the two members it touches
 * so the abstract `typeof BaseNode` — which cannot satisfy `NodeClass`'s
 * concrete constructor — can be passed as well as a registered node class.
 */
type StreamingOutputSource = Pick<NodeClass, "outputCorrelation"> & {
  prototype: BaseNode;
};

export const hasStreamingOutput = (cls: StreamingOutputSource): boolean => {
  const proto = cls.prototype;
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
  /**
   * Decide {@link isStreamingInput} per node instance, from its saved
   * properties. Unset on every node whose mode is a property of the type;
   * declared only where one type covers both modes — the Code node, where the
   * body decides (`usesStreamInputContract(node.properties.code)`).
   *
   * Both hydration paths consult it ahead of the static
   * (`hydrateGraphNodeFlags`, and `Graph.loadFromDict` via the resolver's
   * `resolveInstanceFlags`), and re-read it on every hydration, so editing the
   * body flips the mode with no saved flag involved.
   */
  static readonly resolveStreamingInput:
    | ((node: { properties?: Record<string, unknown> }) => boolean)
    | undefined = undefined;
  /**
   * Marks a trigger node. Triggers compile to `trigger_registrations` on
   * workflow activation, and when a run starts because of a delivered event
   * (`RunJobRequest.trigger_event` targeting this node) the kernel calls
   * {@link emitTriggerEvent} instead of the live-listening `genProcess`
   * loop. Runs without a trigger event keep today's streaming behavior
   * (in-editor live test). See
   * docs/superpowers/specs/2026-07-10-trigger-wakeup-redesign.md.
   */
  static readonly isTrigger: boolean = false;
  /**
   * Emit output_update for this node's handles even when they are connected
   * onward. The runner suppresses output_update for connected handles by
   * default; nodes whose updates feed a UI surface regardless of patching
   * (e.g. the realtime audio monitor) opt in.
   */
  static readonly alwaysEmitOutputUpdates: boolean = false;
  static readonly inputMode: InputMode | undefined = undefined;
  static readonly outputCorrelation:
    | Record<string, OutputCorrelation>
    | undefined = undefined;
  static readonly supportsDynamicInputs: boolean = false;
  /**
   * Restricts the types a user may pick when declaring a dynamic input slot on
   * this node (see `Node.dynamic_inputs`). Unset means the full type palette.
   * Emitted as `allowed_dynamic_slot_types` in node metadata.
   */
  static readonly allowedDynamicSlotTypes: TypeMetadata[] | undefined =
    undefined;
  static readonly isControlled: boolean = false;
  /**
   * `Zip` and `Cross` set this to true so static correlation analysis allows
   * incomparable input scopes on these nodes only. See
   * docs/correlation-design.md §7.
   */
  static readonly isJoinNode: boolean = false;
  static readonly supportsDynamicOutputs: boolean | undefined = undefined;
  static readonly autoSaveAsset: boolean = false;
  /**
   * Whether re-running this node with identical inputs is safe. An opt-in:
   * unknown means unsafe. Cost tracking cannot see external writes — a
   * Publish/Upsert/Notify node can complete its side effect and then throw,
   * recording nothing — so a node nobody classified loses a safe retry rather
   * than gaining an unsafe one. The workflow supervisor offers `retry` only
   * for a node that declares this. See docs/workflow-supervisor-design.md §5.3.
   */
  static readonly retrySafe: boolean = false;
  /**
   * Per-type cache lifetime for partial runs ("Run Node", "Run from here", "Run
   * selected"). Only consulted for Computed nodes (Constants are always live;
   * Generatives reuse generation history). `"forever"` = pure deterministic
   * (reuse while inputs match); a finite number = seconds the cached result
   * stays fresh before re-running (time-sensitive, e.g. a web fetch);
   * unset / `0` = never reuse. `"forever"` is a string sentinel — never
   * `Infinity`, which JSON-serializes to `null` and would silently flip a pure
   * node to never-cache. See docs/superpowers/specs/2026-06-27-run-subgraph-caching.md §4.
   */
  static readonly cacheTtl: number | "forever" | undefined = undefined;
  /**
   * What running this node does to the world, which decides whether a reactive
   * run (a slider drag, an input change in a mini app) may execute it without
   * an explicit action:
   *   "pure"     — output depends only on inputs; safe to re-run at any rate
   *   "read"     — reads external state but changes nothing
   *   "write"    — mutates state the user can observe (a file, a document)
   *   "external" — leaves the system (sends mail, calls a paid API)
   * Reactive runs traverse "pure" and "read" only. The default is the
   * conservative "external", so a node nobody has classified never fires off a
   * slider drag. `cacheTtl: "forever"` implies "pure".
   */
  static readonly effect: NodeEffect = "external";
  /**
   * Names the output slot that carries this node's "primary" generation — the
   * value persisted as its saved generation and previewed by the content card.
   * Unset falls back to the first declared output. See `auto_save_asset` and the
   * autosave path in the websocket runner.
   */
  static readonly primaryOutput: string | undefined = undefined;
  static readonly modelPacks: unknown[] | undefined = undefined;
  /**
   * Deployment platforms this node supports. Defaults to ["node"]; nodes
   * that work in V8 isolates should claim "workers" and/or "edge"
   * explicitly. See `@nodetool-ai/protocol`'s Platform type.
   */
  static readonly platforms: readonly Platform[] | undefined = undefined;
  /**
   * Requires a WebGPU device in the browser (set via `tagAsBrowserGpu`). The
   * in-browser runner routes graphs with these nodes to the server when
   * `navigator.gpu` is unavailable. Unset/undefined means no GPU requirement.
   */
  static readonly requiresGpu: boolean | undefined = undefined;
  static readonly deprecated: boolean = false;
  /**
   * Hidden from node-discovery UIs but still registered/runnable (see the
   * `hidden` field on NodeClass). Unset/false means normally discoverable.
   */
  static readonly hidden: boolean | undefined = undefined;
  static readonly replacedBy: string | undefined = undefined;
  static readonly metadataOutputTypes: DeclaredOutputTypes | undefined =
    undefined;
  static readonly outputTypes: DeclaredOutputTypes = {};

  __node_id = "";
  __node_name = "";

  protected dynamicProps = new Map<string, unknown>();

  /**
   * Typed declarations for the dynamic slots of this node instance, injected by
   * the registry as the `_dynamic_inputs` framework property. `dynamicProps`
   * holds the values; this holds the types. A slot missing here is an untyped
   * legacy slot and behaves exactly as before typed slots existed.
   */
  protected dynamicSlotMeta = new Map<string, DynamicSlotMeta>();

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

  static getDeclaredOutputs() {
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
    const declared = this.getDeclaredProperties();
    const dynamicSlots = options.dynamicSlots;
    let dynamicValues = options.dynamicValues;
    if (dynamicSlots && !dynamicValues) {
      // No explicit value bag — dynamic values ride along in `properties`.
      const declaredNames = new Set(declared.map((p) => p.name));
      const collected: Record<string, unknown> = {};
      for (const key of Object.keys(dynamicSlots)) {
        if (declaredNames.has(key)) continue;
        collected[key] = properties[key];
      }
      dynamicValues = collected;
    }
    return validateNodeProperties(declared, properties, {
      connectedHandles: options.connectedHandles,
      nodeId: options.nodeId,
      nodeType: this.nodeType,
      dynamicSlots,
      dynamicValues
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
        (this as Record<string, unknown>)[name] = coerceToDeclaredType(
          properties[name],
          options.type
        );
      } else if (
        (this as Record<string, unknown>)[name] === undefined &&
        Object.prototype.hasOwnProperty.call(options, "default")
      ) {
        // No value on instance yet and a default exists — apply it.
        // Deep-copy mutable defaults so instances don't share references.
        const def = options.default;
        (this as Record<string, unknown>)[name] =
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
      // Slot declarations arrive before the values are stored so the values can
      // be coerced against their declared type in the same pass.
      const slots = parseDynamicSlots(properties._dynamic_inputs);
      if (slots) {
        this.dynamicSlotMeta = slots;
      }
      for (const [key, value] of Object.entries(properties)) {
        if (declaredNames.has(key)) continue;
        // Stryker disable next-line ConditionalExpression,LogicalOperator,StringLiteral: __node_id/__node_name are "_"-prefixed, so removing this explicit skip routes them to _internalProps anyway — never into dynamicProps or serialize() (equivalent).
        if (key === "__node_id" || key === "__node_name") continue;
        if (key.startsWith("_")) {
          this._internalProps.set(key, value);
        } else {
          this.dynamicProps.set(
            key,
            coerceToSlotType(value, this.dynamicSlotMeta.get(key))
          );
        }
      }
    }
  }

  serialize() {
    const ctor = this.constructor as typeof BaseNode;
    const result: Record<string, unknown> = {};

    for (const { name } of ctor.getDeclaredProperties()) {
      result[name] = (this as Record<string, unknown>)[name];
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
      this.dynamicProps.set(
        key,
        coerceToSlotType(value, this.dynamicSlotMeta.get(key))
      );
    }
  }

  getDynamic<T = unknown>(key: string): T | undefined {
    const store = key.startsWith("_") ? this._internalProps : this.dynamicProps;
    return store.get(key) as T | undefined;
  }

  /** Declared types of this instance's dynamic slots, keyed by slot name. */
  getDynamicSlots(): ReadonlyMap<string, DynamicSlotMeta> {
    return this.dynamicSlotMeta;
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
      nodeId: options.nodeId ?? (this.__node_id || undefined),
      dynamicSlots:
        options.dynamicSlots ??
        (this.dynamicSlotMeta.size > 0
          ? Object.fromEntries(this.dynamicSlotMeta)
          : undefined),
      dynamicValues:
        options.dynamicValues ?? Object.fromEntries(this.dynamicProps)
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
   * Trigger entry point — called instead of `genProcess()` when the run
   * carries a `trigger_event` for this node (see the `isTrigger` static).
   * The default maps the keys of an object payload onto this node's
   * declared output slots and drops everything else. Trigger subclasses
   * override this to shape their adapter payloads (webhook envelope,
   * synthesized tick, file-watch event) onto their specific slots.
   */
  async emitTriggerEvent(
    event: TriggerEvent,
    outputs: StreamingOutputs
  ): Promise<void> {
    const ctor = this.constructor as typeof BaseNode;
    const declared = ctor.metadataOutputTypes ?? ctor.getDeclaredOutputs();
    const payload = event.payload;
    if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
      return;
    }
    for (const [key, value] of Object.entries(
      payload as Record<string, unknown>
    )) {
      if (key in declared) {
        await outputs.emit(key, value);
      }
    }
  }

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
          `[_resolveSecrets] Secret "${key}" not found for ${ctor.nodeType}`
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
      // Live parameter path: assign() only touches the supplied declared
      // properties, so a running run() loop that reads `this.<prop>` per
      // chunk sees the new value on its next chunk.
      applyProperties: (properties: Record<string, unknown>) =>
        this.assign(properties),
      preProcess: () => this.preProcess(),
      finalize: () => this.finalize(),
      initialize: () => this.initialize(),
      emitTriggerEvent: (event: TriggerEvent, outputs: StreamingOutputs) =>
        this.emitTriggerEvent(event, outputs)
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
        // Always overwrite so secrets from a previous execution can't leak into
        // a later run() call on the same instance.
        this.setDynamic("_secrets", await this._resolveSecrets(context));
        return this.run!(inputs, outputs, context);
      };
    }
    return executor;
  }

  static toDescriptor(id?: string): NodeDescriptor {
    const propertyTypes = Object.fromEntries(
      this.getDeclaredProperties()
        .map((entry) => [entry.name, entry.options.type])
    );
    const desc: NodeDescriptor = {
      id: id ?? this.nodeType,
      type: this.nodeType,
      name: this.title,
      is_streaming_input: this.isStreamingInput,
      is_streaming_output: hasStreamingOutput(this),
      input_mode: this.inputMode,
      output_correlation: this.outputCorrelation,
      is_controlled: this.isControlled,
      is_join_node: this.isJoinNode || undefined,
      is_trigger: this.isTrigger || undefined,
      retry_safe: this.retrySafe || undefined
    };
    if (Object.keys(propertyTypes).length > 0) {
      desc.propertyTypes = propertyTypes;
    }
    const outputs = this.getDeclaredOutputs();
    if (Object.keys(outputs).length > 0) {
      desc.outputs = outputs;
    }
    return desc;
  }
}
