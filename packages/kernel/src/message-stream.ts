/**
 * Buffers live processing messages for server and portable workflow hosts.
 * Closing detaches the listener and lets queued terminal messages drain.
 *
 * The queue is bounded. A caller that opts into capture (see
 * `ExecutionSessionOptions.captureMessages`) but never iterates would
 * otherwise retain every message of the run — including real-time audio
 * chunks, which the kernel's own message retention deliberately avoids
 * holding (roughly 25 MB/minute). Past the limit the stream stops queueing
 * and the iterator throws, so a non-draining consumer fails loudly instead of
 * growing until the run ends.
 */
import type { ProcessingMessage } from "@nodetool-ai/protocol";

/** Queued messages allowed to pile up before the stream gives up. */
export const DEFAULT_MESSAGE_BUFFER_LIMIT = 10_000;

export class MessageStream implements AsyncIterable<ProcessingMessage> {
  private readonly queue: ProcessingMessage[] = [];
  private waiter: (() => void) | null = null;
  private closed = false;
  private overflowedAt: number | null = null;
  private readonly limit: number;
  private readonly unsubscribe: () => void;

  /** `limit` of 0 (or a negative number) means unbounded. */
  constructor(
    context: {
      addMessageListener(
        listener: (message: ProcessingMessage) => void
      ): () => void;
    },
    limit = DEFAULT_MESSAGE_BUFFER_LIMIT
  ) {
    this.limit = limit > 0 ? limit : Number.POSITIVE_INFINITY;
    this.unsubscribe = context.addMessageListener((message) => {
      if (this.queue.length >= this.limit) {
        if (this.overflowedAt === null) {
          this.overflowedAt = this.queue.length;
          this.unsubscribe();
        }
        return;
      }
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
      // Drain batches so a large backlog does not shift an array per message.
      const batch = this.queue.splice(0);
      for (const message of batch) {
        yield message;
      }
      if (this.overflowedAt !== null) {
        throw new Error(
          `Workflow message stream overflowed after ${this.overflowedAt} ` +
            `queued messages (limit ${this.limit}) — the consumer fell behind, ` +
            "so messages past that point were dropped rather than retained. " +
            "Iterate `session.messages` as the run progresses, or raise " +
            "`limits.messageBufferLimit`."
        );
      }
      if (this.closed) return;
      await new Promise<void>((resolve) => {
        this.waiter = resolve;
      });
    }
  }
}
