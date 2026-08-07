/**
 * `nodetool.web`, `nodetool.memory`, `nodetool.email` and `nodetool.style` —
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
  "openai_web_search",
  "google_grounded_search",
  "google_news",
  "google_images",
  "dataforseo_search",
  "dataforseo_news",
  "dataforseo_images",
  "http_request",
  "download_file",
  "browser",
  "take_screenshot"
].map(toolDef);

const MEMORY_TOOLS = [
  "thread_memory_save",
  "thread_memory_list",
  "thread_memory_update",
  "thread_memory_delete"
].map(toolDef);

const EMAIL_TOOLS = ["search_email", "archive_email", "add_label_to_email"].map(
  toolDef
);

const STYLE_TOOLS = ["get_style_profile", "record_style_preference"].map(
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

  it("pins a named provider and maps onto that tool's query field", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(WEB_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.web.search("fox", { provider: "dataforseo", num_results: 3 });
       await nodetool.web.search("fox", { provider: "google" });
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "dataforseo_search",
      args: { keyword: "fox", num_results: 3 }
    });
    // `provider` selects the backend; it is never forwarded as an argument.
    expect(calls[0].args).not.toHaveProperty("provider");
    expect(calls[1]).toMatchObject({
      name: "google_grounded_search",
      args: { query: "fox" }
    });
  });

  it("falls back to the next available provider when the preferred one is absent", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(
      ["dataforseo_search", "dataforseo_news"].map(toolDef),
      executeTool
    );
    const obs = await runAction(
      session,
      `await nodetool.web.search("fox");
       await nodetool.web.news("fox");
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls.map((c) => c.name)).toEqual([
      "dataforseo_search",
      "dataforseo_news"
    ]);
  });

  it("throws naming the tools it tried when nothing can serve the method", async () => {
    const { executeTool } = createEchoRouter();
    const session = makeSession(["http_request"].map(toolDef), executeTool);
    const obs = await runAction(session, `await nodetool.web.search("fox");`);
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain("nodetool.web.search");
    expect(obs.error).toContain("web_search");
  });

  it("throws when a pinned provider is not on the belt", async () => {
    const { executeTool } = createEchoRouter();
    const session = makeSession(["web_search"].map(toolDef), executeTool);
    const obs = await runAction(
      session,
      `await nodetool.web.search("fox", { provider: "openai" });`
    );
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain('provider "openai"');
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
      name: "google_images",
      args: { keyword: "red fox", num_results: 4 }
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
  it("maps save/list/update/remove onto the thread_memory_* tools", async () => {
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
      name: "thread_memory_save",
      args: {
        content: "The palette is teal/orange.",
        title: "Palette",
        resources: [{ type: "asset", id: "a1" }]
      }
    });
    expect(calls[1]).toMatchObject({
      name: "thread_memory_list",
      args: { limit: 20 }
    });
    expect(calls[2]).toMatchObject({
      name: "thread_memory_update",
      args: { memory_id: "m1", content: "Updated." }
    });
    expect(calls[3]).toMatchObject({
      name: "thread_memory_delete",
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

describe("nodetool.style", () => {
  it("maps profile/record onto the style tools", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(STYLE_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.style.profile({ query: "typography", k: 5 });
       await nodetool.style.record("Prefers muted palettes.", {
         rejected: "the vivid variant"
       });
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "get_style_profile",
      args: { query: "typography", k: 5 }
    });
    expect(calls[1]).toMatchObject({
      name: "record_style_preference",
      args: { takeaway: "Prefers muted palettes.", rejected: "the vivid variant" }
    });
  });
});

describe("nodetool.assets.images", () => {
  it("maps images(opts) onto list_images", async () => {
    const { executeTool, calls } = createEchoRouter();
    const session = makeSession(
      ["list_assets", "list_images"].map(toolDef),
      executeTool
    );
    const obs = await runAction(
      session,
      `await nodetool.assets.images({ query: "hero", limit: 10 });
       return true;`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "list_images",
      args: { query: "hero", limit: 10 }
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
      "thread_memory_save",
      "search_email",
      "get_style_profile"
    ]);
    expect(withRest).toContain("`nodetool.memory`");
    expect(withRest).toContain("`nodetool.email`");
    expect(withRest).toContain("`nodetool.style`");
    expect(withRest).not.toContain("`nodetool.web`");
  });
});
