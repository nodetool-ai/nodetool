/**
 * CodeActExecutor — executes a single step with JavaScript code as the action
 * space instead of JSON tool calls (Wang et al., ICML 2024, arXiv:2402.01030).
 *
 * The provider sees exactly one tool, `execute_code`. Each call runs the
 * model's program in the QuickJS sandbox where the step's toolbelt is exposed
 * as imported capability modules, and `finish(result)` completes the step
 * (host-validated against the step's output schema). The program's outcome —
 * return value, logs, error — is the observation for the next turn. Results a
 * later action or turn needs go through memory (`nodetool.memory.*`).
 *
 * The message contract (`task_update`, `step_result`, `tool_call_update`,
 * `chunk`), memory writes, and failure semantics are byte-compatible with
 * {@link StepExecutor}, so every consumer works unchanged.
 */

import type {
  BaseProvider,
  ProcessingContext,
  Message,
  MessageContent,
  ProviderStop,
  ProviderStreamItem,
  RunBudget,
  ToolCall,
  TurnBudget
} from "@nodetool-ai/runtime";
import {
  ACTIVE_MODEL_CONTEXT_KEY,
  isProviderStop,
  isRunBudget,
  memoryKeys,
  withAgentSpanGen,
  type ActiveModelSelection
} from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import {
  TaskUpdateEvent,
  type Chunk,
  type ProcessingMessage,
  type StepResult,
  type TaskUpdate,
  type ToolCallUpdate
} from "@nodetool-ai/protocol";
import type { Step, Task } from "../types.js";
import { Tool } from "../tools/base-tool.js";
import { getSharedTools } from "../tools/shared-tools.js";
import { runInSandbox, type SandboxClock } from "../js-sandbox.js";
import type { CapabilityRun } from "../capabilities/types.js";
import { sandboxCapabilitySpecifier } from "@nodetool-ai/protocol";

import { capabilityModuleOf } from "../capabilities/registry.js";
import {
  mountCapabilityModules,
  SESSION_CAPABILITY_MODULE,
  type MountCapabilityModulesOptions
} from "./capability-modules.js";
import { truncateToolResult } from "../constants.js";
import {
  formatViolations,
  validateAgainstSchema
} from "../utils/json-schema-validate.js";
import { linkAbort } from "../utils/link-abort.js";
import { lastProseHint } from "../utils/step-failure.js";
import { removeThinkTags } from "../utils/think-tags.js";
import {
  buildToolBridge,
  buildCoreProviderTools,
  splitCoreTools,
  toolSearchHit,
  CODEACT_PRELUDE,
  type ToolCallRecord,
  type ToolSearchHit
} from "./tool-api.js";
import {
  admitCodeAction,
  EXECUTE_CODE_INPUT_SCHEMA,
  EXECUTE_CODE_TOOL_NAME,
  executeCodeMessage
} from "./execute-code-contract.js";
import { searchTools } from "../tools/tool-search.js";
import { buildCodeActSystemPrompt } from "./prompt.js";
import { annotateFailure } from "./action-diagnostics.js";
import {
  mountActionModules,
  packagePromptLines,
  sessionAllowedPackages
} from "./sandbox-packages.js";
import {
  SANDBOX_PACKAGE_DOCS_TOOL_NAME,
  SANDBOX_PACKAGE_LIST_TOOL_NAME,
  sandboxPackageDocsTool,
  sandboxPackageListTool
} from "../capabilities/packs.js";
import { GRAPH_DSL_PACKAGE, withGraphDslPackage } from "./graph-dsl-package.js";
import { FLOW_PACKAGE, withFlowPackage } from "./flow-package.js";
import {
  FABRIC_PACKAGE,
  FABRIC_PROMPT_SECTION,
  withFabricPackage
} from "./fabric-package.js";
import {
  GRAPH_MODEL_PRELUDE,
  GRAPH_MODEL_PROMPT_SECTION,
  GRAPH_MODEL_TOOL_NAMES,
  hasGraphModelTools
} from "./graph-model.js";
import {
  NODETOOL_API_PRELUDE_FULL,
  buildNodetoolApiPromptSection,
  hasNodetoolApiTools,
  nodetoolApiCoveredToolNames
} from "./nodetool-api.js";
import {
  isFiniteNumber,
  isNonEmptyString,
  isObjectLike,
  isRecord,
  isString
} from "../utils/type-guards.js";

const log = createLogger("nodetool.agents.codeact");

/**
 * Code actions batch several tool calls per turn, so the turn budget is
 * deliberately lower than tool mode's 30.
 */
export const DEFAULT_CODEACT_MAX_ITERATIONS = 20;

/**
 * Wall-clock limit per code action. Codeact actions await real tools —
 * sub-agents, media generation, background-job waits — so the sandbox's 30 s
 * default kills legitimate work mid-flight (`run_subtask` alone routinely
 * takes a minute). The same value feeds QuickJS's interrupt deadline, so a
 * pure CPU spin can now also run this long — acceptable here because every
 * action is abortable via the run's signal, and tool-awaiting actions are the
 * codeact norm.
 */
export const DEFAULT_CODEACT_ACTION_TIMEOUT_MS = 600_000;

// The `execute_code` contract lives beside the auto-mode admission that reads
// it (execute-code-contract.ts); re-exported here so every importer keeps its
// path.
export {
  EXECUTE_CODE_INPUT_SCHEMA,
  EXECUTE_CODE_TOOL_NAME,
  executeCodeMessage,
  declaredActionRisk,
  admitCodeAction,
  ACTION_RISK_VALUES
} from "./execute-code-contract.js";
export type { ActionRisk, ActionAdmission } from "./execute-code-contract.js";

