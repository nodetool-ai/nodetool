import { describe, expect, it, vi } from "vitest";
import type { ProcessingMessage } from "@nodetool-ai/protocol";
import { MessageStream } from "../src/message-stream.js";

function source() {
  let listener: ((message: ProcessingMessage) => void) | undefined;
  const unsubscribe = vi.fn(() => {
    listener = undefined;
  });
  return {
    unsubscribe,
    addMessageListener: (callback: (message: ProcessingMessage) => void) => {
      listener = callback;
      return unsubscribe;
    },
    emit: (index: number) =>
      listener?.({
        type: "job_update",
        job_id: String(index),
        status: "running",
        workflow_id: null
      })
  };
}

describe("MessageStream", () => {
  it("drains a large ordered backlog before completing and detaches once", async () => {
    const input = source();
    const stream = new MessageStream(input, 0);
    for (let index = 0; index < 25_000; index++) {
      input.emit(index);
    }
    stream.close();
    stream.close();
    let count = 0;
    for await (const message of stream) {
      expect(message).toHaveProperty("job_id", String(count++));
    }
    expect(count).toBe(25_000);
    expect(input.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("wakes a waiting consumer on close", async () => {
    const input = source();
    const stream = new MessageStream(input);
    const next = stream[Symbol.asyncIterator]().next();
    stream.close();
    expect((await next).done).toBe(true);
  });

  it("drains accepted messages then reports overflow", async () => {
    const input = source();
    const stream = new MessageStream(input, 2);
    input.emit(0);
    input.emit(1);
    input.emit(2);
    const iterator = stream[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toHaveProperty("job_id", "0");
    expect((await iterator.next()).value).toHaveProperty("job_id", "1");
    await expect(iterator.next()).rejects.toThrow("overflowed");
    expect(input.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
