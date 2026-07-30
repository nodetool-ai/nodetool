/**
 * Turns `ProcessingContext`'s push-based `addMessageListener` into a pull-based
 * `AsyncIterable<ProcessingMessage>`. Modeled on the queue/wake pattern in
 * `packages/workflow-runner/src/run.ts`'s `runWorkflow` generator — the one
 * other place in the repo already streams a kernel run as an async sequence.
 */
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ProcessingMessage } from "@nodetool-ai/protocol";

export class MessageStream implements AsyncIterable<ProcessingMessage> {
  private readonly queue: ProcessingMessage[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  private readonly unsubscribe: () => void;

  constructor(context: ProcessingContext) {
    this.unsubscribe = context.addMessageListener((message) => {
      this.queue.push(message);
      this.wake();
    });
  }

  private wake(): void {
    const w = this.waiter;
    this.waiter = null;
    w?.();
  }

  /** Stop feeding new messages into the queue. Already-queued messages still drain. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    this.wake();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<ProcessingMessage> {
    for (;;) {
      while (this.queue.length > 0) {
        yield this.queue.shift()!;
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}