/**
 * A string leaf that is a JSON-serialized tool envelope rather than the value
 * itself: it parses to an object carrying an envelope key (status/outputs/
 * result/error) or a key named like the field it sits in. Deliberately
 * narrow — a legitimate JSON-text output rarely nests its own field name or a
 * run envelope.
 */
function stringifiedEnvelope(value: string, path: string): boolean {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return false;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return false;
  }
  if (!isObjectLike(parsed) || Array.isArray(parsed)) {
    return false;
  }
  const keys = Object.keys(parsed);
  const field =
    path
      .split(".")
      .pop()
      ?.replace(/\[\d+\]$/, "") ?? "";
  return keys.some(
    (key) =>
      key === "status" ||
      key === "outputs" ||
      key === "result" ||
      key === "error" ||
      key === field
  );
}

/**
 * Paths in a finish() payload whose string values carry the tell-tale
 * `[object Object]` of an unread object coerced to a string, or a
 * JSON-serialized envelope standing in for the value it wraps. A schema
 * cannot catch these — the garbage is still a string — so the finish bridge
 * rejects them and the model repairs the extraction inside the same action.
 */
export function coercionArtifactPaths(
  value: unknown,
  path = "result",
  depth = 0
): string[] {
  if (depth > 6) return [];
  if (isString(value)) {
    if (value.includes("[object Object]")) return [path];
    return stringifiedEnvelope(value, path) ? [path] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, i) =>
      coercionArtifactPaths(entry, `${path}[${i}]`, depth + 1)
    );
  }
  if (isObjectLike(value)) {
    return Object.entries(value).flatMap(([key, entry]) =>
      coercionArtifactPaths(entry, `${path}.${key}`, depth + 1)
    );
  }
  return [];
}

/**
 * Tools documented in full in the prompt regardless of toolbelt size — the
 * high-traffic set nearly every step reaches for (mirroring the chat
 * runner's resident-toolbelt idea). Everything else is deferred: still
 * callable, but discovered through `searchTools()` first, so a 70-tool belt
 * does not cost 70 signatures of prompt.
 */
export const CODEACT_RESIDENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  // Search family — every discovery entry point stays top level.
  "web_search",
  "image_search",
  "search_nodes",
  "run_search",
  "asset_search",
  "grep",
  "glob",
  // Web + retrieval.
  "browser",
  "http_request",
  "download_file",
  // Host media binaries.
  "ffmpeg",
  "yt_dlp",
  // Workspace files — the Claude-agent core set (read/write/edit/glob/grep
  // above) stays top level in full.
  "read_file",
  "write_file",
  "edit_file",
  "list_directory",
  // Shared agent memory.
  "list_shared",
  "read_shared",
  "share_result",
  // Delegation.
  "run_subtask"
]);

/**
 * Toolbelts at or below this size skip the split entirely — deferring three
 * tools saves nothing and costs a discovery round.
 */
export const CODEACT_DEFER_THRESHOLD = 16;

export interface CodeActExecutorOptions {
  task: Task;
  step: Step;
  context: ProcessingContext;
  provider: BaseProvider;
  model: string;
  tools?: Tool[];
  /** Preamble layered before the CodeAct contract; cannot override it. */
  systemPrompt?: string;
  maxIterations?: number;
  maxTokens?: number;
  /**
   * Spend admission, consulted before every provider turn. A refusal ends the
   * loop, so a caller's cost cap bounds the step rather than being overrun.
   *
   * A {@link RunBudget} carries the run's other bounds too, and the step then
   * also checks the deadline before every action and every bridged tool call.
   * A bare {@link TurnBudget} keeps its existing meaning — spend only.
   */
  turnBudget?: TurnBudget | RunBudget;
  useFinishTask?: boolean;
  threadId?: string;
  upstreamMemoryKeys?: string[];
  signal?: AbortSignal;
  /** Wall-clock limit per code action. Defaults to {@link DEFAULT_CODEACT_ACTION_TIMEOUT_MS}. */
  actionTimeoutMs?: number;
  /** Tool calls one action may consume. Default 50. */
  maxToolCallsPerAction?: number;
  /**
   * The action's wall clock, which the host stops while a bridged call waits on
   * the user (a permission prompt). Without it, the time a person spends
   * deciding is charged to the action budget and the program is killed
   * mid-wait; the answer then resolves nothing.
   */
  clock?: SandboxClock;
  /**
   * Tools documented in full in the prompt. Defaults to
   * {@link CODEACT_RESIDENT_TOOL_NAMES}; the rest of the toolbelt is
   * deferred behind `searchTools()` once the belt exceeds
   * {@link CODEACT_DEFER_THRESHOLD}.
   */
  residentToolNames?: Iterable<string>;
  /**
   * Sandbox package specifiers this session consents to. An action may import
   * these and nothing else, and the prompt advertises exactly these.
   *
   * Defaults to none. Which packs are trusted is not knowable in here — the
   * caller resolves that from agent/session configuration, user approval, or
   * the task's own declarations — so the safe reading of "trusted packs only"
   * is an empty list until a caller says otherwise.
   */
  sandboxPackages?: readonly string[];
  /**
   * The run whose capability modules this step's actions may import
   * (`@nodetool-ai/sandbox-nodetool/<namespace>`). Optional because a step loop
   * is constructed from a toolbelt, not from a run: the hosts that have one
   * today are the chat surfaces. Without it nothing is mounted and such an
   * import is refused by name — the belt is unaffected either way.
   */
  capabilityRun?: CapabilityRun;
}

