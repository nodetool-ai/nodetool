/**
 * A chat turn's provider tool list is `execute_code`, `todo_write`,
 * `view_image` and one plan tool. Every other tool that used to be offered top
 * level (`DIRECT_TOOL_NAMES`) must still be callable from inside an action:
 * through its import line, and through `nodetool.*` where the object model
 * wraps it. These run real actions in the QuickJS sandbox against a fake
 * router and check which tool each call reached.
 */
import { describe, it, expect } from "vitest";
import { DIRECT_TOOL_NAMES, type ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { chatDirectToolNames, toolImportLine } from "../src/codeact/tool-api.js";
import { createMockContext } from "./_helpers/mock-context.js";

const REMOVED = [...DIRECT_TOOL_NAMES].filter(
  (name) => !chatDirectToolNames("default").has(name)
);

/** The `nodetool.*` call that reaches each removed tool that has one. */
const OBJECT_MODEL_CALLS: Record<string, string> = {
  list_providers: "nodetool.models.providers()",
  find_model: 'nodetool.models.find("text_to_image")',
  list_models: "nodetool.models.list()",
  list_provider_models: 'nodetool.models.forProvider("openai")',
  search_nodes: 'nodetool.nodes.search("image")',
  get_node_info: 'nodetool.nodes.info("nodetool.image.Resize")',
  list_nodes: "nodetool.nodes.list()",
  run_subtask: 'nodetool.agents.run("Summarize the brief.")',
  web_search: 'nodetool.web.search("fox")',
  http_request: 'nodetool.web.fetch("https://example.com")',
  browser: 'nodetool.web.browse("https://example.com")',
  download_file: 'nodetool.web.download("https://example.com/a.png", "a.png")'
};

function session() {
  const calls: ChatCodeActToolCall[] = [];
  const tools = [...DIRECT_TOOL_NAMES].map((name) => ({
    name,
    description: `The ${name} tool.`,
    inputSchema: { type: "object", properties: {} }
  }));
  const chat = createChatCodeActSession({
    tools,
    directToolNames: [...chatDirectToolNames("default")].filter((name) =>
      DIRECT_TOOL_NAMES.has(name)
    ),
    executeTool: async (call) => {
      calls.push(call);
      return JSON.stringify({ ok: true, tool: call.name });
    },
    context: createMockContext() as unknown as ProcessingContext
  });
  return { chat, calls };
}

async function run(chat: ReturnType<typeof session>["chat"], code: string) {
  return JSON.parse(await chat.executeAction({ code, title: "Probe" })) as {
    ok: boolean;
    error?: string;
  };
}

describe("chat direct tools", () => {
  it("offers todo_write and one plan tool, chosen by permission mode alone", () => {
    expect([...chatDirectToolNames("default")]).toEqual(["todo_write", "execute_plan"]);
    expect([...chatDirectToolNames("auto")]).toEqual(["todo_write", "execute_plan"]);
    expect([...chatDirectToolNames("plan")]).toEqual(["todo_write", "create_plan"]);
  });

  it("removes every former direct tool except todo_write", () => {
    expect(REMOVED).not.toContain("todo_write");
    expect(REMOVED.length).toBe(DIRECT_TOOL_NAMES.size - 1);
  });

  it.each(REMOVED)("reaches %s through its import line", async (name) => {
    const line = toolImportLine(name);
    expect(line).toBeDefined();
    const { chat, calls } = session();
    const obs = await run(chat, `${line}\nreturn await ${name}({});`);
    expect(obs.ok, obs.error).toBe(true);
    expect(calls.map((c) => c.name)).toEqual([name]);
  });

  it.each(Object.entries(OBJECT_MODEL_CALLS))(
    "reaches %s through %s",
    async (name, expression) => {
      expect(REMOVED).toContain(name);
      const { chat, calls } = session();
      const obs = await run(chat, `return await ${expression};`);
      expect(obs.ok, obs.error).toBe(true);
      expect(calls.map((c) => c.name)).toContain(name);
    }
  );
});
