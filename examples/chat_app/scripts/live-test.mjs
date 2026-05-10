#!/usr/bin/env node
/**
 * End-to-end smoke test for @nodetool-ai/sdk + the example app.
 *
 * Drives the same flow the browser does, against a running NodeTool server:
 *
 *   1. nodetool.trpc.models.providers           — `fake` must be advertised
 *   2. nodetool.listLanguageModels()            — must include `fake-model-v1`
 *   3. nodetool.trpc.threads.create             — create a thread
 *   4. socket.send({...})                       — chunks + final message
 *   5. nodetool.trpc.messages.list              — both messages persisted
 *   6. nodetool.trpc.threads.delete             — clean up
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

import { setTimeout as sleep } from "node:timers/promises";
import { WebSocket } from "ws";
import { createNodetoolClient } from "@nodetool-ai/sdk";

const args = process.argv.slice(2);
let baseUrl = "http://localhost:7777";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) {
    baseUrl = args[i + 1];
    i++;
  }
}

const nodetool = createNodetoolClient({ baseUrl, WebSocket });

let failures = 0;
function check(label, ok, detail) {
  const status = ok ? "PASS" : "FAIL";
  const tail = detail ? ` — ${detail}` : "";
  console.log(`[${status}] ${label}${tail}`);
  if (!ok) failures++;
}

async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await nodetool.trpc.models.providers.query();
      return;
    } catch {
      /* keep polling */
    }
    await sleep(250);
  }
  throw new Error(`Server at ${baseUrl} did not respond within ${timeoutMs}ms`);
}

/**
 * Open a chat socket via the SDK, send a message, and resolve once both the
 * stream-done chunk and the final assistant `message` frame have arrived.
 */
function chatRoundTrip(threadId, text, model) {
  return new Promise((resolve, reject) => {
    const socket = nodetool.chat();
    const chunks = [];
    let finalMessage = null;
    let doneChunk = false;
    let settled = false;
    let finishTimer = null;

    const hardTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.disconnect();
      reject(new Error("chat round-trip timed out after 10s"));
    }, 10_000);

    function settleSuccess() {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      if (finishTimer) clearTimeout(finishTimer);
      socket.disconnect();
      resolve({ chunks, finalMessage });
    }

    socket.on("chunk", (c) => {
      chunks.push(c);
      if (c.done) {
        doneChunk = true;
        // Final `message` frame normally arrives within a few ms after
        // the done chunk; wait briefly before giving up.
        finishTimer = setTimeout(() => settleSuccess(), 1500);
        if (finalMessage) settleSuccess();
      }
    });
    socket.on("message", (m) => {
      if (m.role !== "assistant") return;
      finalMessage = m;
      if (doneChunk) settleSuccess();
    });
    socket.on("error", (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      if (finishTimer) clearTimeout(finishTimer);
      socket.disconnect();
      reject(new Error(`server error: ${e.message ?? e}`));
    });
    socket.on("state", (s) => {
      if (s === "connected") {
        socket.send({
          threadId,
          text,
          model: model.id,
          provider: model.provider
        });
      }
    });

    socket.connect();
  });
}

async function main() {
  console.log(`▶ live-test against ${baseUrl}`);
  await waitForServer();

  // 1) providers
  const providers = await nodetool.trpc.models.providers.query();
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

  // 2) llm models via SDK helper
  const all = await nodetool.listLanguageModels();
  const model = all.find((m) => m.provider === "fake" && m.id === "fake-model-v1");
  check(
    "listLanguageModels() includes fake-model-v1",
    Boolean(model),
    `total=${all.length}`
  );
  if (!fake || !model) {
    console.log(
      "\n❌ aborting: fake provider is not configured. Restart the server with"
    );
    console.log("   NODETOOL_ENABLE_FAKE_PROVIDER=1 npm run dev:nodetool -- serve");
    process.exit(failures || 1);
  }

  // 3) create thread
  const thread = await nodetool.trpc.threads.create.mutate({
    title: "live-test"
  });
  check(
    "threads.create returned an id",
    typeof thread?.id === "string" && thread.id.length > 0
  );

  // 4) WS chat round-trip via the SDK ChatSocket
  const { chunks, finalMessage } = await chatRoundTrip(thread.id, "hi", {
    id: model.id,
    provider: "fake"
  });
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
  const list = await nodetool.trpc.messages.list.query({
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
  await nodetool.trpc.threads.delete.mutate({ id: thread.id });
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
