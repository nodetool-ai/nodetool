/**
 * CodeAct wiring for a local (no-server) chat turn.
 *
 * A chat turn acts by writing sandboxed JavaScript over the toolbelt, not by
 * emitting JSON tool calls — the same contract the WebSocket chat runner uses
 * (`createChatCodeActSession`). The CLI reaches it through `processChat`, so
 * the session's `execute_code` is handed over as an ordinary {@link Tool}
 * whose `process()` runs one code action; the toolbelt itself moves inside the
 * sandbox and is never offered to the provider.
 *
 * Two sets also reach the provider directly, as on the server. The direct
 * tools (`DIRECT_TOOL_NAMES` — file, search, fetch, todo, delegation, plus
 * model and node discovery) are the shapes every model is trained on, so they
 * cost less as a plain tool call than as a sandbox round trip; they stay on
 * the belt too, because code composes them.
 * And `view_image` is the one channel that puts pixels into the model's
 * context, which cannot ride the JSON observation envelope.
 */

import type {
  BaseProvider,
  JsonSchema,
  Message,
  ProcessingContext,
  RunBudget
} from "@nodetool-ai/runtime";
import { DIRECT_TOOL_NAMES } from "@nodetool-ai/runtime";
import {
  BackgroundSubtaskRegistry,
  contextSecretAvailability,
  createCapabilityRun,
  gateLegacyTools,
  capabilityRunForLegacyTool,
  Tool,
  toolForCapabilityName,
  createChatCodeActSession,
  formatSkillCatalogForPrompt,
  mergeSystemSkills,
  type ChatCodeActSession,
  type PermissionGateOptions
} from "@nodetool-ai/agents";
import { Skill } from "@nodetool-ai/models";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { isNonBlankString } from "./predicates.js";

/** The tool that stays a direct provider tool alongside `execute_code`. */
const VIEW_IMAGE_TOOL = "view_image";

/** One code action, exposed to `processChat` as a tool. */
class ExecuteCodeTool extends Tool {
  readonly name: string;
  readonly description: string;
  protected override readonly jsonSchema: JsonSchema;

  constructor(private readonly session: ChatCodeActSession) {
    super();
    this.name = session.providerTool.name;
    this.description = session.providerTool.description;
    this.jsonSchema = session.providerTool.inputSchema;
  }

  // HOLDOUT (anti-slop/no-unknown-returns): a CodeAct action answers with
  // whatever its body returned, and the base `Tool.process` contract in
  // `@nodetool-ai/agents` declares `Promise<unknown>`.
  async process(
    _context: ProcessingContext,
    params: Record<string, unknown>
  ): Promise<unknown> {
    return this.session.executeAction(params);
  }

  override userMessage(params: Record<string, unknown>): string {
    const title = params["title"];
    return isNonBlankString(title) ? title.trim() : "Executing code action";
  }
}

interface CliCodeActTurn {
  /**
   * The tools handed to the provider: `execute_code`, the core tools, and
   * `view_image`.
   */
  tools: Tool[];
  /** System prompt for the turn: the CodeAct contract and tool catalog. */
  systemPrompt: string;
  session: ChatCodeActSession;
}

interface CliCodeActTurnOptions {
  /** The full local toolbelt; it lives inside the sandbox. */
  tools: Tool[];
  context: ProcessingContext;
  signal?: AbortSignal;
  /** Fires before each tool the sandbox calls. */
  onToolCall?: (record: {
    name: string;
    args: Record<string, unknown>;
  }) => void;
  /** The skill catalog section from {@link loadCliSkillCatalog}. */
  skillCatalog?: string;
}

export function createCliCodeActTurn(
  options: CliCodeActTurnOptions
): CliCodeActTurn {
  const byName = new Map(options.tools.map((tool) => [tool.name, tool]));
  const directTools = options.tools.filter(
    (t) =>
      t.name !== VIEW_IMAGE_TOOL &&
      (t.name === "bash" || DIRECT_TOOL_NAMES.has(t.name))
  );
  const beltTools = options.tools.filter((t) => t.name !== VIEW_IMAGE_TOOL);

  const firstTool = options.tools[0];
  const capabilityRun = firstTool
    ? capabilityRunForLegacyTool(firstTool, options.context)
    : undefined;
  const session = createChatCodeActSession({
    capabilityRun,
    tools: beltTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema
    })),
    directToolNames: directTools.map((t) => t.name),
    executeTool: async (call) => {
      const tool = byName.get(call.name);
      if (!tool) throw new Error(`Tool "${call.name}" not available`);
      const run = capabilityRunForLegacyTool(tool, options.context);
      if (run) {
        const args = { ...Tool.stripMessage(call.args) };
        if (tool.needsToolCallId) {
          args["_tool_call_id"] = call.id;
        }
        return run.invoke(tool.name, args);
      }
      return Tool.executeTool(tool, options.context, call.args, {
        toolCallId: call.id
      });
    },
    context: options.context,
    signal: options.signal,
    onToolCall: options.onToolCall
  });

  const tools: Tool[] = [new ExecuteCodeTool(session), ...directTools];
  const viewImage = byName.get(VIEW_IMAGE_TOOL);
  if (viewImage) tools.push(viewImage);

  const systemPrompt = options.skillCatalog
    ? `${session.systemPromptSection}\n\n${options.skillCatalog}`
    : session.systemPromptSection;
  return { tools, systemPrompt, session };
}

