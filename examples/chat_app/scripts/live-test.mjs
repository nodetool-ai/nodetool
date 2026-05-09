#!/usr/bin/env node
/**
 * End-to-end smoke test for the chat_app example.
 *
 * Drives the same flow the browser does, against a running NodeTool server:
 *
 *   1. GET  /trpc/models.providers     — `fake` must be advertised
 *   2. GET  /trpc/models.llmByProvider — must list `fake-model-v1`
 *   3. POST /trpc/threads.create       — create a thread
 *   4. WS   chat_message               — send "hi", expect chunks + final msg
 *   5. GET  /trpc/messages.list        — both messages must be persisted
 *   6. POST /trpc/threads.delete       — clean up
 *
 * Prereq: server started with `NODETOOL_ENABLE_FAKE_PROVIDER=1` so the
 * `fake` provider is registered.
 *
 * Exit code is the number of failed steps (0 = all pass).
 *
 * Usage:
 *   node examples/chat_app/scripts/live-test.mjs
 *   node examples/chat_app/scripts/live-test.mjs --url http://localhost:7777
 */

import { WebSocket } from "ws";
import { pack, unpack } from "msgpackr";
import { setTimeout as sleep } from "node:timers/promises";

const args = process.argv.slice(2);
let baseUrl = "http://localhost:7777";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  }
}
const wsUrl = baseUrl.replace(/^http/, "ws") + "/ws";

let failures = 0;
function check(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  const tail = detail ? ` — ${detail}` : "";
  console.log(`[${status}] ${label}${tail}`);
  if (!ok) failures++;
}

async function trpc(procedure, kind, input) {
  const url = new URL(`/trpc/${procedure}`, baseUrl);
  const init = { headers: { "Content-Type": "application/json" } };
  if (kind === "mutation") {
    init.method = "POST";
    init.body = JSON.stringify({ json: input ?? null });
  } else {
    init.method = "GET";
    if (input !== undefined) {
      url.searchParams.set("input", JSON.stringify({ json: input }));
    }
  }
  const res = await fetch(url, init);
  const body = await res.json();
  if (!res.ok || body?.error) {
    throw new Error(`tRPC ${procedure} ${res.status}: ${JSON.stringify(body)}`);
  }
  return body.result?.data?.json ?? body.result?.data ?? null;
}

async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Any tRPC query exercises the same code path as the real client.
      await trpc("models.providers", "query");
      return;
    } catch {
      /* keep polling */
    }
    await sleep(250);
  }
  throw new Error(`Server at ${baseUrl} did not respond within ${timeoutMs}ms`);
}

/**
 * Open the chat WebSocket, send a chat_message, and resolve when the assistant
 * has produced a `done: true` chunk (i.e. streaming has completed). Returns
 * `{ chunks, finalMessage }` collected during the round-trip.
 */
function chatRoundTrip(threadId, text, model) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";
    const chunks = [];
    let finalMessage = null;
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        ws.close();
        reject(new Error("chat round-trip timed out after 10s"));
      }
    }, 10_000);

    ws.on("open", () => {
      const payload = {
        command: "chat_message",
        data: {
          type: "message",
          role: "user",
          content: [{ type: "text", text }],
          thread_id: threadId,
          model: model.id,
          provider: model.provider,
          agent_mode: false,
          tools: null,
          collections: null
        }
      };
      ws.send(pack(payload));
    });

    let doneChunk = false;
    let finishTimer = null;
    function maybeResolve() {
      if (doneChunk && finalMessage && !done) {
        done = true;
        clearTimeout(timer);
        if (finishTimer) clearTimeout(finishTimer);
        ws.close();
        resolve({ chunks, finalMessage });
      }
    }

    ws.on("message", (data) => {
      const buf = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
      let frame;
      try {
        frame = unpack(buf);
      } catch {
        try {
          frame = JSON.parse(buf.toString());
        } catch {
          return;
        }
      }
      if (!frame || typeof frame !== "object") return;
      switch (frame.type) {
        case "chunk":
          chunks.push(frame);
          if (frame.done) {
            doneChunk = true;
            // The runner sends the assistant `message` frame immediately after
            // the done chunk; wait briefly for it before giving up.
            finishTimer = setTimeout(() => {
              if (!done) {
                done = true;
                clearTimeout(timer);
                ws.close();
                resolve({ chunks, finalMessage });
              }
            }, 1500);
            maybeResolve();
          }
          break;
        case "message":
          if (frame.role === "assistant") {
            finalMessage = frame;
            maybeResolve();
          }
          break;
        case "error":
          done = true;
          clearTimeout(timer);
          if (finishTimer) clearTimeout(finishTimer);
          ws.close();
          reject(new Error(`server error: ${frame.message ?? frame}`));
          break;
        default:
          break;
      }
    });

    ws.on("error", (err) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function main() {
  console.log(`▶ live-test against ${baseUrl}`);
  await waitForServer();

  // 1) providers
  const providers = await trpc("models.providers", "query");
  const fake = providers.find((p) => p.provider === "fake");
  check(
    "providers list includes fake",
    Boolean(fake),
    fake ? `caps=${fake.capabilities.join(",")}` : "missing"
  );
  check(
    "fake advertises generate_message capability",
    Boolean(fake?.capabilities?.includes("generate_message"))
  );

  // 2) llm models
  const models = await trpc("models.llmByProvider", "query", {
    provider: "fake"
  });
  const model = models.find((m) => m.id === "fake-model-v1");
  check(
    "models.llmByProvider returns fake-model-v1",
    Boolean(model),
    `count=${models.length}`
  );

  if (!fake || !model) {
    console.log(
      "\n❌ aborting: fake provider is not configured. Restart the server with"
    );
    console.log("   NODETOOL_ENABLE_FAKE_PROVIDER=1 npm run dev:nodetool -- serve");
    process.exit(failures || 1);
  }

  // 3) create thread
  const thread = await trpc("threads.create", "mutation", {
    title: "live-test"
  });
  check(
    "threads.create returned an id",
    typeof thread?.id === "string" && thread.id.length > 0
  );

  // 4) WS chat round-trip
  const { chunks, finalMessage } = await chatRoundTrip(
    thread.id,
    "hi",
    { id: model.id, provider: "fake" }
  );
  const streamedText = chunks.map((c) => c.content ?? "").join("");
  const expected = "Hello, this is a fake response!";
  check(
    "received >=1 streaming chunk",
    chunks.length > 0,
    `got ${chunks.length}`
  );
  check(
    "streamed text matches FakeProvider default",
    streamedText.startsWith(expected),
    JSON.stringify(streamedText.slice(0, 40))
  );
  check(
    "stream terminated with done=true",
    chunks.some((c) => c.done === true)
  );
  check("received final assistant message", Boolean(finalMessage));

  // 5) messages persisted
  const list = await trpc("messages.list", "query", {
    thread_id: thread.id,
    limit: 50
  });
  const roles = (list.messages ?? []).map((m) => m.role);
  check(
    "messages.list contains user + assistant",
    roles.includes("user") && roles.includes("assistant"),
    JSON.stringify(roles)
  );

  // 6) cleanup
  await trpc("threads.delete", "mutation", { id: thread.id });
  check("thread deleted", true);

  console.log(
    failures === 0
      ? "\n✅ all checks passed"
      : `\n❌ ${failures} check(s) failed`
  );
  process.exit(failures);
}

main().catch((err) => {
  console.error("\n💥 live-test crashed:", err);
  process.exit(1);
});
