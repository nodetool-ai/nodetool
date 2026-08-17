/**
 * Headless driver for the shared app runtime core.
 *
 * The fold rules, the state namespaces, the run policy, and the action
 * vocabulary all live in `@nodetool-ai/app-runtime` — the same code the web and
 * mobile runtimes run. This file only supplies what a headless run needs: a
 * workflow executor per operation and the bookkeeping that turns an awaited run
 * into an invocation, plus the in-memory resource collections a run gets in
 * place of the server-backed ones the web runtime reads.
 *
 * The web engine's reactive subgraph runs collapse to full workflow runs here
 * (the headless kernel has no browser worker), which the report notes rather
 * than simulates.
 */
import {
  applyEvent,
  applyEvents,
  createInstanceState,
  decideRun,
  evaluateCondition,
  formatTemplate,
  initialVariableValues,
  isLiveInvocation,
  liveInvocations,
  messagesToEvents,
  operationError,
  outputVariableTargets,
  parseCondition,
  readRef,
  resolveOperationParams,
  stateKey,
  type AppAction,
  type AppInstanceState,
  type AppStateEvent,
  type BindingRef,
  type BindingScope,
  type Condition,
  type ConditionProps,
  type InvocationState,
  type OperationBinding,
  type ResourceBinding,
  type ResourceKind,
  type ResourceOperation,
  type ResourceRef,
  type RunDecision,
  type VariableDeclaration
} from "@nodetool-ai/app-runtime";
import type { ResourceDetail } from "@nodetool-ai/protocol/api-schemas/resources.js";
import { isString } from "../predicates.js";

/** What one run returned: its messages plus where its report landed. */
export interface HeadlessRunResult {
  messages: ReadonlyArray<Record<string, unknown>>;
  /** Index into the harness's `runs` array. */
  runIndex: number;
}

export interface HeadlessOperationInit {
  binding: OperationBinding;
  /** Output node id → the state key its value lands in. */
  outputKeyByNodeId: ReadonlyMap<string, string>;
  /** Input node ids, in graph order. */
  inputNodeIds: ReadonlyArray<string>;
  /** Input node id → the param name the run protocol expects. */
  inputNameByNodeId: ReadonlyMap<string, string>;
  /** Input defaults, keyed by input state key. */
  defaults: Record<string, unknown>;
  /**
   * Execute the operation's workflow. Absent when the workflow could not be
   * loaded — dispatching a run then records why instead of throwing.
   */
  runWorkflow?: (params: Record<string, unknown>) => Promise<HeadlessRunResult>;
}

/** A widget's declarative logic props, as the document stores them. */
interface HeadlessWidgetInit {
  id: string;
  visibleWhen?: ConditionProps;
  disabledWhen?: ConditionProps;
  /** `{binding|filter}` template rendered in place of the raw value. */
  format?: string;
}

/** Whether a widget is on screen and usable, as of the last fold. */
interface HeadlessWidgetState {
  visible: boolean;
  disabled: boolean;
  /** True once the widget was both visible and enabled at any point. */
  everReachable: boolean;
  /** The `visibleWhen` condition in prose, or null when it has none. */
  visibleWhen: string | null;
  /** The `disabledWhen` condition in prose, or null when it has none. */
  disabledWhen: string | null;
}

interface HeadlessRuntimeInit {
  operations: ReadonlyArray<HeadlessOperationInit>;
  /** The operation a bare `run`/`cancel` targets. */
  defaultOperationId: string;
  /** Declared variables, for `seedVariables`. */
  variables?: ReadonlyArray<VariableDeclaration>;
  /** Declared resource bindings — what `seedResource` can attach a collection to. */
  resources?: ReadonlyArray<ResourceBinding>;
  /** Ceiling on every run, on top of each operation's own `timeoutMs`. */
  timeoutMs?: number;
  /** Placed widgets, for condition and `format` evaluation. */
  widgets?: ReadonlyArray<HeadlessWidgetInit>;
  /** The scope widget conditions and `format` tokens resolve against. */
  scope?: BindingScope;
}

