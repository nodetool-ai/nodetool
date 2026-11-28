import { describe, expect, it } from "vitest";
import {
  CLAUDE_CODE_SESSION_PROVIDER,
  isClaudeCodeSession,
  sessionDefaultProvider
} from "../src/claude-code-session.js";

describe("sessionDefaultProvider", () => {
  it("picks claude_agent_sdk when Claude Code started the process", () => {
    expect(isClaudeCodeSession({ CLAUDECODE: "1" })).toBe(true);
    expect(sessionDefaultProvider({ CLAUDECODE: "1" })).toBe(CLAUDE_CODE_SESSION_PROVIDER);
    expect(CLAUDE_CODE_SESSION_PROVIDER).toBe("claude_agent_sdk");
  });

  it("leaves the command's own default outside Claude Code", () => {
    expect(sessionDefaultProvider({})).toBeUndefined();
    expect(sessionDefaultProvider({ CLAUDECODE: "0" })).toBeUndefined();
    expect(sessionDefaultProvider({ CLAUDECODE: "" })).toBeUndefined();
    // Other CLAUDE_CODE_* variables alone do not mean a Claude Code parent.
    expect(sessionDefaultProvider({ CLAUDE_CODE_ENTRYPOINT: "cli" })).toBeUndefined();
  });
});
