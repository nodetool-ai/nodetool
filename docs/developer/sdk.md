---
layout: page
title: "TypeScript SDK"
description: "Use @nodetool-ai/sdk to call the NodeTool server from TypeScript with a typed tRPC client and a chat WebSocket."
---

`@nodetool-ai/sdk` is the public TypeScript client for a NodeTool server. It has two parts: a typed tRPC client that covers the server's `AppRouter`, and `ChatSocket`, an event-emitter wrapper around the chat WebSocket. The source is in `packages/sdk/src/`.

## Install

```bash
npm install @nodetool-ai/sdk
```

The package is ESM only and declares `engines.node` as `>=22.0.0`. `ws` is an optional peer dependency (`^8.18.0`). Install it when you use the chat socket in Node:

```bash
npm install ws
```

Inside the NodeTool monorepo, depend on it as `@nodetool-ai/sdk: "*"`.

## Exports

The package has one entry point, `@nodetool-ai/sdk`.

| Export | Kind | Purpose |
|---|---|---|
| `createNodetoolClient` | function | Builds a `NodetoolClient` from a base URL and options. |
| `ChatSocket` | class | Chat WebSocket client. You normally get one from `client.chat()`. |
| `NodetoolClient`, `CreateNodetoolClientOptions` | types | Client and option shapes. |
| `ChatEvent`, `ChatChunkEvent`, `ChatMessageEvent`, `ChatToolCallEvent`, `ChatErrorEvent`, `ChatGenerationStoppedEvent`, `ChatThreadUpdateEvent`, `ChatRawEvent` | types | Inbound frame types. `ChatEvent` is the union, and it also includes `PlanningUpdate` and `TaskUpdate`. |
| `SendChatMessageOptions`, `ChatSocketOptions`, `ConnectionState`, `WebSocketCtor`, `ChatFrameFields`, `ChatFrameValue` | types | Socket options and wire-level value types. |
| `AppRouter` | type | The server's tRPC router type, for your own typed wrappers. |
| `Chunk`, `ContentType`, `JobStatus`, `TaskUpdate`, `PlanningUpdate`, `ToolCallUpdate`, `ErrorMessage` | types | Re-exported from `@nodetool-ai/protocol`. |

## Create a client

```ts
import { createNodetoolClient } from "@nodetool-ai/sdk";

const nodetool = createNodetoolClient({
  baseUrl: "http://localhost:7777",
  authToken: process.env.NODETOOL_TOKEN ?? null
});
```

`CreateNodetoolClientOptions`:

| Option | Type | Behavior |
|---|---|---|
| `baseUrl` | `string` | Required. A trailing slash is removed. tRPC calls go to `<baseUrl>/trpc` and the chat socket to `<baseUrl>/ws`, with `http` mapped to `ws` and `https` to `wss`. |
| `authToken` | `string \| null` | Optional bearer token. Sent as `Authorization: Bearer <token>` on tRPC calls and as a `?token=` query parameter on the chat WebSocket. |
| `fetch` | `typeof fetch` | Optional override. Defaults to the global `fetch`, and the client throws if there is none. |
| `WebSocket` | `WebSocketCtor` | Constructor for environments without a global `WebSocket`. |

The returned `NodetoolClient` has `baseUrl`, `authToken`, `trpc`, `chat()` and `listLanguageModels()`. tRPC calls are batched over HTTP, with each batch sent as a POST.

## Call the typed API

`client.trpc` is a `CreateTRPCClient<AppRouter>`. Routers include `threads`, `messages`, `models`, `workflows`, `jobs` and `assets`, among others. Inputs and outputs are typed from the server.

```ts
const { workflows, next } = await nodetool.trpc.workflows.list.query({
  limit: 20
});
for (const w of workflows) {
  console.log(w.id, w.name);
}

// Page forward with the cursor from the previous response.
if (next) {
  await nodetool.trpc.workflows.list.query({ limit: 20, cursor: next });
}
```

`jobs.list` takes `limit`, `workflow_id`, `project_id`, `include_outputs` and `start_key`, and returns `jobs` plus `next_start_key`.

The SDK does not wrap workflow execution or job progress streaming. To run a workflow, use the REST and WebSocket endpoints in the [API Reference](../api-reference.md). The SDK only lets you read jobs through `trpc.jobs.*`.

