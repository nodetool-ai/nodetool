# `@nodetool-ai/sdk`

TypeScript SDK for the NodeTool server.

- **Fully-typed tRPC client** covering the entire `AppRouter` surface
  (threads, messages, models, workflows, jobs, assets, settings, …) —
  no separate API definition to maintain.
- **`ChatSocket`** — typed event-emitter wrapper around the chat
  WebSocket protocol (msgpack frames, with JSON fallback).
- Works in browsers and Node ≥18. In Node, pass a `WebSocket`
  constructor from the [`ws`](https://www.npmjs.com/package/ws) package.

## Install

This package lives inside the NodeTool monorepo. From a workspace
that depends on it (`@nodetool-ai/sdk: "*"`), import directly:

```ts
import { createNodetoolClient } from "@nodetool-ai/sdk";
```

## Usage

```ts
import { createNodetoolClient } from "@nodetool-ai/sdk";

const nodetool = createNodetoolClient({
  baseUrl: "http://localhost:7777",
  authToken: process.env.NODETOOL_TOKEN ?? null
});

// ── tRPC ──────────────────────────────────────────────────────
const { threads } = await nodetool.trpc.threads.list.query({ limit: 50 });
const thread = await nodetool.trpc.threads.create.mutate({ title: "Hi" });
const { messages } = await nodetool.trpc.messages.list.query({
  thread_id: thread.id,
  limit: 100
});

// ── Convenience: list LLM models from configured providers ────
const models = await nodetool.listLanguageModels();
// → [{ id: "gpt-5.4-mini", name: "GPT 5.4 mini", provider: "openai" }, …]

// ── Streaming chat WebSocket ──────────────────────────────────
const socket = nodetool.chat();

socket.on("chunk", (c) => {
  // c.content — partial text; c.done — true on the final chunk
});
socket.on("message", (m) => {
  // Final persisted assistant message (after stream completes)
});
socket.on("tool_call", (t) => {
  // t.name, t.args
});
socket.on("error", (e) => console.error(e.message));
socket.on("state", (s) => console.log("ws state:", s));

socket.connect();
socket.send({
  threadId: thread.id,
  text: "Hello!",
  model: "fake-model-v1",
  provider: "fake"
});

// To cancel an in-flight stream:
socket.stop(thread.id);
```

## Node usage

```ts
import { WebSocket } from "ws";
import { createNodetoolClient } from "@nodetool-ai/sdk";

const nodetool = createNodetoolClient({
  baseUrl: "http://localhost:7777",
  WebSocket // pass the ws constructor explicitly
});
```

## API surface

```ts
createNodetoolClient(opts: {
  baseUrl: string;
  authToken?: string | null;
  fetch?: typeof fetch;
  WebSocket?: typeof WebSocket;
}): NodetoolClient

interface NodetoolClient {
  baseUrl: string;
  authToken: string | null;
  trpc: CreateTRPCClient<AppRouter>;        // full type-safe tRPC client
  chat(): ChatSocket;                        // open a new chat WebSocket
  listLanguageModels(): Promise<{
    id: string; name: string; provider: string;
  }[]>;
}

class ChatSocket {
  connect(): void;
  disconnect(): void;
  send(opts: SendChatMessageOptions): void;
  stop(threadId: string): void;
  on<K extends keyof ChatEvents>(event: K, h: (p: ChatEvents[K]) => void): () => void;
  getState(): ConnectionState;
}
```

Discriminated `ChatEvent` union covers `chunk`, `message`, `tool_call`,
`error`, `generation_stopped`, `thread_update`, `planning_update`,
`task_update`, plus a `raw` catch-all for forward-compatible frames.

## Worked example

See [`examples/chat_app/`](../../examples/chat_app/) for a complete
shadcn/ui chat client built on top of this SDK, plus a CLI smoke test
([`scripts/live-test.mjs`](../../examples/chat_app/scripts/live-test.mjs))
that exercises the same flow end-to-end.
