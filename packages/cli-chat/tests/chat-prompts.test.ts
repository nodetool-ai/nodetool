import { expect, it } from "vitest";
import { ChatPrompts, type ChatPrompt } from "../src/chat-prompts.js";

it("queues parallel approvals and resolves every waiter on abort", async () => {
  let visible: ChatPrompt | null = null;
  const prompts = new ChatPrompts((prompt) => {
    visible = prompt;
  });
  const abort = new AbortController();
  const first = prompts.ask(
    { title: "Write", body: "a", choices: [] },
    abort.signal
  );
  const second = prompts.ask(
    { title: "Delete", body: "b", choices: [] },
    abort.signal
  );
  expect(visible?.title).toBe("Write");
  prompts.answer("allow");
  expect(await first).toBe("allow");
  expect(visible?.title).toBe("Delete");
  abort.abort();
  expect(await second).toBe("cancel");
  expect(visible).toBeNull();
  expect(
    await prompts.ask({ title: "late", body: "", choices: [] }, abort.signal)
  ).toBe("cancel");
});
