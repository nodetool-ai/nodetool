/**
 * `run_agent` — an agent loop a script can start.
 *
 * A script reached a model only through `generate_text`: one round trip, no
 * tools. Work that has to look something up, act and check the result needed a
 * loop, and the script had no way to start one, because the delegation
 * capabilities (`run_subtask` and the rest) need the sub-agent runtime of a
 * parent agent, and a script has no parent agent.
 *
 * This loop needs no parent. The caller names the provider, the model and the
 * capabilities the agent may call. Each tool call goes through `run.invoke`, so
 * it meets the run's own permission gate, and the loop spends the run's budget
 * when the host set one. Every text chunk and tool call is reported on the
 * run's context (see `agent-activity.ts`), so a mini app shows the agent's
 * work while it happens.
 */

import { randomUUID } from "node:crypto";
import type {
  Message,
  MessageContent,
  ProviderTool
} from "@nodetool-ai/runtime";
import { budgetFromContext, isChunk, isProviderStop } from "@nodetool-ai/runtime";
import { agentActivityReporter } from "./agent-activity.js";
import { capabilityProviderTool } from "./invoke.js";
import { capabilitySpec } from "./metadata.js";
import { agentsSpecs } from "./agents.specs.js";
import type { CapabilityImpl } from "./types.js";
import { truncateToolResult } from "../constants.js";
import {
  isNonEmptyString,
  isRecord,
  isString
} from "../utils/type-guards.js";

const DEFAULT_MAX_TURNS = 12;
const MAX_TURNS = 40;
const SUBMIT_TOOL = "submit_result";

const AGENT_CONTRACT =
  "You are an agent working inside a NodeTool run. Work on the task with the " +
  "tools you have. Read every tool result before your next step, and correct " +
  "a call that failed. Do not invent tool results or resource ids.";

/**
 * Capabilities an agent of this loop may not call: the delegation family needs
 * a parent agent's runtime, which this loop does not have.
 */
const REFUSED_TOOLS = new Set(agentsSpecs.map((spec) => spec.name));

const modelOf = (
  value: unknown
): { provider: string; model: string } | null => {
  if (!isRecord(value) || !isNonEmptyString(value.provider)) return null;
  // A model selector value carries `id`, a find_model hit `model_id`.
  const model = [value.id, value.model_id, value.model].find(isNonEmptyString);
  return model === undefined ? null : { provider: value.provider, model };
};

const imagePart = (uri: string): MessageContent => ({
  type: "image_url",
  image: { uri }
});

export const runAgentImpl: CapabilityImpl = async (run, args) => {
  const prompt = args["prompt"];
  if (!isNonEmptyString(prompt)) return { error: "prompt is required" };
  const model = modelOf(args["model"]);
  if (!model) {
    return {
      error:
        "model must be {provider, id} or {provider, model} with non-empty strings"
    };
  }
  const toolNames = args["tools"] ?? [];
  if (!Array.isArray(toolNames) || !toolNames.every(isNonEmptyString)) {
    return { error: "tools must be a list of capability names" };
  }
  const refused = toolNames.filter((name) => REFUSED_TOOLS.has(name));
  if (refused.length > 0) {
    return {
      error: `run_agent cannot give its agent ${refused.join(", ")}: delegation needs a parent agent.`
    };
  }
  const specs = toolNames.map((name) => ({ name, spec: capabilitySpec(name) }));
  const unknown = specs.filter((entry) => !entry.spec).map((entry) => entry.name);
  if (unknown.length > 0) {
    return { error: `Unknown capabilities: ${unknown.join(", ")}` };
  }
  const images = args["images"] ?? [];
  if (!Array.isArray(images) || !images.every(isNonEmptyString)) {
    return { error: "images must be a list of image references" };
  }
  const outputSchema = args["output_schema"];
  if (outputSchema !== undefined && !isRecord(outputSchema)) {
    return { error: "output_schema must be a JSON schema object" };
  }
  const turnsArg = Number(args["max_turns"]);
  const maxTurns = Number.isFinite(turnsArg)
    ? Math.max(1, Math.min(MAX_TURNS, Math.floor(turnsArg)))
    : DEFAULT_MAX_TURNS;
  const label = isNonEmptyString(args["label"]) ? args["label"].trim() : "agent";

  const context = run.context;
  const signal = run.signal ?? context.signal;
  const reporter = agentActivityReporter(context, label);
  const provider = await context.getProvider(model.provider);
  const initialCost = provider.getTotalCost();

  let submitted: Record<string, unknown> | null = null;
  const toolCalls: Array<{ name: string; ok: boolean }> = [];
  const tools: ProviderTool[] = specs.map(({ name, spec }) => ({
    ...capabilityProviderTool(spec!),
    execute: async (toolArgs, toolCallId) => {
      const call = { id: toolCallId ?? randomUUID(), name };
      let result: unknown;
      let failed: boolean;
      try {
        result = await run.invoke(name, toolArgs);
        failed = isRecord(result) && isNonEmptyString(result.error);
      } catch (error) {
        result = { error: error instanceof Error ? error.message : String(error) };
        failed = true;
      }
      toolCalls.push({ name, ok: !failed });
      reporter.toolResult(call, result, failed);
      return truncateToolResult(
        isString(result) ? result : JSON.stringify(result) ?? "null"
      );
    }
  }));
  if (outputSchema) {
    tools.push({
      name: SUBMIT_TOOL,
      description:
        "Submit the final result. Call this exactly once, when the task is done.",
      inputSchema: outputSchema,
      terminal: true,
      execute: async (values) => {
        submitted = values;
        return JSON.stringify({ status: "submitted" });
      }
    });
  }

  const system = isNonEmptyString(args["system"])
    ? `${args["system"]}\n\n${AGENT_CONTRACT}`
    : AGENT_CONTRACT;
  const finish = outputSchema
    ? `\n\nWhen the task is done, call ${SUBMIT_TOOL} with the result.`
    : "";
  const content: MessageContent[] = [
    ...images.map(imagePart),
    { type: "text", text: prompt }
  ];
  // asset:// images become data the provider can read.
  const messages: Message[] = await context.resolveMessageMediaUris([
    { role: "system", content: `${system}${finish}` },
    { role: "user", content }
  ]);

  let text = "";
  let lastTurnText = "";
  for await (const item of provider.generateLoop({
    messages,
    model: model.model,
    tools,
    maxIterations: maxTurns,
    sequentialTools: true,
    signal,
    turnBudget: run.budget ?? budgetFromContext(context)
  })) {
    signal?.throwIfAborted();
    if (isProviderStop(item)) {
      return {
        error: `The agent stopped before it finished: ${item.reason}`,
        tool_calls: toolCalls
      };
    }
    reporter.event(item);
    if (isChunk(item) && !item.thinking && item.content_type !== "audio") {
      lastTurnText += item.content;
    } else if (lastTurnText.trim()) {
      // A tool call or message event closes the turn the text belonged to;
      // the final message is the last turn that said something.
      text = lastTurnText.trim();
      lastTurnText = "";
    }
  }
  if (lastTurnText.trim()) text = lastTurnText.trim();
  if (outputSchema && submitted === null) {
    return {
      error: `The agent ended without calling ${SUBMIT_TOOL}.`,
      text,
      tool_calls: toolCalls
    };
  }
  return {
    text,
    ...(submitted !== null && { result: submitted }),
    tool_calls: toolCalls,
    cost_usd: Math.max(0, provider.getTotalCost() - initialCost)
  };
};
