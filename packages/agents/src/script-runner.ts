/**
 * ScriptRunner — code-shaped agent orchestration.
 *
 * Executes an orchestration *script* (plain JavaScript) inside the QuickJS
 * sandbox. The script coordinates sub-agents through a small primitive set —
 * `agent()`, `parallel()`, `pipeline()`, `log()`, `budget` — while every
 * `agent()` call runs a real {@link StepExecutor} on the host. This is the
 * counterpart to the data-shaped `TaskPlan`: a script can express loops,
 * conditionals, budget-scaled fan-out, and dedup-between-rounds that a static
 * task DAG cannot.
 *
 * Guest API (injected as a prelude before the script):
 *
 * - `await agent(prompt, opts?)` — run a sub-agent, return its result.
 *   `opts.schema` (JSON schema object) forces a structured result via
 *   `finish_step`; `opts.tools` (string[]) restricts the toolset;
 *   `opts.label` names the run in progress events. Throws on failure.
 * - `await parallel(thunks)` — run thunks concurrently; a failed thunk
 *   resolves to `null` instead of rejecting the batch.
 * - `await pipeline(items, ...stages)` — run each item through all stages
 *   independently (no barrier between stages). Each stage receives
 *   `(prevResult, originalItem, index)`. A stage that throws drops the item
 *   to `null`.
 * - `log(message)` — emit a progress message to the host event stream.
 * - `budget` — `maxAgentCalls`, `agentCalls()`, `remainingCalls()`,
 *   `await spentUsd()`.
 * - `inputs` — the caller-supplied inputs object, verbatim.
 *
 * The script's `return` value is the run's result.
 *
 * Host-side limits: concurrent `agent()` calls are capped by a semaphore
 * (`maxConcurrentAgents`), total calls by `maxAgentCalls`. Excess concurrent
 * calls queue; calls past the lifetime cap fail.
 */

import type { BaseProvider, ProcessingContext } from "@nodetool-ai/runtime";
import { createLogger } from "@nodetool-ai/config";
import type {
  LogUpdate,
  ProcessingMessage,
  StepResult
} from "@nodetool-ai/protocol";
import { StepExecutor } from "./step-executor.js";
import type { Tool } from "./tools/base-tool.js";
import type { Step, Task } from "./types.js";
import { runInSandbox } from "./js-sandbox.js";

const log = createLogger("nodetool.agents.script-runner");

export const DEFAULT_MAX_CONCURRENT_AGENTS = 8;
export const DEFAULT_MAX_AGENT_CALLS = 100;
/**
 * Wall-clock limit for the whole script, agent calls included. Deliberately
 * generous — the QuickJS `executionTimeout` counts time spent awaiting host
 * bridges, and sub-agents are slow.
 */
export const DEFAULT_SCRIPT_TIMEOUT_MS = 60 * 60 * 1000;

/** Options an `agent()` call may pass from the guest (JSON-decoded). */
interface AgentCallOpts {
  schema?: Record<string, unknown>;
  tools?: string[];
  label?: string;
}

/** Never-rejecting bridge envelope; the guest prelude re-throws on `ok: false`. */
type BridgeResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

export interface ScriptRunnerOptions {
  provider: BaseProvider;
  model: string;
  context: ProcessingContext;
  tools?: Tool[];
  systemPrompt?: string;
  inputs?: Record<string, unknown>;
  maxStepIterations?: number;
  /** Concurrent `agent()` calls beyond this queue. Default 8. */
  maxConcurrentAgents?: number;
  /** Lifetime `agent()` call cap for one script run. Default 100. */
  maxAgentCalls?: number;
  /** Wall-clock limit for the whole script run. Default 60 min. */
  scriptTimeoutMs?: number;
  /** External cancellation, forwarded to every sub-agent step executor. */
  signal?: AbortSignal;
}

/** Simple counting semaphore; released slots go to waiters FIFO. */
class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(slots: number) {
    this.available = Math.max(1, slots);
  }

  async acquire(): Promise<void> {
    if (this.available > 0) {
      this.available--;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }

  release(): void {
    const next = this.waiters.shift();
    if (next) next();
    else this.available++;
  }
}

/**
 * Single-consumer async message channel. Bridges push from inside the sandbox
 * run; the `execute` generator drains and yields.
 */
class MessageChannel {
  private readonly queue: ProcessingMessage[] = [];
  private wakeup: (() => void) | null = null;

  push(msg: ProcessingMessage): void {
    this.queue.push(msg);
    this.signal();
  }

  signal(): void {
    const w = this.wakeup;
    this.wakeup = null;
    w?.();
  }