/**
 * The skill catalog a server chat turn carries: the user's skills plus the
 * shipped ones. Without it the turn has `load_skill` but no list of names to
 * load. A database failure costs the user's rows, not the shipped skills.
 */
export async function loadCliSkillCatalog(userId: string): Promise<string> {
  let rows: Skill[] = [];
  try {
    rows = await Skill.listByUser(userId);
  } catch {
    // The shipped skills still apply.
  }
  return formatSkillCatalogForPrompt(
    mergeSystemSkills(
      rows.map((row) => ({ name: row.name, description: row.description }))
    )
  );
}

// ---------------------------------------------------------------------------
// The belt
// ---------------------------------------------------------------------------

export interface CliAgentBeltOptions {
  /** The platform belt. Every delegated loop inherits this snapshot. */
  baseTools: Tool[];
  provider: BaseProvider;
  model: string;
  /** Where a delegated loop's messages go — its chunks, tool calls, plan events. */
  forwardMessage: (message: ProcessingMessage) => void;
  /**
   * The run's permission gate. Built once by the host (`createCliPermissionGate`)
   * and shared by reference, so a mode change and an "allow for this session"
   * answer reach every loop this belt starts.
   */
  gate: PermissionGateOptions;
  /** Read-only `run_search` fan-out. On unless set false. */
  readOnlySearch?: boolean;
  /** `create_plan` and `execute_plan`. Off unless set true. */
  planning?: boolean;
  /**
   * The run's budget. Every loop this belt spawns reserves against it rather
   * than opening one of its own (invariant I-2). Omitted, a delegated loop
   * falls back to the budget on the calling context.
   */
  budget?: RunBudget;
}

/**
 * The toolbelt a local CLI loop runs on: the platform tools plus the
 * capabilities that spawn loops of their own.
 *
 * One builder for both entrances — `nodetool agent run` and `--stdin` chat —
 * so an objective and a chat message reach the same tools. The delegation
 * capabilities are built over one runtime, and the background registry is
 * created once here rather than per call, so every `start_subtask` this
 * session writes is what the same session's `wait_subtasks` reads.
 */
export function buildCliAgentBelt(options: CliAgentBeltOptions): Tool[] {
  const { baseTools, provider, model, forwardMessage, gate } = options;
  // The belt runs through the ladder, as chat's does: `gateLegacyTools` is the door
  // a `Tool` takes into `decidePermission` (invariant I-1). A delegated loop
  // is handed the gated belt, not the raw one, so approving `run_subtask` is
  // not approval for whatever the child then calls.
  const gatedBase = gateLegacyTools(baseTools, gate);
  const subAgent = {
    provider,
    model,
    parentTools: () => gatedBase,
    forwardMessage,
    background: new BackgroundSubtaskRegistry(),
    ...(options.budget !== undefined && { budget: options.budget })
  };
  const delegationRuns = new WeakMap<
    ProcessingContext,
    ReturnType<typeof createCapabilityRun>
  >();
  const delegationRun = (context: ProcessingContext) => {
    const cached = delegationRuns.get(context);
    if (cached) {
      return cached;
    }
    const run = createCapabilityRun({
      context,
      gate,
      availableSecrets: contextSecretAvailability(context),
      subAgent,
      ...(options.budget !== undefined && { budget: options.budget })
    });
    delegationRuns.set(context, run);
    return run;
  };

  // Delegation and planning retain their read category. The child executes
  // mutations through gatedBase under the same permission policy.
  const spawned: Tool[] = [];
  if (options.readOnlySearch !== false) {
    spawned.push(toolForCapabilityName("run_search", delegationRun));
  }
  spawned.push(
    toolForCapabilityName("run_subtask", delegationRun),
    toolForCapabilityName("start_subtask", delegationRun),
    toolForCapabilityName("wait_subtasks", delegationRun)
  );
  if (options.planning) {
    spawned.push(toolForCapabilityName("create_plan", delegationRun));
    // `execute_plan` is the exception, and is gated for what it is: not one
    // action but every action in the plan. In plan mode the ladder answers
    // `blocked_in_plan_mode`, which tells the model to have the user switch
    // out; elsewhere it asks once.
    spawned.push(toolForCapabilityName("execute_plan", delegationRun));
  }
  return gateLegacyTools([...spawned, ...baseTools], gate);
}

/**
 * Put `systemPrompt` at the head of the history, replacing the previous
 * turn's — the catalog is rebuilt per turn and only the current one is true.
 */
export function applySystemPrompt(
  messages: Message[],
  systemPrompt: string
): void {
  if (messages.length > 0 && messages[0].role === "system") {
    messages[0] = { ...messages[0], content: systemPrompt };
    return;
  }
  messages.unshift({ role: "system", content: systemPrompt });
}
