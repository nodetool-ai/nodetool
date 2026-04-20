#!/usr/bin/env tsx
import { AkiProvider } from "../src/providers/aki-provider.js";
import type { ProviderTool } from "../src/providers/types.js";

const tools: ProviderTool[] = [
  {
    name: "search_docs",
    description: "Search project documentation",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" }
      },
      required: ["query"]
    }
  }
];

const callLog: Array<Record<string, unknown>> = [];
const fakeClient = {
  doApiRequest: async (params: Record<string, unknown>) => {
    callLog.push({ phase: "generateMessage", params });
    return {
      success: true,
      text: null,
      tool_calls: {
        id: "debug-tool-1",
        name: "search_docs",
        arguments: { query: "aki tool calling" }
      }
    };
  },
  getApiRequestGenerator: async function* (params: Record<string, unknown>) {
    callLog.push({ phase: "generateMessages", params });
    yield {
      success: true,
      progress_data: { text: "Thinking" }
    };
    yield {
      success: true,
      result_data: {
        tool_calls: {
          id: "debug-tool-2",
          name: "search_docs",
          arguments: '{"query":"streamed aki tool calling"}'
        }
      }
    };
  },
  getEndpointList: async () => [] as string[]
};

async function main() {
  const provider = new AkiProvider(
    { AKI_API_KEY: "debug-key" },
    { clientFactory: (() => fakeClient) as never }
  );

  console.log("=== generateMessage ===");
  const message = await provider.generateMessage({
    model: "llama3_chat",
    messages: [{ role: "user", content: "Find AKI tool docs" }],
    tools,
    toolChoice: "search_docs"
  });
  console.dir(message, { depth: null });

  console.log("\n=== generateMessages ===");
  const streamItems: unknown[] = [];
  for await (const item of provider.generateMessages({
    model: "llama3_chat",
    messages: [{ role: "user", content: "Stream AKI tool docs" }],
    tools,
    toolChoice: "search_docs"
  })) {
    streamItems.push(item);
  }
  console.dir(streamItems, { depth: null });

  console.log("\n=== request payloads sent to AKI client ===");
  console.dir(callLog, { depth: null });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