/**
 * A condition as a failure message names it: `draft notEmpty`, `count gt 3`.
 * The stored props are what an author sees in the builder, so the message
 * points at something they can find.
 */
export const describeCondition = (
  props: ConditionProps | null | undefined
): string | null => {
  if (!props?.binding) return null;
  const op = props.op ?? "notEmpty";
  const value =
    props.value === undefined || props.value === "" ? "" : ` ${props.value}`;
  return `${props.binding} ${op}${value}`;
};

/**
 * Why a ref cannot be written, or null when it can.
 *
 * Only a run fills an output slot or an operation's execution state, so a
 * script that writes one has named the wrong thing — the value would land in
 * the inputs namespace, where nothing reads it.
 */
export const writeRefusal = (ref: BindingRef): string | null => {
  switch (ref.kind) {
    case "output":
      return "resolves to an output, which only a run can fill, and cannot be set";
    case "execution":
      return "resolves to execution state, which only a run can fill, and cannot be set";
    default:
      return null;
  }
};

/**
 * One member of a collection, in the envelope the resources router speaks
 * (`ResourceDetail`): a `ResourceRef`, the fields a picker lists, and the
 * provider's payload.
 */
export type ResourceItem = ResourceDetail;

/** A collection member as a seed step or a `resource:` param writes it. */
export interface SeedResourceItem {
  id: string;
  name?: string;
  /** The provider's payload: a document body, or an asset's metadata. */
  document?: unknown;
  contentType?: string | null;
  projectId?: string | null;
  revision?: number;
  updatedAt?: string;
}

/** What a `resourceCommand` asks a provider to do. */
export interface HeadlessResourceCommand {
  command: ResourceOperation | "upload";
  /** The item the widget points at. Ignored by `create` and `upload`. */
  ref?: ResourceRef | null;
  args?: Record<string, unknown>;
}

/**
 * The collection behind one resource binding, headless.
 *
 * The web runtime reads collections over tRPC and hands widgets a `ResourceRef`
 * to act on; a headless run has no server and no user, so it gets the same
 * envelope from a seeded provider instead. Nothing here touches the database —
 * a run only ever sees what the interaction script or `--params` put in.
 */
export interface HeadlessResourceProvider {
  readonly kind: ResourceKind;
  list(): ResourceItem[];
  get(id: string): ResourceItem | null;
  /** The item a `from: "resource"` param sends and a command acts on. */
  selected(): ResourceRef | null;
  select(ref: ResourceRef | null): void;
  apply(op: HeadlessResourceCommand): ResourceItem | null;
}

/** How to seed a collection, named in every message about an unseeded one. */
export const seedResourceHint = (resourceBindingId: string): string =>
  `seed it with an interaction step {"seedResource":{"id":"${resourceBindingId}","items":[{"id":"item-1"}]}} or a "resource:${resourceBindingId}" param`;

/**
 * A collection held in memory for the length of one debug run.
 *
 * Selection follows `useBoundResource`: a pinned `fixedId` wins, else the item
 * the last command or `select` chose, else the first member — so a picker that
 * nobody touched still has something to send.
 */
export class InMemoryResourceProvider implements HeadlessResourceProvider {
  readonly kind: ResourceKind;
  private readonly items: ResourceItem[] = [];
  private readonly pinnedId: string | null;
  private chosenId: string | null = null;
  private seq = 0;

  constructor(init: {
    kind: ResourceKind;
    items?: ReadonlyArray<SeedResourceItem>;
    /** A binding scoped to one document pins its id. */
    pinnedId?: string;
  }) {
    this.kind = init.kind;
    this.pinnedId = init.pinnedId ?? null;
    for (const seed of init.items ?? []) this.items.push(this.toItem(seed));
  }