/** Observation envelope returned to the model after each code action. */
interface ActionObservation {
  ok: boolean;
  result?: unknown;
  error?: string;
  stack?: string;
  logs?: string[];
  finished?: boolean;
  /** Why `finished` is false, when the action looked like it finished. */
  note?: string;
  toolCalls: number;
}

/**
 * Told to the model when a schema'd action returned a value instead of
 * finishing. `finished` was previously absent rather than false, so an
 * observation for the losing move (`return graph`) was byte-identical to one
 * for a step still in progress — nothing in it said the step had not ended.
 */
const RETURN_IS_NOT_FINISH_NOTE =
  "This step is NOT finished: a returned value is an observation only. " +
  "Call `await finish(<value>)` inside the action to complete the step.";

const RETURN_MATCHES_SCHEMA_NOTE =
  "This step is NOT finished: the value you returned matches the required " +
  "output schema — call finish() on it (`await finish(<that value>)`) inside " +
  "an execute_code action. Nothing else completes the step.";

/**
 * Sent as a user message when a schema'd step's turn ended in prose. The model
 * that built the right value and then described it is one sentence away from a
 * passing step, and the prose message itself proves it never saw the contract.
 */
export const FINISH_CONTRACT_NUDGE =
  "You answered with prose. This step completes only when you call " +
  "`await finish(result)` inside an `execute_code` action. If you already " +
  "built the value, call finish() on it now.";

/**
 * Re-prompts allowed per step. Bounded because a model that ignores the
 * contract twice is not going to honor it on the third ask, and each nudge is
 * a paid provider round.
 */
export const MAX_FINISH_NUDGES = 2;

export class CodeActExecutor {
  private readonly task: Task;
  private readonly step: Step;
  private readonly context: ProcessingContext;
  private readonly provider: BaseProvider;
  private readonly model: string;
  /** The sandbox toolbelt: everything the model can import into an action. */
  private readonly tools: Tool[];
  /**
   * The subset also offered to the provider as ordinary tools — see
   * {@link splitCoreTools}. These stay on the belt so code can still compose
   * them; what changes is that the prompt documents them as direct calls.
   */
  private readonly coreTools: Tool[];
  private readonly systemPrompt: string;
  private readonly maxIterations: number;
  private readonly maxTokens?: number;
  private readonly turnBudget?: TurnBudget | RunBudget;
  /** The same budget when it carries the run's deadline; otherwise absent. */
  private readonly runBudget?: RunBudget;
  private readonly useFinishTask: boolean;
  private readonly threadId?: string;
  private readonly upstreamMemoryKeys: string[];
  private readonly signal?: AbortSignal;
  private readonly actionTimeoutMs?: number;
  private readonly clock?: SandboxClock;
  private readonly maxToolCallsPerAction?: number;
  private readonly resultSchema: Record<string, unknown> | null;
  private readonly residentTools: Tool[];
  private readonly deferredTools: Tool[];
  /** Namespace → the belt names grafted onto it for this step. */
  private readonly sessionModuleExports: Map<string, string[]>;
  /** Belt name → the specifier the prompt tells the model to import from. */
  private readonly graftedSpecifiers: Map<string, string>;
  /** Guest prelude for each action: tool wrappers + the object models. */
  private readonly prelude: string;
  /** Specifiers this session's actions may import (flag-gated, may be empty). */
  private readonly sandboxPackages: string[];
  /** Whether the graph DSL pack is among them — the prompt section turns on it. */
  private readonly withGraphDsl: boolean;
  private readonly withFlow: boolean;
  private readonly withFabric: boolean;
  /** The run whose capability modules an action may import, when a host has one. */
  private readonly capabilityRun?: CapabilityRun;
  /**
   * Uncommitted graph-model op queues, carried across actions of the step.
   * Internal plumbing for `openWorkflow()` — not a guest-facing contract;
   * durable results belong in memory (`nodetool.memory.*`).
   */
  private readonly graphQueues: Record<string, unknown> = {};
  private result: unknown = null;
  private actionCount = 0;

