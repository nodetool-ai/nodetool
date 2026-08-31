import { describe, it, expect } from "vitest";
import {
  normalizeToolCallName,
  unroutableToolMessage
} from "../src/websocket-client-session.js";

describe("normalizeToolCallName", () => {
  it("strips the `tools.` prefix the CodeAct prompt teaches", () => {
    // The prompt renders guest tools as `await tools.<name>({…})`; models turn
    // that member expression into a top-level tool name.
    expect(normalizeToolCallName("tools.ui_storyboard_set_screenplay")).toBe(
      "ui_storyboard_set_screenplay"
    );
  });

  it("leaves a plain tool name untouched", () => {
    expect(normalizeToolCallName("execute_code")).toBe("execute_code");
  });

  it("does not strip a name that merely contains `tools.`", () => {
    expect(normalizeToolCallName("list_tools.all")).toBe("list_tools.all");
  });
});

describe("unroutableToolMessage", () => {
  it("points an unknown tool at discovery, naming execute_code", () => {
    const msg = unroutableToolMessage("no_such_tool");
    expect(msg).toContain('Unknown tool "no_such_tool"');
    expect(msg).toContain("execute_code");
    expect(msg).toContain(
      'import { <name> } from "@nodetool-ai/sandbox-nodetool/<namespace>"'
    );
    expect(msg).toContain('nodetool.searchTools("no_such_tool")');
  });
});
