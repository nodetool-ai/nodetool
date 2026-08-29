/**
 * `nodetool.web`, `nodetool.memory` and `nodetool.email` —
 * real QuickJS sandbox, fake chat tool router. No network, no model.
 */
import { describe, it, expect } from "vitest";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  createChatCodeActSession,
  type ChatCodeActToolCall
} from "../src/codeact/chat-codeact.js";
import { buildNodetoolApiPromptSection } from "../src/codeact/nodetool-api.js";
import { createMockContext } from "./_helpers/mock-context.js";

const toolDef = (name: string) => ({
  name,
  description: `Tool ${name}.`,
  inputSchema: { type: "object", properties: {} }
});

const WEB_TOOLS = [
  "web_search",
  "image_search",
  "http_request",
  "download_file",
  "browser",
  "take_screenshot"
].map(toolDef);

const MEMORY_TOOLS = [
  "memory_save",
  "memory_list",
  "memory_update",
  "memory_delete"
].map(toolDef);

const EMAIL_TOOLS = ["search_email", "archive_email", "add_label_to_email"].map(
  toolDef
);

/** Echoes the tool name and args back so the wrapper's mapping is observable. */
function createEchoRouter() {
  const calls: ChatCodeActToolCall[] = [];
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    return JSON.stringify({ tool: call.name, args: call.args });
  };
  return { executeTool, calls };
}

function makeSession(
  tools: Array<{ name: string; description: string; inputSchema: unknown }>,
  executeTool: (call: ChatCodeActToolCall) => Promise<unknown>
) {
  return createChatCodeActSession({
    tools,
    executeTool,
    context: createMockContext() as unknown as ProcessingContext
  });
}

async function runAction(
  session: ReturnType<typeof createChatCodeActSession>,
  code: string
) {
  const observation = await session.executeAction({ code });
  return JSON.parse(observation) as {
    ok: boolean;
    result?: unknown;
    error?: string;
    toolCalls: number;
  };
}

describe("nodetool.web", () => {
  it("routes search to web_search by default and passes options through", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(WEB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const r = await nodetool.web.search("quickjs sandbox", {
         allowed_domains: ["bellard.org"]
       });
       return r.tool;`
    );
    expect(obs.ok).toBe(true);
    expect(obs.result).toBe("web_search");
    expect(calls[0].args).toEqual({
      query: "quickjs sandbox",
      allowed_domains: ["bellard.org"]
    });
  });

  it("maps provider onto the tool's backend pin (old guest names included)", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(WEB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.web.search("fox", { provider: "dataforseo", num_results: 3 });
       await nodetool.web.search("fox", { provider: "google" });
       await nodetool.web.search("fox", { provider: "openai" });
       await nodetool.web.news("fox", { provider: "google" });
       await nodetool.web.images("fox", { provider: "dataforseo" });
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "web_search",
      args: { query: "fox", backend: "dataforseo", num_results: 3 }
    });
    // `provider` becomes the backend pin; it is never forwarded as-is.
    expect(calls[0].args).not.toHaveProperty("provider");
    expect(calls[1]).toMatchObject({
      name: "web_search",
      args: { query: "fox", backend: "gemini" }
    });
    expect(calls[2]).toMatchObject({
      name: "web_search",
      args: { query: "fox", backend: "openai" }
    });
    expect(calls[3]).toMatchObject({
      name: "web_search",
      args: { query: "fox", backend: "serpapi", search_type: "news" }
    });
    expect(calls[4]).toMatchObject({
      name: "image_search",
      args: { query: "fox", backend: "dataforseo" }
    });
    expect(calls[4].args).not.toHaveProperty("search_type");
  });

  it("throws naming the missing tool when the belt cannot serve the method", async () => {
    const { executeTool } = createEchoRouter();
    const session = makeSession(["http_request"].map(toolDef), executeTool);
    const obs = await runAction(session, `await nodetool.web.search("fox");`);
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain("web_search");
  });

  it("maps images, fetch, browse, download and screenshot onto their tools", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(WEB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.web.images("red fox", { num_results: 4 });
       await nodetool.web.fetch("https://example.com/api", {
         method: "POST",
         body: "{}"
       });
       await nodetool.web.browse("https://example.com");
       await nodetool.web.download("https://example.com/a.png", "a.png");
       await nodetool.web.screenshot("https://example.com");
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "image_search",
      args: { query: "red fox", num_results: 4 }
    });
    expect(calls[1]).toMatchObject({
      name: "http_request",
      args: { url: "https://example.com/api", method: "POST", body: "{}" }
    });
    expect(calls[2]).toMatchObject({
      name: "browser",
      args: { url: "https://example.com" }
    });
    expect(calls[3]).toMatchObject({
      name: "download_file",
      args: { url: "https://example.com/a.png", output_file: "a.png" }
    });
    expect(calls[4]).toMatchObject({
      name: "take_screenshot",
      args: { url: "https://example.com", output_file: "screenshot.png" }
    });
  });
});

describe("nodetool.memory", () => {
  it("maps save/list/update/remove onto the memory_* tools", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(MEMORY_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.memory.save("The palette is teal/orange.", {
         title: "Palette",
         resources: [{ type: "asset", id: "a1" }]
       });
       await nodetool.memory.list({ limit: 20 });
       await nodetool.memory.update("m1", { content: "Updated." });
       await nodetool.memory.remove("m1");
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "memory_save",
      args: {
        content: "The palette is teal/orange.",
        title: "Palette",
        resources: [{ type: "asset", id: "a1" }]
      }
    });
    expect(calls[1]).toMatchObject({
      name: "memory_list",
      args: { limit: 20 }
    });
    expect(calls[2]).toMatchObject({
      name: "memory_update",
      args: { memory_id: "m1", content: "Updated." }
    });
    expect(calls[3]).toMatchObject({
      name: "memory_delete",
      args: { memory_id: "m1" }
    });
  });
});

describe("nodetool.email", () => {
  it("maps search/archive/label, accepting one id or many for archive", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(EMAIL_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.email.search({ subject: "invoice", max_results: 5 });
       await nodetool.email.archive("m1");
       await nodetool.email.archive(["m2", "m3"]);
       await nodetool.email.label("m1", "Receipts");
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "search_email",
      args: { subject: "invoice", max_results: 5 }
    });
    expect(calls[1].args["message_ids"]).toEqual(["m1"]);
    expect(calls[2].args["message_ids"]).toEqual(["m2", "m3"]);
    expect(calls[3]).toMatchObject({
      name: "add_label_to_email",
      args: { message_id: "m1", label: "Receipts" }
    });
  });
});

describe("the prompt section", () => {
  it("documents the new namespaces only when the belt can serve them", () => {
    const withWeb = buildNodetoolApiPromptSection(["web_search"]);
    expect(withWeb).toContain("`nodetool.web`");
    expect(withWeb).not.toContain("`nodetool.memory`");
    expect(withWeb).not.toContain("`nodetool.email`");

    const withRest = buildNodetoolApiPromptSection([
      "memory_save",
      "search_email"
    ]);
    expect(withRest).toContain("`nodetool.memory`");
    expect(withRest).toContain("`nodetool.email`");
    expect(withRest).not.toContain("`nodetool.web`");
  });
});