  constructor(opts: CodeActExecutorOptions) {
    this.task = opts.task;
    this.step = opts.step;
    this.context = opts.context;
    this.provider = opts.provider;
    this.model = opts.model;
    this.tools = opts.tools ? [...opts.tools] : [];
    this.maxIterations = opts.maxIterations ?? DEFAULT_CODEACT_MAX_ITERATIONS;
    this.maxTokens = opts.maxTokens;
    this.turnBudget = opts.turnBudget;
    if (isRunBudget(opts.turnBudget)) this.runBudget = opts.turnBudget;
    this.useFinishTask = opts.useFinishTask ?? false;
    this.threadId = opts.threadId;
    this.upstreamMemoryKeys = opts.upstreamMemoryKeys ?? [];
    this.signal = opts.signal;
    this.actionTimeoutMs = opts.actionTimeoutMs;
    this.clock = opts.clock;
    this.maxToolCallsPerAction = opts.maxToolCallsPerAction;
    this.sandboxPackages = sessionAllowedPackages(opts.sandboxPackages);
    this.capabilityRun = opts.capabilityRun;

    // Memory tools ride in the toolbelt as functions like everything else.
    const existing = new Set(this.tools.map((t) => t.name));
    for (const sharedTool of getSharedTools()) {
      if (!existing.has(sharedTool.name)) this.tools.push(sharedTool);
    }

    // Authoring a graph is a package, not a builder: a belt that can save,
    // validate and run a workflow gets the DSL pack on its allowlist, provided
    // this machine installed it.
    this.sandboxPackages = withFlowPackage(
      withFabricPackage(
        withGraphDslPackage(
          this.sandboxPackages,
          this.tools.map((t) => t.name),
          this.context.sandboxModuleCatalog
        ),
        this.context.sandboxModuleCatalog
      ),
      this.context.sandboxModuleCatalog
    );
    this.withGraphDsl = this.sandboxPackages.includes(GRAPH_DSL_PACKAGE);
    this.withFlow = this.sandboxPackages.includes(FLOW_PACKAGE);
    this.withFabric = this.sandboxPackages.includes(FABRIC_PACKAGE);

    // A session that allows packages can read what they document. The prompt
    // carries one line per package; the body is fetched, never injected.
    if (this.sandboxPackages.length > 0) {
      const docsTool = sandboxPackageDocsTool(
        this.sandboxPackages,
        this.context.sandboxModuleCatalog
      );
      if (!existing.has(docsTool.name)) this.tools.push(docsTool);
    }
    const hasPackageDocsTool = this.tools.some(
      (t) => t.name === SANDBOX_PACKAGE_DOCS_TOOL_NAME
    );

    // Discovery covers what the allowlist does not: a pack installed here but
    // not allowed is listed as such, so the model reports it instead of writing
    // an import that gets refused.
    if (
      this.sandboxPackages.length > 0 ||
      (this.context.sandboxModuleCatalog?.summaries().length ?? 0) > 0
    ) {
      const listTool = sandboxPackageListTool(
        this.sandboxPackages,
        this.context.sandboxModuleCatalog,
        this.capabilityRun !== undefined
      );
      if (!existing.has(listTool.name)) this.tools.push(listTool);
    }
    const hasPackageListTool = this.tools.some(
      (t) => t.name === SANDBOX_PACKAGE_LIST_TOOL_NAME
    );

    // The core set is offered to the provider as ordinary tools as well.
    this.coreTools = splitCoreTools(this.tools).core;

    const toolNames = this.tools.map((t) => t.name);
    const withGraphModel = hasGraphModelTools(toolNames);
    const withNodetoolApi = hasNodetoolApiTools(toolNames);

    // Tools an object model wraps are documented once, as `nodetool.*` /
    // `openWorkflow()` — not again as raw signatures in the catalog. They
    // stay callable through the bridge (and findable via searchTools).
    const covered = new Set<string>();
    if (withNodetoolApi) {
      for (const name of nodetoolApiCoveredToolNames(toolNames)) {
        covered.add(name);
      }
    }
    if (withGraphModel) {
      for (const name of GRAPH_MODEL_TOOL_NAMES) covered.add(name);
    }
    // Same rule for the core set, one level up: it is documented as direct
    // tools, so the catalog does not repeat it as a raw signature. The
    // bridge still reaches it, which is what keeps `nodetool.web`,
    // `nodetool.agents` and any hand-written fan-out composable in one action.
    for (const tool of this.coreTools) covered.add(tool.name);
    const catalogTools = this.tools.filter((t) => !covered.has(t.name));

    // Progressive disclosure: resident tools are documented in full; the
    // long tail is name-only in the prompt and discovered via searchTools().
    // Every tool stays callable either way — the split spends prompt tokens,
    // not capability.
    const residentNames = new Set(
      opts.residentToolNames ?? CODEACT_RESIDENT_TOOL_NAMES
    );
    if (catalogTools.length <= CODEACT_DEFER_THRESHOLD) {
      this.residentTools = [...catalogTools];
      this.deferredTools = [];
    } else {
      this.residentTools = catalogTools.filter((t) =>
        residentNames.has(t.name)
      );
      this.deferredTools = catalogTools.filter(
        (t) => !residentNames.has(t.name)
      );
    }

    const nodetoolApiSection = withNodetoolApi
      ? buildNodetoolApiPromptSection(toolNames, {
          graphDsl: this.withGraphDsl,
          nativeFlow: this.withFlow
        })
      : "";
    const extraSections: string[] = [];
    if (withGraphModel) extraSections.push(GRAPH_MODEL_PROMPT_SECTION);
    if (nodetoolApiSection) extraSections.push(nodetoolApiSection);
    if (this.withFabric) extraSections.push(FABRIC_PROMPT_SECTION);
    const preludeParts = [CODEACT_PRELUDE];
    if (withGraphModel) preludeParts.push(GRAPH_MODEL_PRELUDE);
    // Always: `nodetool` carries tool discovery and package discovery, which a
    // belt with no platform tools still needs. Every method whose tool is
    // missing throws and names it, so an empty belt degrades to that.
    preludeParts.push(NODETOOL_API_PRELUDE_FULL);
    this.prelude = preludeParts.join("\n");

    // What this step's belt makes importable, and from where.
    //
    // A name a capability module owns is grafted onto that namespace: with no
    // capability run there is nothing else to serve the import, and with one
    // the registry's own export wins, so the graft only ever adds reach. A
    // name no module owns — a tool a step or an eval constructed at its call
    // site — goes under `session`. Retiring the `tools` global would otherwise
    // have taken the reach of both with it.
    this.sessionModuleExports = new Map();
    this.graftedSpecifiers = new Map();
    for (const tool of this.tools) {
      const module = capabilityModuleOf(tool.name) ?? SESSION_CAPABILITY_MODULE;
      this.graftedSpecifiers.set(tool.name, sandboxCapabilitySpecifier(module));
      const names = this.sessionModuleExports.get(module);
      if (names === undefined)
        this.sessionModuleExports.set(module, [tool.name]);
      else names.push(tool.name);
    }

    this.resultSchema = this.loadResultSchema();
    this.systemPrompt = buildCodeActSystemPrompt({
      tools: this.residentTools,
      deferredTools: this.deferredTools,
      graftedSpecifiers: this.graftedSpecifiers,
      resultSchema: this.resultSchema,
      preamble: opts.systemPrompt,
      directToolNames: this.coreTools.map((t) => t.name),
      extraSections,
      packageLines: packagePromptLines(
        this.sandboxPackages,
        this.context.sandboxModuleCatalog
      ),
      packageDocsTool: hasPackageDocsTool,
      packageListTool: hasPackageListTool
    });
  }

