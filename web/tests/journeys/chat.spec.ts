/**
 * Journey: send a chat message and receive a reply.
 *
 * Exercises the WebSocket/MsgPack path end to end — compose, send, stream the
 * assistant response back, render it in the transcript. The provider is faked
 * (`fake-runtime.ts`), so the reply text is fixed and asserting on it is safe;
 * what is being tested is the transport and the UI, not the model.
 */

import { test, expect, FIXTURES, FAKE_LLM_TEXT } from "./fixtures";
import { ChatPage } from "./pages";

test.describe("Chat", () => {
  test("renders the seeded thread history", async ({ page, pageErrors }) => {
    const chat = new ChatPage(page);
    await chat.open(FIXTURES.thread);

    // Seeded assistant message from `screenshot-server.ts`.
    await chat.waitForMessage("dreams of silicon");

    expect(pageErrors, "chat loaded with page errors").toEqual([]);
  });

  test("sends a message and streams back a reply", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.open(FIXTURES.thread);

    const question = "What is the capital of France?";
    await chat.send(question);

    // The user's message is echoed into the transcript immediately…
    await chat.waitForMessage(question);
    // …and the assistant reply arrives over the socket.
    await chat.waitForMessage(FAKE_LLM_TEXT);
  });

  test("clears the composer after sending", async ({ page }) => {
    const chat = new ChatPage(page);
    await chat.open(FIXTURES.thread);

    await chat.send("a throwaway message");
    await chat.waitForMessage(FAKE_LLM_TEXT);

    await expect(chat.composer()).toHaveValue("");
  });
});
