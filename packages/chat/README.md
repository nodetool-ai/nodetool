# @nodetool-ai/chat

Chat message processing for [NodeTool](https://nodetool.ai) — tool-call orchestration, streaming responses, and token counting.

This package drives a chat turn end to end: it streams a provider response, runs any tool calls the model emits, loops until the turn settles, and reports progress through callbacks. It also counts tokens for text and message arrays so callers can enforce context budgets.

## Install

```bash
npm install @nodetool-ai/chat
```

## Exported symbols

| Symbol | Kind | Description |
| --- | --- | --- |
| `processChat` | function | Runs a full chat turn: stream, execute tool calls, loop to completion |
| `runTool` | function | Executes a single tool call against a tool list |
| `ChatCallbacks` | interface | Hooks for chunks, tool calls, tool results, and session updates |
| `countTextTokens` | function | Token count for a text string |
| `countMessageTokens` | function | Token count for a single message |
| `countMessagesTokens` | function | Token count for a message array |

## Usage

```ts
import { processChat } from "@nodetool-ai/chat";

await processChat({
  userInput: "Summarize the attached report",
  messages,
  model: "claude-sonnet-4-6",
  provider,
  context,
  tools,
  callbacks: {
    onChunk: (text) => process.stdout.write(text),
    onToolCall: (call) => console.log("tool:", call.name)
  }
});
```

## Links

- [NodeTool](https://nodetool.ai)
- [GitHub](https://github.com/nodetool-ai/nodetool)
