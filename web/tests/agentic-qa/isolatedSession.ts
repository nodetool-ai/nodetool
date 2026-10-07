/**
 * Claude Agent SDK options for a session that must know nothing about this
 * repository, this machine's Claude setup, or the account that runs it.
 *
 * Shared by the participant runner and the context probe, so the probe tests
 * the exact boundary participants run behind.
 *
 * The CLI adds the logged-in account's email address to every session's
 * context. It reads that address from the account record in the Claude config
 * directory. When `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`) or
 * `ANTHROPIC_API_KEY` is set, the session runs with an empty config directory,
 * which removes the address. Otherwise it runs on the shared login and reports
 * `accountContext: "account-email-visible"`.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Options } from "@anthropic-ai/claude-agent-sdk";

export const BUILTIN_TOOLS = [
  "Agent",
  "Bash",
  "BashOutput",
  "Edit",
  "Glob",
  "Grep",
  "KillShell",
  "MultiEdit",
  "NotebookEdit",
  "Read",
  "Skill",
  "Task",
  "TodoWrite",
  "ToolSearch",
  "WebFetch",
  "WebSearch",
  "Write"
];

/** Env vars a nested Claude session leaks into its child CLI process. */
const NESTED_SESSION_ENV =
  /^(CLAUDECODE|CLAUDE_(CODE|SESSION|ENABLE|AFTER|AUTO)_[A-Za-z0-9_]*)$/;

export type AccountContext = "isolated" | "account-email-visible";

export interface IsolatedSession {
  options: Options;
  accountContext: AccountContext;
  /** An empty directory with no instructions, memory, or git repository. */
  cwd: string;
}

export async function isolatedSessionOptions(
  overrides: Pick<Options, "systemPrompt" | "model" | "maxTurns"> &
    Partial<Pick<Options, "mcpServers" | "allowedTools" | "abortController">>
): Promise<IsolatedSession> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) {
      continue;
    }
    // CLAUDE_CODE_OAUTH_TOKEN matches the nested-session pattern but is the
    // credential an isolated config directory needs.
    if (NESTED_SESSION_ENV.test(key) && key !== "CLAUDE_CODE_OAUTH_TOKEN") {
      continue;
    }
    env[key] = value;
  }
  env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";

  let accountContext: AccountContext = "account-email-visible";
  if (env.CLAUDE_CODE_OAUTH_TOKEN || env.ANTHROPIC_API_KEY) {
    env.CLAUDE_CONFIG_DIR = await mkdtemp(join(tmpdir(), "agentic-qa-config-"));
    accountContext = "isolated";
  }

  const cwd = await mkdtemp(join(tmpdir(), "agentic-qa-participant-"));
  return {
    accountContext,
    cwd,
    options: {
      ...overrides,
      cwd,
      settingSources: [],
      settings: { autoMemoryEnabled: false },
      tools: [],
      allowedTools: overrides.allowedTools ?? [],
      disallowedTools: BUILTIN_TOOLS,
      strictMcpConfig: true,
      skills: [],
      permissionMode: "dontAsk",
      persistSession: false,
      env
    }
  };
}
