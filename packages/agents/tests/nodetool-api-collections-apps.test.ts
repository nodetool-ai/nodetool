/**
 * `nodetool.collections` (vector RAG) and `nodetool.apps` (mini-app build /
 * debug) — code actions run in the real QuickJS sandbox against a fake chat
 * tool router. No network, no model.
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

const COLLECTION_TOOLS = [
  "list_collections",
  "query_collection",
  "vector_index",
  "vector_batch_index",
  "vector_text_search",
  "vector_hybrid_search"
].map(toolDef);

const APP_TOOLS = ["debug_app"].map(toolDef);

function createFakeRouter() {
  const calls: ChatCodeActToolCall[] = [];
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> => {
    calls.push(call);
    switch (call.name) {
      case "list_collections":
        return JSON.stringify({ collections: [{ name: "docs", count: 2 }] });
      case "query_collection":
        return JSON.stringify({ matches: [] });
      case "vector_index":
        return JSON.stringify({ status: "success", document_id: "doc-1" });
      case "vector_batch_index":
        return JSON.stringify({ status: "success", indexed_count: 2 });
      case "vector_text_search":
        return JSON.stringify({ "doc-1": "a chunk about foxes" });
      case "vector_hybrid_search":
        return JSON.stringify({ "doc-2": "a hybrid hit" });
      case "debug_app":
        return JSON.stringify({ verdict: { ok: true }, widgets: [] });
      default:
        return JSON.stringify({ error: `Unknown tool ${call.name}` });
    }
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

describe("nodetool.collections", () => {
  it("indexes a chunk with the vector_index field names", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(COLLECTION_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `return await nodetool.collections.index("a chunk", "src-1", {
         metadata: { page: 3 }
       });`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "vector_index",
      args: { text: "a chunk", source_id: "src-1", metadata: { page: 3 } }
    });
  });

  it("batch-indexes chunks and passes base_metadata through", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(COLLECTION_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `return await nodetool.collections.indexBatch(
         [{ text: "a", source_id: "s1" }, { text: "b", source_id: "s2" }],
         { base_metadata: { doc: "notes" } }
       );`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "vector_batch_index",
      args: {
        chunks: [
          { text: "a", source_id: "s1" },
          { text: "b", source_id: "s2" }
        ],
        base_metadata: { doc: "notes" }
      }
    });
  });

  it("searches semantically and hybridly with the schema's field names", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(COLLECTION_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `const semantic = await nodetool.collections.search("foxes", {
         n_results: 3
       });
       const hybrid = await nodetool.collections.hybridSearch("foxes", {
         n_results: 2,
         k_constant: 40
       });
       return { semantic: semantic, hybrid: hybrid };`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "vector_text_search",
      args: { text: "foxes", n_results: 3 }
    });
    expect(calls[1]).toMatchObject({
      name: "vector_hybrid_search",
      args: { text: "foxes", n_results: 2, k_constant: 40 }
    });
    expect(obs.result).toEqual({
      semantic: { "doc-1": "a chunk about foxes" },
      hybrid: { "doc-2": "a hybrid hit" }
    });
  });

  it("keeps list and query working alongside the vector methods", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(COLLECTION_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `await nodetool.collections.list();
       return await nodetool.collections.query("docs", "foxes", {
         n_results: 5
       });`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({ name: "list_collections" });
    expect(calls[1]).toMatchObject({
      name: "query_collection",
      args: { collection: "docs", query: "foxes", n_results: 5 }
    });
  });

  it("names the missing tool when the belt lacks it", async () => {
    const { executeTool } = createFakeRouter();
    const session = makeSession([toolDef("list_collections")], executeTool);
    const obs = await runAction(
      session,
      `return await nodetool.collections.search("foxes");`
    );
    expect(obs.ok).toBe(false);
    expect(obs.error).toContain("vector_text_search");
  });
});

describe("nodetool.apps", () => {
  it("debugs a saved app by application_id", async () => {
    const { executeTool, calls } = createFakeRouter();
    const session = makeSession(APP_TOOLS, executeTool);
    const obs = await runAction(
      session,
      `return await nodetool.apps.debug("app-1", { run: false });`
    );
    expect(obs.ok).toBe(true);
    expect(calls[0]).toMatchObject({
      name: "debug_app",
      args: { application_id: "app-1", run: false }
    });
  });
});

describe("prompt section", () => {
  it("documents both namespaces when their tools are on the belt", () => {
    const section = buildNodetoolApiPromptSection([
      "vector_text_search",
      "debug_app"
    ]);
    expect(section).toContain("nodetool.collections");
    expect(section).toContain("hybridSearch");
    expect(section).toContain("nodetool.apps");
    expect(section).toContain("{run: false}");
  });

  it("omits apps when no app tool is present", () => {
    const section = buildNodetoolApiPromptSection(["vector_index"]);
    expect(section).toContain("nodetool.collections");
    expect(section).not.toContain("nodetool.apps");
  });
});
