/**
 * CodeAct system prompt — the action contract, the tool catalog rendered as
 * typed signatures, and a condensed sandbox API reference derived from the
 * same manifest the Code-node prompt uses (so it cannot advertise an API the
 * sandbox does not marshal).
 */

import {
  getSandboxManifest,
  type SandboxManifest
} from "../code-gen/sandbox-manifest.js";
import { renderToolCatalog, type ToolSignatureSource } from "./tool-api.js";

const ACTION_CONTRACT_BASE = `# CodeAct Execution

You act by writing JavaScript. Each turn, call the \`execute_code\` tool with a
program; it runs in a sandbox and the observation (return value, console logs,
error) comes back as the tool result. Repair and continue based on what you
observe.

Rules:
- Chain related work into ONE action: call several tools, loop, branch, and
  post-process in the same program instead of one action per tool call.
- \`state\` is a plain object that persists across your actions in this step.
  Stash fetched data and intermediates there (\`state.rows = ...\`) and reuse
  them next turn — never re-fetch what you already have.
- Keep observations small. \`return\` a compact summary (counts, ids, the few
  fields you need); large payloads belong in \`state\`, the workspace, or agent
  memory — not in the transcript.
- A failed tool call throws; use try/catch when partial failure is acceptable.
- Top-level \`await\` and \`return\` work. There is no module loader: no
  \`import\`/\`require\`, and \`eval\`/\`Function\` are disabled.`;

const ACTION_CONTRACT_STEP = `${ACTION_CONTRACT_BASE}
- Do not ask the user questions. Choose a reasonable assumption and proceed.`;

const ACTION_CONTRACT_CHAT = `${ACTION_CONTRACT_BASE}
- When you need the user's decision, stop writing code and ask in a plain
  assistant message.`;

const CHAT_COMPLETION = `# Answering the user

This is a chat turn, not a step: there is no \`finish()\`. When the work is
done, reply to the user with a normal assistant message containing no tool
call — that message ends the turn.`;

const FINISH_SCHEMA = `# Completing the step

Call \`await finish(result)\` when the objective is met. The result is validated
against the output schema below; an invalid result throws with the violations
so you can correct it. The step ONLY completes through \`finish\`.`;

const FINISH_FREEFORM = `# Completing the step

Call \`await finish(result)\` when the objective is met, or — for a purely
textual answer — reply with a final assistant message containing no tool call.`;

/** Compact, manifest-derived sandbox reference: signatures only. */
function renderSandboxSummary(
  manifest: SandboxManifest,
  variant: "step" | "chat"
): string {
  const lines: string[] = [];
  for (const bridge of Object.values(manifest.bridges)) {
    if (bridge.internal || bridge.members.length === 0) continue;
    for (const member of bridge.members) {
      lines.push(`- ${member.signature}`);
    }
  }
  for (const helper of Object.values(manifest.guestHelpers)) {
    lines.push(`- ${helper.signature}`);
  }
  const besides =
    variant === "chat" ? "`tools.*`, `state`" : "`tools.*`, `state`, `finish`";
  return [
    `# Sandbox API (besides ${besides})`,
    lines.join("\n"),
    `Built-ins: ${manifest.nativeGlobals.join(", ")}.`,
    `Not available: ${manifest.blockedGlobals.join(", ")}.`,
    `Each action runs under the sandbox limits (execution timeout, memory, fetch count/size); split long work across actions and carry progress in \`state\`.`
  ].join("\n\n");
}

export interface CodeActPromptOptions {
  /** Tools documented in full (signature + description) in the prompt. */
  tools: ToolSignatureSource[];
  /**
   * Deferred long tail: callable like any other tool, but listed by name
   * only — the model pulls a signature in with `searchTools()` first.
   */
  deferredTools?: ToolSignatureSource[];
  /** Declared output schema (JSON schema) of the step, if any. */
  resultSchema?: Record<string, unknown> | null;
  /** Caller preamble — layered before the contract, never replacing it. */
  preamble?: string;
  manifest?: SandboxManifest;
  /**
   * `"step"` (default) is the agent-step contract: `finish()` completes the
   * step and user questions are forbidden. `"chat"` is the chat-turn
   * contract: no `finish()`, a plain assistant message answers the user, and
   * asking the user is allowed. Chat callers ignore `resultSchema`.
   */
  variant?: "step" | "chat";
  /** Extra sections appended after the tool catalog (e.g. the graph model). */
  extraSections?: string[];
}

export function buildCodeActSystemPrompt(
  options: CodeActPromptOptions
): string {
  const manifest = options.manifest ?? getSandboxManifest();
  const variant = options.variant ?? "step";
  const sections: string[] = [];
  if (options.preamble?.trim()) sections.push(options.preamble.trim());
  sections.push(
    variant === "chat" ? ACTION_CONTRACT_CHAT : ACTION_CONTRACT_STEP
  );
  if (variant === "chat") {
    sections.push(CHAT_COMPLETION);
  } else {
    sections.push(options.resultSchema ? FINISH_SCHEMA : FINISH_FREEFORM);
    if (options.resultSchema) {
      sections.push(
        `# Output schema\n\`\`\`json\n${JSON.stringify(options.resultSchema, null, 2)}\n\`\`\``
      );
    }
  }
  sections.push(`# Tools\n${renderToolCatalog(options.tools)}`);
  const deferred = options.deferredTools ?? [];
  if (deferred.length > 0) {
    sections.push(
      `# More tools (discover before calling)\n` +
        `These are also callable via \`tools.<name>()\`, but only their names ` +
        `are listed here. Call \`await searchTools("query")\` (or ` +
        `\`searchTools("select:name1,name2")\`) first — it returns each ` +
        `match's signature and description. Do not guess arguments for a ` +
        `tool you have not looked up.\n\n` +
        deferred.map((t) => t.name).join(", ")
    );
  }
  for (const section of options.extraSections ?? []) {
    if (section.trim()) sections.push(section.trim());
  }
  sections.push(renderSandboxSummary(manifest, variant));
  return sections.join("\n\n");
}