  drain(): ProcessingMessage[] {
    return this.queue.splice(0);
  }

  wait(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wakeup = resolve;
    });
  }
}

/**
 * Guest-side prelude prepended to every orchestration script. Defines the
 * public primitives on top of the host bridges (`__runAgent`, `__log`,
 * `__budgetSpentUsd`, `__maxAgentCalls`). Host bridges never reject — they
 * resolve `{ok, result|error}` envelopes and `agent()` re-throws, mirroring
 * the js-sandbox never-reject convention.
 */
const SCRIPT_PRELUDE = `
function log(message) {
  void __log(typeof message === "string" ? message : JSON.stringify(message));
}
const __budgetState = { calls: 0 };
async function agent(prompt, opts) {
  __budgetState.calls += 1;
  const response = await __runAgent(
    prompt,
    opts === undefined ? "" : JSON.stringify(opts)
  );
  if (!response || response.ok !== true) {
    throw new Error(
      response && response.error ? response.error : "agent call failed"
    );
  }
  return response.result;
}
async function parallel(thunks) {
  return Promise.all(
    thunks.map((thunk, i) =>
      Promise.resolve()
        .then(thunk)
        .catch((e) => {
          log("parallel: thunk " + i + " failed: " + (e && e.message ? e.message : e));
          return null;
        })
    )
  );
}
async function pipeline(items, ...stages) {
  return Promise.all(
    items.map(async (item, index) => {
      let value = item;
      for (const stage of stages) {
        try {
          value = await stage(value, item, index);
        } catch (e) {
          log("pipeline: item " + index + " failed: " + (e && e.message ? e.message : e));
          return null;
        }
      }
      return value;
    })
  );
}
const budget = {
  maxAgentCalls: __maxAgentCalls,
  agentCalls: () => __budgetState.calls,
  remainingCalls: () => Math.max(0, __maxAgentCalls - __budgetState.calls),
  spentUsd: () => __budgetSpentUsd()
};
`;

