import { describe, it, expect } from "vitest";
import { RESOURCE_KINDS } from "@nodetool-ai/protocol";
import {
  RESIDENT_TOOL_NAMES,
  CHAT_AGENT_SYSTEM_PROMPT
} from "../src/unified-websocket-runner.js";

describe("resident toolbelt", () => {
  it("keeps the whole build-and-verify loop resident", () => {
    for (const name of [
      "plan_workflow_graph",
      "validate_workflow",
      "create_workflow",
      "debug_workflow",
      "debug_app"
    ]) {
      expect(RESIDENT_TOOL_NAMES.has(name)).toBe(true);
    }
  });

  it("keeps opening a document resident, so a closed document is never a dead end", () => {
    expect(RESIDENT_TOOL_NAMES.has("ui_open_document")).toBe(true);
  });

  it("teaches debug_app in the chat system prompt", () => {
    expect(CHAT_AGENT_SYSTEM_PROMPT).toContain("debug_app");
    // The draft, not the saved row, is what the App Builder must grade.
    expect(CHAT_AGENT_SYSTEM_PROMPT).toContain("document");
  });

  it("describes every resource kind, not just workflows", () => {
    const section = CHAT_AGENT_SYSTEM_PROMPT.split("# NodeTool resources")[1];
    expect(section).toBeDefined();
    for (const kind of RESOURCE_KINDS) {
      expect(section).toContain(`**${kind}**`);
    }
  });
});