`listLanguageModels()` returns `{ id, name, provider }[]` for every configured provider that advertises the `generate_message` capability. A provider whose model list fails to load is skipped.

```ts
const models = await nodetool.listLanguageModels();
```

## Chat over WebSocket

`client.chat()` returns a new `ChatSocket`. Open one socket for each active thread if you need concurrent streams.

```ts
const thread = await nodetool.trpc.threads.create.mutate({ title: "Hello" });
const socket = nodetool.chat();

socket.on("chunk", (c) => process.stdout.write(c.content));
socket.on("message", (m) => console.log("persisted:", m.id));
socket.on("error", (e) => console.error(e.message));
socket.on("state", (s) => console.log("socket state:", s));

socket.connect();
```

`send()` and `stop()` throw `WebSocket is not connected` unless the socket is open. Wait for the `state` event to report `"connected"` before sending:

```ts
socket.on("state", (s) => {
  if (s === "connected") {
    socket.send({
      threadId: thread.id,
      text: "Summarize the last run.",
      provider: "openai",
      model: "gpt-5.4-mini"
    });
  }
});
```

### Methods

| Method | Behavior |
|---|---|
| `connect()` | Opens the socket. Does nothing if it is already open or connecting. |
| `disconnect()` | Closes the socket and cancels a pending reconnect. |
| `send(opts)` | Sends a `chat_message` command. |
| `stop(threadId)` | Sends a `stop` command for the thread. |
| `resume(threadId, lastSeq)` | Sends `resume_chat`. The server replays frames it stamped after `lastSeq`. |
| `on(event, handler)` | Subscribes and returns an unsubscribe function. |
| `getState()` | Returns the current `ConnectionState`. |

`SendChatMessageOptions` has `threadId` and `text` (required) and the optional fields `model`, `provider`, `agentMode`, `tools`, `collections` and `permissionMode` (`"plan"`, `"default"` or `"auto"`). The server default is `"default"`, which parks tool actions on an approval request, so a script with no approval handler should set `permissionMode: "auto"` deliberately.

### Events

`on()` accepts `chunk`, `message`, `tool_call`, `error`, `generation_stopped`, `thread_update`, `planning_update`, `task_update`, `raw` and `state`. `raw` fires for every decoded frame, including frame types with no typed handler. `state` carries a `ConnectionState`: `idle`, `connecting`, `connected`, `disconnected`, `reconnecting` or `error`.

### Wire format and reconnects

Outbound commands are encoded with msgpack. If encoding fails, the socket sends JSON text instead. Inbound binary frames are decoded as msgpack and text frames as JSON. Frames that fail to decode are logged and dropped.

After an unintentional close the socket reconnects with a linear backoff of `reconnectDelayMs * attempt`, starting at 1500 ms and capped at 15 s. It gives up after `maxReconnect` attempts (default 10) and sets the state to `error`. Set `maxReconnect` to `0` to disable reconnecting. These two options exist on `ChatSocketOptions`, and `client.chat()` does not pass them, so construct `ChatSocket` directly to change them:

```ts
import { ChatSocket } from "@nodetool-ai/sdk";

const socket = new ChatSocket({
  url: "ws://localhost:7777/ws",
  authToken: process.env.NODETOOL_TOKEN,
  maxReconnect: 3
});
```

The protocol itself is described in the [Chat API](../chat-api.md).

## Use in Node

Node has a global `fetch` but no global `WebSocket`. Pass the constructor from `ws`, or `chat()` and `new ChatSocket()` throw `No WebSocket constructor available`:

```ts
import { WebSocket } from "ws";
import { createNodetoolClient } from "@nodetool-ai/sdk";

const nodetool = createNodetoolClient({
  baseUrl: "http://localhost:7777",
  WebSocket: WebSocket as unknown as typeof globalThis.WebSocket
});
```

The cast is only needed if your TypeScript configuration reports a type mismatch between `ws` and the DOM `WebSocket` type. Browsers need no constructor. The `fetch` and `WebSocket` options are the places to inject a wrapped fetch or a test double.

See `examples/chat_app/` in the repository for a complete chat client built on the SDK.