  /**
   * Timestamps come from a counter, not the clock, so two runs of the same
   * script produce identical reports.
   */
  private toItem(seed: SeedResourceItem): ResourceItem {
    this.seq += 1;
    return {
      ref: { kind: this.kind, id: seed.id, revision: seed.revision ?? 1 },
      name: seed.name ?? seed.id,
      projectId: seed.projectId ?? null,
      contentType: seed.contentType ?? null,
      updatedAt: seed.updatedAt ?? new Date(this.seq * 1000).toISOString(),
      document: seed.document
    };
  }

  list(): ResourceItem[] {
    return [...this.items];
  }

  get(id: string): ResourceItem | null {
    return this.items.find((item) => item.ref.id === id) ?? null;
  }

  selected(): ResourceRef | null {
    const targetId =
      this.pinnedId ?? this.chosenId ?? this.items[0]?.ref.id ?? null;
    if (!targetId) return null;
    // A pinned id can sit outside the collection; point at it anyway, the way
    // the web runtime does.
    return this.get(targetId)?.ref ?? { kind: this.kind, id: targetId };
  }

  select(ref: ResourceRef | null): void {
    this.chosenId = ref?.id ?? null;
  }

  apply(op: HeadlessResourceCommand): ResourceItem | null {
    const args = op.args ?? {};
    const name = isString(args.name) ? args.name : undefined;
    switch (op.command) {
      case "read": {
        const ref = op.ref ?? this.selected();
        return ref ? this.get(ref.id) : null;
      }
      case "create":
      case "upload": {
        const seed: SeedResourceItem = {
          id: isString(args.id) ? args.id : this.nextId(),
          document: args.document
        };
        if (name !== undefined) {
          seed.name = name;
        }
        if (isString(args.contentType)) {
          seed.contentType = args.contentType;
        }
        const item = this.toItem(seed);
        this.items.push(item);
        this.chosenId = item.ref.id;
        return item;
      }
      case "update": {
        const ref = op.ref ?? this.selected();
        const index = ref
          ? this.items.findIndex((i) => i.ref.id === ref.id)
          : -1;
        if (!ref || index < 0) {
          throw new Error(
            `Resource command "update" has nothing to write: the collection holds no resource "${ref?.id ?? ""}".`
          );
        }
        const current = this.items[index];
        // The web providers reject a write whose revision is behind the row;
        // headless keeps the rule so a script cannot pretend a stale write works.
        if (
          ref.revision !== undefined &&
          current.ref.revision !== undefined &&
          ref.revision < current.ref.revision
        ) {
          throw new Error(
            `Resource command "update" carries revision ${ref.revision} but resource "${ref.id}" is at ${current.ref.revision}.`
          );
        }
        this.seq += 1;
        const next: ResourceItem = {
          ...current,
          ref: { ...current.ref, revision: (current.ref.revision ?? 0) + 1 },
          name: name ?? current.name,
          document: "document" in args ? args.document : current.document,
          updatedAt: new Date(this.seq * 1000).toISOString()
        };
        this.items[index] = next;
        return next;
      }
      case "delete": {
        const ref = op.ref ?? this.selected();
        const index = ref
          ? this.items.findIndex((i) => i.ref.id === ref.id)
          : -1;
        if (!ref || index < 0) {
          throw new Error(
            `Resource command "delete" has nothing to remove: the collection holds no resource "${ref?.id ?? ""}".`
          );
        }
        const [removed] = this.items.splice(index, 1);
        if (this.chosenId === removed.ref.id) this.chosenId = null;
        return removed;
      }
    }
  }

  /** An id no member holds, so `create` twice makes two resources. */
  private nextId(): string {
    let n = this.items.length + 1;
    while (this.get(`${this.kind}-${n}`)) n += 1;
    return `${this.kind}-${n}`;
  }
}

/** One simulated invocation, as the report shows it. */
interface HeadlessInvocationRecord {
  id: string;
  operationId: string;
  decision: RunDecision["kind"];
  decisionTargets: string[];
  runIndex: number | null;
  timedOutMs: number | null;
  activity: string[];
}

/**
 * The timeout a run actually gets: the operation's own `timeoutMs` capped by
 * the harness-wide ceiling, so `--timeout` always shortens and never extends.
 */