/** Names the prelude/bridges claim inside the guest. */
export const SCRIPT_RESERVED_NAMES = [
  "agent",
  "parallel",
  "pipeline",
  "log",
  "budget",
  "inputs"
] as const;

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Force a value through JSON so it marshals cleanly across the WASM boundary. */
function toTransferable(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

export class ScriptRunner {
  private readonly provider: BaseProvider;
  private readonly model: string;
  private readonly context: ProcessingContext;
  private readonly tools: Tool[];
  private readonly systemPrompt?: string;
  private readonly inputs: Record<string, unknown>;
  private readonly maxStepIterations?: number;
  private readonly signal?: AbortSignal;
  private readonly maxAgentCalls: number;
  private readonly scriptTimeoutMs: number;
  private readonly semaphore: Semaphore;
  private readonly channel = new MessageChannel();
  private agentCalls = 0;

  constructor(opts: ScriptRunnerOptions) {
    this.provider = opts.provider;
    this.model = opts.model;
    this.context = opts.context;
    this.tools = opts.tools ?? [];
    this.systemPrompt = opts.systemPrompt;
    this.inputs = opts.inputs ?? {};
    this.maxStepIterations = opts.maxStepIterations;
    this.signal = opts.signal;
    this.maxAgentCalls = opts.maxAgentCalls ?? DEFAULT_MAX_AGENT_CALLS;
    this.scriptTimeoutMs = opts.scriptTimeoutMs ?? DEFAULT_SCRIPT_TIMEOUT_MS;
    this.semaphore = new Semaphore(
      opts.maxConcurrentAgents ?? DEFAULT_MAX_CONCURRENT_AGENTS
    );
  }

  /**
   * Run the orchestration script. Yields every ProcessingMessage produced by
   * sub-agents (plus script `log()` lines) and returns the script's return
   * value. Throws when the script itself fails (syntax error, uncaught guest
   * exception, timeout).
   */
  async *execute(script: string): AsyncGenerator<ProcessingMessage, unknown> {
    log.info("Script run started", {
      bytes: script.length,
      maxAgentCalls: this.maxAgentCalls
    });
    yield this.logUpdate("Executing orchestration script...");

    let settled = false;
    const sandboxPromise = runInSandbox({
      code: `${SCRIPT_PRELUDE}\n${script}`,
      context: this.context,
      timeoutMs: this.scriptTimeoutMs,
      signal: this.signal,
      globals: {
        __runAgent: (prompt: string, optsJson: string) =>
          this.runAgentBridge(prompt, optsJson),
        __log: async (message: string) => this.logBridge(message),
        __budgetSpentUsd: async () => {
          try {
            return this.provider.getTotalCost();
          } catch {
            return 0;
          }
        },
        __maxAgentCalls: this.maxAgentCalls,
        inputs: toTransferable(this.inputs)
      }
    }).finally(() => {
      settled = true;
      this.channel.signal();
    });

    while (true) {
      for (const msg of this.channel.drain()) yield msg;
      if (settled) break;
      await this.channel.wait();
    }
    // A push can land between the last drain and the sandbox settling.
    for (const msg of this.channel.drain()) yield msg;

    const outcome = await sandboxPromise;
    if (!outcome.success) {
      const detail = outcome.stack
        ? `${outcome.error}\n${outcome.stack}`
        : outcome.error;
      log.error("Script run failed", { error: outcome.error });
      throw new Error(`Orchestration script failed: ${detail}`);
    }

    log.info("Script run completed", { agentCalls: this.agentCalls });
    yield this.logUpdate(
      `Orchestration script finished (${this.agentCalls} agent call${this.agentCalls === 1 ? "" : "s"}).`
    );
    return outcome.result ?? null;
  }

  /**
   * Host bridge behind the guest `agent()` primitive: run one sub-agent as a
   * single {@link StepExecutor} step. Never rejects — failures come back as
   * `{ok: false, error}` and the guest prelude re-throws them, so the QuickJS
   * host-promise-rejection leak is never hit.
   */
  private async runAgentBridge(
    prompt: unknown,
    optsJson: unknown
  ): Promise<BridgeResult> {
    try {
      if (typeof prompt !== "string" || !prompt.trim()) {
        return { ok: false, error: "agent: prompt must be a non-empty string" };
      }
      if (this.agentCalls >= this.maxAgentCalls) {
        return {
          ok: false,
          error: `agent call budget exhausted (max ${this.maxAgentCalls} calls per script)`
        };
      }
      this.agentCalls++;
      const callIndex = this.agentCalls;

      let opts: AgentCallOpts = {};
      if (typeof optsJson === "string" && optsJson) {
        try {
          opts = JSON.parse(optsJson) as AgentCallOpts;
        } catch {
          return { ok: false, error: "agent: opts must be JSON-serializable" };
        }
      }

      await this.semaphore.acquire();
      try {
        return await this.runSubAgent(prompt, opts, callIndex);
      } finally {
        this.semaphore.release();
      }
    } catch (e) {
      return { ok: false, error: errorMessage(e) };
    }
  }

  private async runSubAgent(
    prompt: string,
    opts: AgentCallOpts,
    callIndex: number
  ): Promise<BridgeResult> {
    const label = opts.label?.trim() || `agent ${callIndex}`;
    const step: Step = {
      id: `script_agent_${callIndex}`,
      instructions: prompt,
      completed: false,
      dependsOn: [],
      logs: [],
      outputSchema: opts.schema ? JSON.stringify(opts.schema) : undefined
    };
    const task: Task = {
      id: `script_task_${callIndex}`,
      title: label,
      steps: [step]
    };

    const tools = Array.isArray(opts.tools)
      ? this.tools.filter((t) => opts.tools!.includes(t.name))
      : [...this.tools];

    const executor = new StepExecutor({
      task,
      step,
      context: this.context,
      provider: this.provider,
      model: this.model,
      tools,
      systemPrompt: this.systemPrompt,
      maxIterations: this.maxStepIterations,
      signal: this.signal
    });

    let result: unknown = null;
    let error: string | null = null;
    for await (const msg of executor.execute()) {
      this.channel.push(msg);
      if (msg.type === "step_result") {
        const sr = msg as StepResult;
        if (sr.error) error = sr.error;
        else if (sr.result !== null && sr.result !== undefined) {
          result = sr.result;
        }
      }
    }

    if (error) return { ok: false, error };
    // A step that dies (iteration cap, provider error) reports the failure as
    // a `{error}` result payload rather than a step_result error field.
    if (
      result !== null &&
      typeof result === "object" &&
      Object.keys(result).length === 1 &&
      "error" in result
    ) {
      return { ok: false, error: String((result as { error: unknown }).error) };
    }
    if (result === null || result === undefined) {
      return {
        ok: false,
        error: `agent "${label}" ended without producing a result`
      };
    }
    return { ok: true, result: toTransferable(result) };
  }

  private logBridge(message: unknown): void {
    this.channel.push(this.logUpdate(String(message)));
  }

  private logUpdate(content: string): LogUpdate {
    return {
      type: "log_update",
      node_id: "script_runner",
      node_name: "script_runner",
      content,
      severity: "info"
    };
  }
}
