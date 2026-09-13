import { describe, expect, it } from "vitest";
import type { ChatSource } from "@nodetool-ai/protocol";

import { buildChatAgentSystemPrompt } from "../src/websocket-client-session.js";

describe("buildChatAgentSystemPrompt — the workflow the turn is bound to", () => {
  const sources = [
    "workspace_chat", "workflow_canvas", "sketch_assistant",
    "timeline_assistant", "storyboard_assistant", "script_assistant",
    "jsscript_assistant", "app_builder", "code_assistant", "text_editor",
    "model3d_assistant"
  ] as const satisfies readonly ChatSource[];

  it.each(sources)("keeps product knowledge with surface guidance (%s)", (source) => {
    for (const mode of ["default", "auto", "plan"] as const) {
      const prompt = buildChatAgentSystemPrompt(mode, "Help edit this document.", { source });
      expect(prompt.match(/# NodeTool product knowledge/g)).toHaveLength(1);
      expect(prompt).toContain("A project groups related work");
      expect(prompt).toContain("A workflow is a saved, repeatable graph");
      expect(prompt).toContain("characters, locations, styles, and props");
      expect(prompt).toContain("Help edit this document.");
      expect(prompt).not.toContain("Chat has no way to create");
    }
  });

  it("names the bound workflow when the client sends no ui_context", () => {
    const prompt = buildChatAgentSystemPrompt("default", null, null, "wf-42");
    expect(prompt).toContain("wf-42");
    expect(prompt).toContain("`ui_*`");
  });

  it("says nothing extra when no workflow is bound", () => {
    const prompt = buildChatAgentSystemPrompt("default", null, null, null);
    expect(prompt).not.toContain("The user has workflow");
  });

  it("leaves the ui_context block alone when it already names the workflow", () => {
    const uiContext = {
      focused: { type: "workflow" as const, id: "wf-42", title: "My Graph" },
      open: [{ type: "workflow" as const, id: "wf-42", title: "My Graph" }],
      selection: null
    };
    const prompt = buildChatAgentSystemPrompt(
      "default",
      null,
      uiContext,
      "wf-42"
    );
    expect(prompt).toContain('workflow "My Graph" (id: wf-42)');
    expect(prompt).not.toContain("The user has workflow");
    // One "what the user is looking at" section, not two.
    expect(prompt.match(/## What the user is looking at/g)).toHaveLength(1);
  });

  it("names the chat surface that sent the turn", () => {
    const prompt = buildChatAgentSystemPrompt(
      "default",
      null,
      {
        focused: { type: "sketch", id: "sk-1", title: "Fox" },
        open: [{ type: "sketch", id: "sk-1", title: "Fox" }],
        selection: { layer_ids: ["layer-2"] },
        source: "sketch_assistant"
      },
      null
    );
    expect(prompt).toContain(
      "The user sent this message from the sketch editor assistant."
    );
    expect(prompt).toContain('image document "Fox" (id: sk-1)');
    expect(prompt).toContain("layer: layer-2");
  });

  it("still names a source when no document is open", () => {
    const prompt = buildChatAgentSystemPrompt(
      "default",
      null,
      { source: "model3d_assistant" },
      null
    );
    expect(prompt).toContain(
      "The user sent this message from the 3D editor assistant."
    );
    expect(prompt).toContain("## What the user is looking at");
  });

  it("still names a bound workflow that the ui_context does not list", () => {
    const uiContext = {
      focused: { type: "timeline" as const, id: "tl-1", title: "Cut" },
      open: [{ type: "timeline" as const, id: "tl-1", title: "Cut" }],
      selection: null
    };
    const prompt = buildChatAgentSystemPrompt(
      "default",
      null,
      uiContext,
      "wf-42"
    );
    expect(prompt).toContain("The user has workflow `wf-42` open");
    // Folded into the existing section, not a second heading.
    expect(prompt.match(/## What the user is looking at/g)).toHaveLength(1);
  });
});
