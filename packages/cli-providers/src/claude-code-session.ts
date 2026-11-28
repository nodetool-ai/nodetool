/**
 * Provider default for a command line started from inside Claude Code.
 *
 * Claude Code sets `CLAUDECODE=1` for every command it runs. In that case the
 * command line uses the `claude_agent_sdk` provider when the caller names no
 * provider: it runs the same `claude` binary headless, which signs in with the
 * session's own login, so no API key is needed.
 */

/** The provider a Claude Code session defaults to. */
export const CLAUDE_CODE_SESSION_PROVIDER = "claude_agent_sdk";

/** Whether this process was started by a Claude Code session. */
export function isClaudeCodeSession(
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return env["CLAUDECODE"] === "1";
}

/**
 * The provider to use when the caller names none: `claude_agent_sdk` inside
 * Claude Code, else undefined so the command's own default applies.
 */
export function sessionDefaultProvider(
  env: Readonly<Record<string, string | undefined>> = process.env
): string | undefined {
  return isClaudeCodeSession(env) ? CLAUDE_CODE_SESSION_PROVIDER : undefined;
}
