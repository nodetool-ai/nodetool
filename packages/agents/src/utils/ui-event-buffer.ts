import type { ProcessingMessage } from "@nodetool-ai/protocol";

/**
 * A queue of UI messages produced outside the generator that yields them.
 *
 * An executor drives the provider loop from callbacks (a tool's `execute`
 * closure, a completion handler) that cannot `yield`. They push here, and the
 * generator drains the queue at each point it is allowed to emit — so the
 * events reach the consumer in the order they were produced, without the
 * callback holding a reference to the generator.
 */
export interface UiEventBuffer {
  /** Queue one or more messages for the next drain. */
  push(...events: ProcessingMessage[]): void;
  /** Yield every queued message and empty the queue. */
  drain(): Generator<ProcessingMessage>;
}

export function createUiEventBuffer(): UiEventBuffer {
  const queue: ProcessingMessage[] = [];
  return {
    push(...events: ProcessingMessage[]): void {
      queue.push(...events);
    },
    *drain(): Generator<ProcessingMessage> {
      // Re-read the queue each round: a callback may push while the consumer
      // is mid-drain, and that event belongs to this drain.
      let event = queue.shift();
      while (event !== undefined) {
        yield event;
        event = queue.shift();
      }
    }
  };
}
