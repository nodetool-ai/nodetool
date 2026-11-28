import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findClaudeCli } from "../src/lean/providerStatus.js";

const directories: string[] = [];
function executable(name: string): string {
  const directory = mkdtempSync(join(tmpdir(), "nodetool-claude-status-"));
  directories.push(directory);
  const file = join(directory, name);
  writeFileSync(file, "#!/bin/sh\n");
  chmodSync(file, 0o755);
  return file;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const claudeName = process.platform === "win32" ? "claude.exe" : "claude";

describe("findClaudeCli", () => {
  it("finds the binary of the Claude Code session that started the process", () => {
    const parent = executable(claudeName);
    expect(findClaudeCli({ PATH: "", CLAUDE_CODE_EXECPATH: parent })).toBe(parent);
  });
  it("ignores an exec path that is not the claude binary", () => {
    const node = executable(process.platform === "win32" ? "node.exe" : "node");
    expect(findClaudeCli({ PATH: "", CLAUDE_CODE_EXECPATH: node })).toBeNull();
  });
  it("keeps CLAUDE_CLI_PATH ahead of the session's binary", () => {
    const pinned = executable(claudeName);
    const parent = executable(claudeName);
    expect(findClaudeCli({ PATH: "", CLAUDE_CLI_PATH: pinned, CLAUDE_CODE_EXECPATH: parent })).toBe(pinned);
  });
});
