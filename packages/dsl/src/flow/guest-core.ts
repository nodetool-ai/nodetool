/**
 * The guest runtime behind the generated flow callables.
 *
 * This module only ever runs inside the QuickJS guest, as part of the
 * `@nodetool-ai/sandbox-flow` pack: the pack build transforms it to JavaScript
 * and ships it next to the generated namespace modules, which import it and
 * nothing else. So it stays plain TypeScript with no workspace imports — the
 * one specifier it names is the host-mounted capability facade declared in
 * `sandbox-flow-capability.d.ts`.
 *
 * A call crosses the boundary once (`invoke_node`); a stream crosses it once to
 * open, once per item, and once to close.
 */
import {
  invoke_node,
  open_node_stream,
  take_node_stream,
  close_node_stream
} from "@nodetool-ai/sandbox-nodetool/flow";

/** Run a node and return its outputs. Errors reject with the node's own error. */
export async function callNode<Outputs>(
  type: string,
  inputs: Record<string, unknown>
): Promise<Outputs> {
  const outputs = await invoke_node({ type, inputs });
  return outputs as Outputs;
}

/**
 * Stream a node's output, one item per yield or per emission.
 *
 * The stream is closed when the consumer stops — an early `break` runs the
 * generator's `finally`, so the host releases it instead of holding a node
 * nobody reads. A stream that ran to `done` needs no close.
 */
export function streamNode<Item>(
  type: string,
  inputs: Record<string, unknown>
): AsyncIterable<Item> {
  return {
    async *[Symbol.asyncIterator](): AsyncGenerator<Item> {
      const { stream_id } = await open_node_stream({ type, inputs });
      let exhausted = false;
      try {
        while (true) {
          const next = await take_node_stream({ stream_id });
          if (next.done) {
            exhausted = true;
            return;
          }
          yield next.value as Item;
        }
      } finally {
        if (!exhausted) await close_node_stream({ stream_id });
      }
    }
  };
}