export const effectiveTimeoutMs = (
  operationTimeoutMs: number | null | undefined,
  ceilingMs: number | null | undefined
): number | null => {
  const candidates = [operationTimeoutMs, ceilingMs].filter(
    (value): value is number => value != null && value > 0
  );
  return candidates.length > 0 ? Math.min(...candidates) : null;
};

const TIMED_OUT = Symbol("timed-out");

/** Resolve, or hand back {@link TIMED_OUT} once `ms` elapses. */
const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number | null
): Promise<T | typeof TIMED_OUT> => {
  if (ms == null) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  try {
    return await Promise.race([promise, expiry]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export class HeadlessAppRuntime {
  private _state: AppInstanceState = createInstanceState();
  runCount = 0;

  /**
   * Every state write goes through here, so a widget's conditions are re-read
   * after each fold — exactly where the web runtime re-renders.
   */
  get state(): AppInstanceState {
    return this._state;
  }

  set state(next: AppInstanceState) {
    this._state = next;
    this.refreshWidgets();
  }

  /** Every invocation started, in order. */
  readonly invocations: HeadlessInvocationRecord[] = [];
  /** Every activity label reported, in order. */
  readonly activity: Array<{
    invocationId: string;
    operationId: string;
    label: string;
  }> = [];

  private readonly init: HeadlessRuntimeInit;
  private readonly byId = new Map<string, HeadlessOperationInit>();
  /** Runs the harness stopped waiting for, still settling in the background. */
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private invocationSeq = 0;
  /** Widget conditions, parsed once, plus the state each evaluation writes. */
  private readonly compiled: Array<{
    init: HeadlessWidgetInit;
    visible: Condition | null;
    disabled: Condition | null;
    state: HeadlessWidgetState;
  }> = [];
  private readonly widgetStates = new Map<string, HeadlessWidgetState>();
  /** Declared resource bindings, keyed by id. */
  private readonly resourceBindings = new Map<string, ResourceBinding>();
  /** Seeded collections, keyed by resource binding id. */
  private readonly providers = new Map<string, HeadlessResourceProvider>();
  /** Every resource command dispatched, in order. */
  readonly resourceCommands: Array<{
    resourceBindingId: string;
    command: string;
  }> = [];

  constructor(init: HeadlessRuntimeInit) {
    this.init = init;
    const scope = init.scope;
    for (const binding of init.resources ?? []) {
      this.resourceBindings.set(binding.id, binding);
    }
    for (const widget of init.widgets ?? []) {
      const state: HeadlessWidgetState = {
        visible: true,
        disabled: false,
        everReachable: false,
        visibleWhen: describeCondition(widget.visibleWhen),
        disabledWhen: describeCondition(widget.disabledWhen)
      };
      this.compiled.push({
        init: widget,
        visible: scope ? parseCondition(widget.visibleWhen, scope) : null,
        disabled: scope ? parseCondition(widget.disabledWhen, scope) : null,
        state
      });
      this.widgetStates.set(widget.id, state);
    }
    for (const operation of init.operations) {
      this.byId.set(operation.binding.id, operation);
      this.state = applyEvent(this.state, {
        type: "seedInputs",
        values: operation.defaults
      });
    }
    this.state = applyEvent(this.state, {
      type: "seedVariables",
      values: initialVariableValues(init.variables ?? [])
    });
  }

  /**
   * Re-evaluate every widget's `visibleWhen`/`disabledWhen` against the current
   * state. An unset or unresolvable condition leaves the widget visible and
   * enabled, the same fallback the web runtime uses.
   */
  private refreshWidgets(): void {
    for (const widget of this.compiled) {
      const visible = widget.visible
        ? evaluateCondition(this._state, widget.visible)
        : true;
      const disabled = widget.disabled
        ? evaluateCondition(this._state, widget.disabled)
        : false;
      widget.state.visible = visible;
      widget.state.disabled = disabled;
      widget.state.everReachable ||= visible && !disabled;
    }
  }

  /** A widget's current visibility, or null when the runtime has no such widget. */
  widgetState(widgetId: string): HeadlessWidgetState | null {
    return this.widgetStates.get(widgetId) ?? null;
  }

  /**
   * What a widget displays: its `format` template rendered against the current
   * state, or null when it has none and shows its bound value raw.
   */
  display(widgetId: string): string | null {
    const widget = this.compiled.find((w) => w.init.id === widgetId);
    if (!widget?.init.format || !this.init.scope) return null;
    return formatTemplate(widget.init.format, this._state, this.init.scope);
  }

  /**
   * Attach a collection to a declared resource binding, replacing whatever was
   * seeded before. Seeding is the only way a headless run gets resources.
   */
  seedResource(
    resourceBindingId: string,
    items: ReadonlyArray<SeedResourceItem>
  ): HeadlessResourceProvider {
    const binding = this.resourceBindings.get(resourceBindingId);
    if (!binding) {
      const declared = [...this.resourceBindings.keys()];
      throw new Error(
        `No resource binding "${resourceBindingId}" is declared by this app` +
          (declared.length > 0 ? ` (declared: ${declared.join(", ")}).` : ".")
      );
    }
    const providerOptions: ConstructorParameters<
      typeof InMemoryResourceProvider
    >[0] = { kind: binding.kind, items };
    if (binding.scope.fixedId) {
      providerOptions.pinnedId = binding.scope.fixedId;
    }
    const provider = new InMemoryResourceProvider(providerOptions);
    this.providers.set(resourceBindingId, provider);
    return provider;
  }

  /** The collection behind a resource binding, or null when nothing seeded it. */
  resourceProvider(resourceBindingId: string): HeadlessResourceProvider | null {
    return this.providers.get(resourceBindingId) ?? null;
  }

  /** Resource bindings the document declares, in document order. */
  get resourceBindingList(): ResourceBinding[] {
    return [...this.resourceBindings.values()];
  }

  /** Last error reported against an operation's active invocation. */
  errorFor(operationId: string): string | null {
    return operationError(this.state, operationId) ?? null;
  }

  get error(): string | null {
    return this.errorFor(this.init.defaultOperationId);
  }

  /**
   * Write a value through its resolved binding.
   *
   * A ref {@link writeRefusal} rejects throws instead of landing in the inputs
   * namespace: an output slot only a run fills, written as an input, is a value
   * no reader ever sees, and the step that wrote it must not report success.
   */
  write(ref: BindingRef, value: unknown): void {
    const refusal = writeRefusal(ref);
    if (refusal) throw new Error(refusal);
    const key = stateKey(ref);
    switch (ref.kind) {
      case "variable":
        this.state = applyEvent(this.state, {
          type: "setVariable",
          variableId: ref.variableId,
          value
        });
        break;
      case "view":
        this.state = applyEvent(this.state, { type: "setView", key, value });
        break;
      default:
        this.state = applyEvent(this.state, { type: "setInput", key, value });
    }
  }

  /**
   * HOLDOUT (anti-slop/no-unknown-returns): a slot holds a workflow value —
   * the open domain `AppInstanceState` stores as `unknown`.
   */
  read(ref: BindingRef | null): unknown {
    if (!ref) return undefined;
    const key = stateKey(ref);
    switch (ref.kind) {
      case "output":
        return this.state.outputs[key]?.value;
      case "variable":
        return this.state.variables[key];
      case "view":
        return this.state.view[key];
      case "execution":
        return readRef(this.state, {
          source: "execution",
          operationId: ref.operationId,
          field: ref.field
        });
      default:
        return this.state.inputs[key]?.value;
    }
  }

  /**
   * Params for one operation's run: every input resolved through its mapping
   * (widget value, variable, constant, or resource), keyed by node name.
   */
  collectParams(operationId: string): Record<string, unknown> {
    const operation = this.byId.get(operationId);
    if (!operation) return {};
    return resolveOperationParams({
      operation: operation.binding,
      state: this.state,
      inputName: (nodeId) => operation.inputNameByNodeId.get(nodeId),
      inputNodeIds: operation.inputNodeIds,
      resourceRef: (resourceBindingId) =>
        this.providers.get(resourceBindingId)?.selected() ?? undefined
    });
  }

  /**
   * Refuse to run an operation whose inputs read a collection nothing seeded.
   * Sending no param for it would look like a passing run against an app that
   * cannot work, which is the failure this harness exists to catch.
   */
  private assertResourcesSeeded(binding: OperationBinding): void {
    for (const [nodeId, mapping] of Object.entries(binding.inputs)) {
      if (mapping.from !== "resource") continue;
      const id = mapping.resourceBindingId;
      const provider = this.providers.get(id);
      if (!provider) {
        throw new Error(
          `Operation "${binding.id}" input "${nodeId}" comes from resource binding "${id}", which nothing seeded — ${seedResourceHint(id)}.`
        );
      }
      if (!provider.selected()) {
        throw new Error(
          `Operation "${binding.id}" input "${nodeId}" comes from resource binding "${id}", which was seeded empty — the run has no resource to send. Seed at least one item.`
        );
      }
    }
  }

  /** Dispatch one action; a `run` executes the workflow and folds its stream. */
  async dispatch(action: AppAction): Promise<void> {
    switch (action.kind) {
      case "run":
        await this.run(action.operationId);
        break;
      case "cancel":
        this.cancel(
          action.operationId ?? this.init.defaultOperationId,
          action.invocationId
        );
        break;
      case "setVariable":
        this.state = applyEvent(this.state, {
          type: "setVariable",
          variableId: action.variableId,
          value: action.value
        });
        break;
      case "toggleVariable":
        this.state = applyEvent(this.state, {
          type: "toggleVariable",
          variableId: action.variableId
        });
        break;
      case "resourceCommand": {
        const provider = this.providers.get(action.resourceBindingId);
        if (!provider) {
          throw new Error(
            `Resource command "${action.command}" targets resource binding "${action.resourceBindingId}", which nothing seeded — ${seedResourceHint(action.resourceBindingId)}.`
          );
        }
        const command: HeadlessResourceCommand = {
          command: action.command,
          ref: provider.selected()
        };
        if (action.args) {
          command.args = action.args;
        }
        provider.apply(command);
        this.resourceCommands.push({
          resourceBindingId: action.resourceBindingId,
          command: action.command
        });
        break;
      }
      case "openResource":
        // Opening a resource in its own editor is the host app's job, and a
        // headless run has no editor — record the request and move on.
        this.resourceCommands.push({
          resourceBindingId: action.resourceBindingId,
          command: "open"
        });
        break;
    }
  }

  /** Cancel an operation's live invocations (or one named invocation). */
  cancel(operationId: string, invocationId?: string): string[] {
    // A named invocation is filtered on liveness like the bare path: cancelling
    // one that already completed or failed would overwrite what it reported.
    const targets = invocationId
      ? [invocationId].filter((id) => {
          const invocation = this.state.invocations[id];
          return invocation ? isLiveInvocation(invocation) : false;
        })
      : liveInvocations(this.state, operationId).map((i) => i.id);
    for (const id of targets) {
      this.state = applyEvent(this.state, {
        type: "invocationStatus",
        invocationId: id,
        status: "cancelled"
      });
    }
    return targets;
  }

  private timeoutFor(operation: OperationBinding): number | null {
    return effectiveTimeoutMs(operation.timeoutMs, this.init.timeoutMs);
  }

  /**
   * Start one run, after `decideRun` says what the operation's policy makes of
   * whatever is already in flight.
   */
  private async run(operationId: string): Promise<void> {
    const operation = this.byId.get(operationId);
    if (!operation) {
      throw new Error(`No operation "${operationId}" is declared by this app.`);
    }
    if (!operation.runWorkflow) {
      throw new Error(
        `Operation "${operationId}" has no runnable workflow — its binding could not be resolved.`
      );
    }

    this.assertResourcesSeeded(operation.binding);

    const decision = decideRun(this.state, operation.binding);
    const targets =
      decision.kind === "replace"
        ? decision.cancel
        : decision.kind === "queue"
          ? decision.after
          : [];
    const timeoutMs = this.timeoutFor(operation.binding);
    if (decision.kind === "replace") {
      for (const id of targets) this.cancel(operationId, id);
    } else if (decision.kind === "queue") {
      // Wait for what is ahead. A run the harness already gave up on is bounded
      // by the same timeout, so queueing cannot hang the report.
      for (const id of targets) {
        const pending = this.inFlight.get(id);
        if (pending) await withTimeout(pending, timeoutMs);
        this.cancel(operationId, id);
      }
    }

    this.invocationSeq += 1;
    const invocation: InvocationState = {
      id: `headless-${this.invocationSeq}`,
      operationId,
      status: "running",
      // Deterministic, so two harness runs produce identical reports.
      startedAt: this.invocationSeq
    };
    const record: HeadlessInvocationRecord = {
      id: invocation.id,
      operationId,
      decision: decision.kind,
      decisionTargets: targets,
      runIndex: null,
      timedOutMs: null,
      activity: []
    };
    this.invocations.push(record);

    this.state = applyEvent(this.state, {
      type: "runStarted",
      invocation,
      outputKeys: [...operation.outputKeyByNodeId.values()]
    });
    this.runCount += 1;

    const pending = operation.runWorkflow(this.collectParams(operationId));
    // A run the harness never sees the end of must not take the process with
    // it: swallow its eventual settlement and keep it for a queued successor.
    this.inFlight.set(
      invocation.id,
      pending.then(
        () => undefined,
        () => undefined
      )
    );
    const outcome = await withTimeout(pending, timeoutMs);
    if (outcome === TIMED_OUT) {
      // The invocation stays live: the job is still running on the server, the
      // harness simply stopped waiting. A later run of the same operation
      // collides with it, which is exactly what the policy is for.
      record.timedOutMs = timeoutMs;
      this.state = applyEvent(this.state, {
        type: "invocationError",
        invocationId: invocation.id,
        error: `timed out after ${timeoutMs}ms`
      });
      return;
    }
    this.inFlight.delete(invocation.id);
    record.runIndex = outcome.runIndex;

    // The headless runner awaits the whole stream, so every message belongs to
    // the invocation just started — including the `job_update` and `edge_update`
    // the kernel stamps with the *server's* job id, which the fold would
    // otherwise fail to resolve and drop, losing a job-level failure.
    const stamped = outcome.messages.map((message) => ({
      ...message,
      job_id: invocation.id
    }));
    const outputVariables = new Map(
      outputVariableTargets(operation.binding).map((t) => [
        t.nodeId,
        t.variableId
      ])
    );
    const events = messagesToEvents(stamped, {
      resolveInvocation: (jobId: string | null | undefined) =>
        jobId ? (this.state.invocations[jobId] ?? null) : null,
      outputKey: (_operationId: string, nodeId: string) =>
        operation.outputKeyByNodeId.get(nodeId) ?? null,
      outputVariable: (_operationId: string, nodeId: string) =>
        outputVariables.get(nodeId) ?? null
    });
    this.recordActivity(record, events);
    this.state = applyEvents(this.state, events);
    this.state = applyEvent(this.state, {
      type: "invocationStatus",
      invocationId: invocation.id,
      status:
        this.state.invocations[invocation.id]?.status === "failed"
          ? "failed"
          : "completed"
    });
  }

  private recordActivity(
    record: HeadlessInvocationRecord,
    events: ReadonlyArray<AppStateEvent>
  ): void {
    for (const event of events) {
      if (event.type !== "invocationActivity") continue;
      if (record.activity.at(-1) === event.label) continue;
      record.activity.push(event.label);
      this.activity.push({
        invocationId: record.id,
        operationId: record.operationId,
        label: event.label
      });
    }
  }
}
