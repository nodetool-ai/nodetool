/**
 * Test Gemini tool calling with thought_signature round-trip.
 * Usage: GEMINI_API_KEY=xxx npx tsx scripts/test-gemini-tools.ts
 *
 * Or it will try to read from macOS keychain via the security module.
 */

import { GeminiProvider } from "../packages/runtime/src/providers/gemini-provider.js";
import type {
  ToolCall,
  Message
} from "../packages/runtime/src/providers/types.js";

async function getApiKey(): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  // Try reading from macOS keychain where nodetool stores secrets
  try {
    const { execSync } = await import("child_process");
    const result = execSync(
      'security find-generic-password -s nodetool -a GEMINI_API_KEY -w 2>/dev/null',
      { encoding: "utf-8" }
    ).trim();
    if (result) return result;
  } catch {}

  throw new Error(
    "Set GEMINI_API_KEY env var"
  );
}

async function main() {
  const apiKey = await getApiKey();
  console.log("Got API key:", apiKey.slice(0, 8) + "...");

  const provider = new GeminiProvider({ GEMINI_API_KEY: apiKey });

  const tools = [
    {
      name: "execute_bash",
      description: "Execute a bash command and return the output",
      inputSchema: {
        type: "object" as const,
        properties: {
          command: {
            type: "string",
            description: "The bash command to run"
          }
        },
        required: ["command"]
      }
    }
  ];

  const messages: Message[] = [
    {
      role: "system",
      content:
        "You are a helpful assistant. Always use the execute_bash tool to answer questions."
    },
    {
      role: "user",
      content: "What is 2+2? Use the bash tool: echo $((2+2))"
    }
  ];

  console.log("\n=== Turn 1: Initial request ===");

  const collectedToolCalls: ToolCall[] = [];
  let textContent = "";

  for await (const item of provider.generateMessages({
    messages: [...messages],
    model: "gemini-3.1-flash-lite-preview",
    tools,
    maxTokens: 1024
  })) {
    if ("type" in item && (item as any).type === "chunk") {
      const chunk = item as any;
      if (chunk.content && !chunk.done)
        textContent += chunk.content;
    } else if ("name" in item) {
      const tc = item as ToolCall;
      collectedToolCalls.push(tc);
      console.log("  toolCall:", tc.name, JSON.stringify(tc.args));
      console.log(
        "  thought_signature:",
        tc.thought_signature
          ? tc.thought_signature.slice(0, 40) + "..."
          : "NONE"
      );
      console.log(
        "  _rawGeminiParts:",
        tc._rawGeminiParts
          ? `${(tc._rawGeminiParts as any[]).length} parts`
          : "NONE"
      );
      if (tc._rawGeminiParts) {
        for (const p of tc._rawGeminiParts as any[]) {
          console.log(
            "    part:",
            Object.keys(p).join(","),
            p.thought ? "(THOUGHT)" : "",
            p.functionCall ? `fn=${p.functionCall.name}` : "",
            p.text ? `text="${p.text.slice(0, 50)}..."` : ""
          );
        }
      }
    }
  }

  if (collectedToolCalls.length === 0) {
    console.log("\nNo tool calls returned. Text:", textContent);
    console.log("Try again — model didn't use the tool.");
    return;
  }

  // Build assistant message
  const rawParts = collectedToolCalls.find(
    (tc) => tc._rawGeminiParts
  )?._rawGeminiParts;

  const assistantMsg: Message = {
    role: "assistant",
    content: textContent || null,
    toolCalls: collectedToolCalls
  };
  if (rawParts) {
    assistantMsg._rawGeminiParts = rawParts;
    console.log(
      "\n  Attached",
      (rawParts as any[]).length,
      "raw parts to assistant message"
    );
  } else {
    console.log("\n  WARNING: No raw parts captured!");
  }

  messages.push(assistantMsg);

  // Add tool results
  for (const tc of collectedToolCalls) {
    messages.push({
      role: "tool",
      toolCallId: tc.id,
      content: JSON.stringify({ stdout: "4", stderr: "", exit_code: 0 })
    });
  }

  console.log("\n=== Turn 2: Sending tool result ===");

  let turn2Text = "";
  try {
    for await (const item of provider.generateMessages({
      messages: [...messages],
      model: "gemini-3.1-flash-lite-preview",
      tools,
      maxTokens: 1024
    })) {
      if ("type" in item && (item as any).type === "chunk") {
        const chunk = item as any;
        if (chunk.content) turn2Text += chunk.content;
      }
    }
    console.log("\nResponse:", turn2Text);
    console.log("\n=== SUCCESS ===");
  } catch (err: any) {
    console.error("\n=== TURN 2 FAILED ===");
    console.error(err.message.slice(0, 500));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