  getResult(): unknown {
    return this.result;
  }

  async *execute(): AsyncGenerator<ProcessingMessage> {
    yield* withAgentSpanGen(
      "step",
      {
        provider: this.provider.provider,
        model: this.model,
        task: this.step.instructions,
        toolsCount: this.tools.length,
        extra: {
          "agent.step.id": this.step.id,
          "agent.task.id": this.task.id,
          "agent.step.mode": "codeact"
        }
      },
      () => this._executeImpl()
    );
  }

  private async *_executeImpl(): AsyncGenerator<ProcessingMessage> {
    log.debug("CodeAct step started", {
      stepId: this.step.id,
      instructions: this.step.instructions.slice(0, 60)
    });

    this.context.set(ACTIVE_MODEL_CONTEXT_KEY, {
      provider: this.provider.provider,
      model: this.model
    } satisfies ActiveModelSelection);

    const history: Message[] = [
      { role: "system", content: this.systemPrompt },
      { role: "user", content: this.buildUserMessage() }
    ];

    this.step.startTime = Date.now();
    yield this.taskUpdate(TaskUpdateEvent.StepStarted);

    const abort = new AbortController();
    const unlinkAbort = linkAbort(abort, this.signal);
    const uiEvents: ProcessingMessage[] = [];
    let lastAssistant: Message | null = null;
    let generationError: Error | null = null;
    let finishedResult: { value: unknown } | null = null;

    const toolsByName = new Map(this.tools.map((t) => [t.name, t]));
    const onToolCall = (record: ToolCallRecord): void => {
      const tool = toolsByName.get(record.name);
      uiEvents.push({
        type: "tool_call_update",
        node_id: this.step.id,
        tool_call_id: record.toolCallId,
        name: record.name,
        args: record.args,
        message: tool
          ? Tool.resolveMessage(tool, record.args)
          : `Running ${record.name}`
      } satisfies ToolCallUpdate);
    };

    const bridge = buildToolBridge({
      tools: this.tools,
      context: this.context,
      onToolCall,
      maxToolCallsPerAction: this.maxToolCallsPerAction
    });

    // The run's wall clock, when the host gave this step one. A step that has
    // run out of time must stop where it is: an expired deadline aborts the
    // controller the provider loop and the action's sandbox both run on, and
    // the stop is remembered here so the step fails naming the deadline rather
    // than the abort it caused (invariant I-3).
    let deadlineStop: ProviderStop | null = null;
    const stopIfPastDeadline = (): ProviderStop | null => {
      const budget = this.runBudget;
      if (!budget || !budget.deadline.expired()) return null;
      if (!deadlineStop) {
        const exhausted = budget.exhausted;
        deadlineStop = {
          type: "stop",
          reason: "deadline",
          detail:
            exhausted?.kind === "deadline"
              ? exhausted.detail
              : "the run deadline passed"
        };
      }
      abort.abort();
      return deadlineStop;
    };

    // `__callTool` serves the graft as well as the belt, so gating is
    // unchanged on either path.
    const bridgedCall = bridge.globals["__callTool"] as (
      name: unknown,
      argsJson: unknown
    ) => Promise<{ ok: true; result: unknown } | { ok: false; error: string }>;
    const callBeltTool = async (
      name: unknown,
      argsJson: unknown
    ): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> => {
      const expired = stopIfPastDeadline();
      if (expired) return { ok: false, error: expired.detail };
      return bridgedCall(name, argsJson);
    };
    // The guest reaches tools through this global, so the check covers every
    // bridged call an action makes, not just the ones the host initiates.
    bridge.globals["__callTool"] = callBeltTool;

    const finishBridge = async (
      resultJson: unknown
    ): Promise<{ ok: true } | { ok: false; error: string }> => {
      let payload: unknown = null;
      if (isString(resultJson)) {
        try {
          payload = JSON.parse(resultJson);
        } catch {
          return {
            ok: false,
            error: "finish: result must be JSON-serializable"
          };
        }
      }
      if (payload === null || payload === undefined) {
        return { ok: false, error: "finish: missing result" };
      }
      if (this.resultSchema) {
        const violations = validateAgainstSchema(payload, this.resultSchema);
        if (violations.length > 0) {
          return {
            ok: false,
            error: `Result validation failed: ${formatViolations(violations)}`
          };
        }
      }
      // A schema checks types, not truth — but "[object Object]" is always an
      // unread object coerced to a string. Reject it here so the catch-around-
      // finish repair loop fixes the extraction inside the same action.
      const artifacts = coercionArtifactPaths(payload);
      if (artifacts.length > 0) {
        return {
          ok: false,
          error:
            `finish: ${artifacts.join(", ")} holds a coerced or serialized ` +
            `object instead of the value itself. Log the raw value ` +
            `(console.log(JSON.stringify(...))) and extract the actual field ` +
            `— never String() or JSON.stringify() an envelope into a string ` +
            `field.`
        };
      }
      finishedResult = { value: payload };
      return { ok: true };
    };

    // Discovery over the FULL toolbelt (resident hits included, so a
    // redundant query still answers instead of coming back empty).
    const searchCatalog = this.tools.map((t) => ({
      name: t.name,
      description: t.description
    }));
    const searchToolsBridge = async (
      query: unknown,
      maxResults: unknown
    ): Promise<
      { ok: true; result: ToolSearchHit[] } | { ok: false; error: string }
    > => {
      try {
        const limit = isFiniteNumber(maxResults)
          ? Math.max(1, Math.min(25, Math.floor(maxResults)))
          : 5;
        const byName = new Map(this.tools.map((t) => [t.name, t]));
        const hits = searchTools(searchCatalog, String(query ?? ""), limit).map(
          (entry): ToolSearchHit =>
            toolSearchHit(
              byName.get(entry.name) as Tool,
              capabilityModuleOf(entry.name) ?? SESSION_CAPABILITY_MODULE
            )
        );
        return { ok: true, result: hits };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    };

    const sessionModules = [...this.sessionModuleExports.entries()].map(
      ([module, exports]) => ({
        module,
        exports,
        call: async (name: string, args: unknown) => {
          const r = await callBeltTool(name, JSON.stringify(args ?? {}));
          if (r.ok !== true) throw new Error(r.error);
          return r.result;
        }
      })
    );

    const executeAction = async (
      args: Record<string, unknown>
    ): Promise<string | MessageContent[]> => {
      const expired = stopIfPastDeadline();
      if (expired) {
        return JSON.stringify({
          ok: false,
          error: expired.detail,
          toolCalls: 0
        } satisfies ActionObservation);
      }
      const code = isString(args?.["code"]) ? args["code"] : "";
      if (!code.trim()) {
        return JSON.stringify({
          ok: false,
          error: "execute_code: `code` must be a non-empty string",
          toolCalls: 0
        } satisfies ActionObservation);
      }
      // Auto mode's one question, asked before the program runs.
      const admission = await admitCodeAction(this.capabilityRun?.gate, args);
      if (!admission.allowed) {
        return JSON.stringify({
          ok: false,
          error: admission.error,
          toolCalls: 0
        } satisfies ActionObservation);
      }
      const mountOptions: MountCapabilityModulesOptions = {};
      if (this.signal !== undefined) mountOptions.signal = this.signal;
      if (sessionModules.length > 0) mountOptions.session = sessionModules;
      const platform = await mountCapabilityModules(
        code,
        this.capabilityRun,
        mountOptions
      );
      if (!platform.ok) {
        return JSON.stringify({
          ok: false,
          error: platform.error,
          toolCalls: 0
        } satisfies ActionObservation);
      }
      const mount = mountActionModules(
        code,
        this.sandboxPackages,
        this.context.sandboxModuleCatalog,
        new Set(platform.mount?.facades.keys() ?? [])
      );
      if (!mount.ok) {
        return JSON.stringify({
          ok: false,
          error: mount.error,
          toolCalls: 0
        } satisfies ActionObservation);
      }
      this.actionCount++;
      bridge.resetActionBudget();

      const outcome = await runInSandbox({
        code: `${this.prelude}\n${code}`,
        context: this.context,
        timeoutMs: this.actionTimeoutMs ?? DEFAULT_CODEACT_ACTION_TIMEOUT_MS,
        // The linked controller, not the caller's raw signal: it fires for the
        // caller's cancellation *and* for a deadline that expires mid-action,
        // which is the only way an in-flight program is stopped.
        signal: abort.signal,
        clock: this.clock,
        modules: mount.modules,
        capabilities: platform.mount,
        globals: {
          ...bridge.globals,
          __finish: finishBridge,
          __searchTools: searchToolsBridge,
          __graphQueues: this.graphQueues
        }
      });

      const observation: ActionObservation = {
        ok: outcome.success,
        toolCalls: bridge.callCount()
      };
      if (outcome.success) {
        if (outcome.result !== undefined) observation.result = outcome.result;
      } else {
        Object.assign(
          observation,
          annotateFailure(outcome.error, outcome.stack, this.prelude, code)
        );
      }
      if (outcome.logs && outcome.logs.length > 0) {
        observation.logs = outcome.logs;
      }

      // A validated finish() completes the step even when the action crashed
      // after recording it — the model cannot retract a validated result.
      if (finishedResult) {
        observation.finished = true;
        this.storeCompletionResult(finishedResult.value);
        uiEvents.push(this.taskUpdate(TaskUpdateEvent.StepCompleted));
        uiEvents.push(this.stepResult(finishedResult.value));
        abort.abort();
      } else if (
        this.resultSchema !== null &&
        outcome.success &&
        observation.result !== undefined &&
        observation.result !== null
      ) {
        // The action produced a value and ended the turn without finishing.
        // Say so in the observation: an absent `finished` reads as success.
        observation.finished = false;
        observation.note =
          validateAgainstSchema(observation.result, this.resultSchema).length ===
          0
            ? RETURN_MATCHES_SCHEMA_NOTE
            : RETURN_IS_NOT_FINISH_NOTE;
      }

      const text = truncateToolResult(JSON.stringify(observation));
      // Pixels a tool returned during the action ride beside the observation
      // as a provider image message; the observation itself stays light.
      const images = bridge.drainImages();
      return images.length > 0 ? [{ type: "text", text }, ...images] : text;
    };

    const providerTools = [
      {
        name: EXECUTE_CODE_TOOL_NAME,
        description:
          "Execute a JavaScript action in the sandbox. The observation " +
          "(return value, logs, error) is the tool result.",
        inputSchema: EXECUTE_CODE_INPUT_SCHEMA,
        execute: (args: Record<string, unknown>) => executeAction(args)
      },
      // No `onToolCall` here: a top-level call already arrives as a ToolCall
      // item on the provider stream, which the loop below reports. Only the
      // sandbox's bridged calls need the extra hook.
      ...buildCoreProviderTools({
        tools: this.coreTools,
        context: this.context
      })
    ];

    const drainUi = function* (): Generator<ProcessingMessage> {
      while (uiEvents.length > 0) yield uiEvents.shift() as ProcessingMessage;
    };

    // Whether the last generation round used up its iteration budget, as
    // opposed to the model ending its turn on its own. Only the first case is
    // "exceeded N iterations"; the loop below distinguishes them.
    let exhaustedIterations = false;
    let nudges = 0;
    // Model turns across every nudge round. `maxIterations` bounds the *step*,
    // so each round is given what is left of it — handing every round the full
    // allowance let MAX_FINISH_NUDGES multiply the ceiling by three.
    let turnsTotal = 0;
    // Why the provider loop stopped, when it was not the model ending its turn.
    let providerStop: ProviderStop | null = null;

    try {
      for (;;) {
        const remainingIterations = this.maxIterations - turnsTotal;
        if (remainingIterations <= 0) {
          // Nothing left to spend on another round, so there is no round to
          // run: `generateLoop` with a non-positive budget makes no turn and
          // would report an iteration stop nobody asked for.
          exhaustedIterations = true;
          break;
        }
        const loopArgs: Parameters<BaseProvider["generateLoop"]>[0] = {
          messages: history,
          model: this.model,
          tools: providerTools,
          threadId: this.threadId,
          maxIterations: remainingIterations,
          maxTokens: this.maxTokens,
          sequentialTools: true,
          workspaceDir: this.context.workspaceDir ?? undefined,
          signal: abort.signal
        };
        if (this.turnBudget) loopArgs.turnBudget = this.turnBudget;
        const stream = this.provider.generateLoop(loopArgs);

        // One assistant message per provider turn, so this counts the round's
        // iterations against the budget the round was given.
        let turnsThisRound = 0;

        for await (const item of stream) {
          if (isProviderStop(item)) {
            // The loop ran out of something. Recorded rather than yielded: it
            // is what the step's failure message names.
            providerStop = item;
            yield* drainUi();
            continue;
          }
          if (isToolCall(item)) {
            const coreTool =
              item.name === EXECUTE_CODE_TOOL_NAME
                ? undefined
                : toolsByName.get(item.name);
            yield {
              type: "tool_call_update",
              node_id: this.step.id,
              tool_call_id: item.id,
              name: item.name,
              args: item.args,
              message: coreTool
                ? Tool.resolveMessage(coreTool, item.args)
                : executeCodeMessage(item.args)
            } satisfies ToolCallUpdate;
            yield* drainUi();
            continue;
          }
          if (isChunk(item)) {
            if (isNonEmptyString(item.content)) {
              yield {
                type: "chunk",
                node_id: this.step.id,
                content: item.content,
                done: false
              } satisfies Chunk;
            }
            yield* drainUi();
            continue;
          }
          if ("type" in item && item.type === "message") {
            const m = (item as { message?: Message }).message;
            if (m && m.role === "assistant") {
              turnsThisRound++;
              lastAssistant =
                isString(m.content)
                  ? { ...m, content: removeThinkTags(m.content) }
                  : m;
            }
          }
          yield* drainUi();
        }
        turnsTotal += turnsThisRound;
        exhaustedIterations = turnsTotal >= this.maxIterations;

        if (!this.shouldNudgeToFinish(lastAssistant, nudges, abort.signal)) {
          break;
        }
        nudges++;
        // The provider copies the message array, so this round's transcript
        // never came back to us. Carrying the prose forward is what makes the
        // nudge a reply to it instead of a repetition of the brief. An empty
        // assistant turn is not carried: several provider APIs reject a
        // content-less message outright.
        if (lastAssistant && hasContent(lastAssistant)) {
          history.push(lastAssistant);
        }
        history.push({ role: "user", content: FINISH_CONTRACT_NUDGE });
        log.debug("CodeAct step ended in prose; re-prompting to finish", {
          stepId: this.step.id,
          nudge: nudges
        });
      }
    } catch (e) {
      generationError = e instanceof Error ? e : new Error(String(e));
      log.error("CodeAct step generation failed", {
        stepId: this.step.id,
        error: generationError.message
      });
    } finally {
      unlinkAbort();
    }

    yield* drainUi();

    // Unschema'd steps also finalize from a no-tool-call assistant message —
    // the same prose-mode rule StepExecutor has.
    if (
      !this.step.completed &&
      this.resultSchema === null &&
      lastAssistant &&
      (!lastAssistant.toolCalls || lastAssistant.toolCalls.length === 0) &&
      lastAssistant.content !== null &&
      lastAssistant.content !== undefined
    ) {
      this.storeCompletionResult(lastAssistant.content);
      yield this.taskUpdate(TaskUpdateEvent.StepCompleted);
      yield this.stepResult(lastAssistant.content);
    }

    if (!this.step.completed) {
      this.step.endTime = Date.now();
      // A deadline this executor tripped outranks the abort it caused; an
      // `iterations` stop keeps the wording it always had.
      const budgetStop =
        deadlineStop ??
        (providerStop && providerStop.reason !== "iterations"
          ? providerStop
          : null);
      const message = generationError
        ? `Step failed: ${generationError.message}`
        : budgetStop
          ? `Step failed: ${this.stopDetail(budgetStop)}`
          : exhaustedIterations
            ? `Step failed: exceeded ${this.maxIterations} iterations without completion`
            : this.resultSchema !== null
              ? `Step failed: ended after ${this.actionCount} action(s) without ` +
                `calling finish().${lastProseHint(lastAssistant)}`
              : `Step failed: ended after ${this.actionCount} action(s) with no ` +
                `final message to use as the result.`;
      this.step.failed = true;
      this.step.error = message;
      const errorResult = { error: message };
      this.result = errorResult;
      this.context.memory.set({
        key: memoryKeys.step(this.step.id),
        kind: "step_result",
        value: errorResult,
        source: this.step.id,
        title: `Failed: ${this.step.instructions.slice(0, 60)}`
      });
      yield this.taskUpdate(TaskUpdateEvent.StepFailed);
      yield {
        type: "step_result",
        step: { id: this.step.id, instructions: this.step.instructions },
        result: errorResult,
        error: message,
        is_task_result: this.useFinishTask
      } satisfies StepResult;
    }
  }

  /**
   * What to say about a stop the step ended on. A {@link RunBudget} knows which
   * ceiling it was and says so ("turn budget of $5 reached"); a bare
   * {@link TurnBudget} only knows that one refused, and the stop item's own
   * text is all there is.
   */
  private stopDetail(stop: ProviderStop): string {
    if (stop.reason === "budget" || stop.reason === "deadline") {
      return this.runBudget?.exhausted?.detail ?? stop.detail;
    }
    return stop.detail;
  }

  /**
   * Whether to re-prompt after a generation round that produced no result.
   *
   * The recoverable case is narrow: a schema'd step whose last assistant
   * message carried no tool calls — the model stopped to explain instead of
   * calling `finish()`, and the work it did is recoverable in the next round.
   * A round that ended on a tool call ran out of budget instead, which another user
   * message does not fix, and a cancelled run must not spend a turn at all.
   */
  private shouldNudgeToFinish(
    lastAssistant: Message | null,
    nudges: number,
    signal: AbortSignal
  ): boolean {
    if (this.step.completed) return false;
    if (this.resultSchema === null) return false;
    if (nudges >= MAX_FINISH_NUDGES) return false;
    if (signal.aborted) return false;
    if (this.signal?.aborted === true) return false;
    if (!lastAssistant) return false;
    const toolCalls = lastAssistant.toolCalls;
    return !toolCalls || toolCalls.length === 0;
  }

  private loadResultSchema(): Record<string, unknown> | null {
    if (!this.step.outputSchema) return null;
    try {
      const parsed = JSON.parse(this.step.outputSchema) as unknown;
      if (isRecord(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      log.warn("Ignoring unparseable outputSchema", { stepId: this.step.id });
      return null;
    }
  }

  private buildUserMessage(): string {
    const parts: string[] = [this.step.instructions];
    const keys = [
      ...this.step.dependsOn.map((id) => memoryKeys.step(id)),
      ...this.upstreamMemoryKeys
    ];
    if (keys.length > 0) {
      parts.push(
        `Required upstream context — read these before acting (via ` +
          `\`await nodetool.shared.read([...])\`):\n` +
          keys.map((k) => `- ${k}`).join("\n")
      );
    }
    return parts.join("\n\n");
  }

  private storeCompletionResult(value: unknown): void {
    this.step.completed = true;
    this.step.endTime = Date.now();
    this.context.memory.set({
      key: memoryKeys.step(this.step.id),
      kind: "step_result",
      value,
      source: this.step.id,
      title: this.step.instructions.slice(0, 80)
    });
    if (this.useFinishTask) {
      this.context.memory.set({
        key: memoryKeys.task(this.task.id),
        kind: "task_result",
        value,
        source: this.task.id,
        title: this.task.title
      });
    }
    this.result = value;
  }

  private taskUpdate(event: TaskUpdateEvent): TaskUpdate {
    return {
      type: "task_update",
      node_id: this.step.id,
      task: { id: this.task.id, title: this.task.title },
      step: { id: this.step.id, instructions: this.step.instructions },
      event
    };
  }

  private stepResult(result: unknown): StepResult {
    return {
      type: "step_result",
      step: { id: this.step.id, instructions: this.step.instructions },
      result,
      is_task_result: this.useFinishTask
    };
  }
}

/** Whether a message carries anything a provider will accept as content. */
function hasContent(message: Message): boolean {
  const content = message.content;
  if (isString(content)) return content.trim() !== "";
  return Array.isArray(content) && content.length > 0;
}

function isChunk(item: ProviderStreamItem): item is Chunk {
  return (
    "type" in item &&
    item.type === "chunk" &&
    "content" in item &&
    typeof item.content === "string"
  );
}

function isToolCall(item: ProviderStreamItem): item is ToolCall {
  return "name" in item && typeof item.name === "string" && "id" in item;
}
