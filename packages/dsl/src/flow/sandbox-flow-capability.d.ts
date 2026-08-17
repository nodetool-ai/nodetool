/**
 * The wire contract `guest-core.ts` is written against.
 *
 * `@nodetool-ai/sandbox-nodetool/flow` is a facade the host generates and
 * mounts inside the QuickJS guest; it is not a workspace package and never
 * resolves on the host, so the compiler needs the shape declared here. The
 * pack build erases these types and ships the guest the facade already has.
 */
declare module "@nodetool-ai/sandbox-nodetool/flow" {
  /** Run a node to completion and return its outputs. */
  export function invoke_node(args: {
    type: string;
    inputs: Record<string, unknown>;
  }): Promise<Record<string, unknown>>;

  /** Start a streaming call. The id addresses it until it is closed. */
  export function open_node_stream(args: {
    type: string;
    inputs: Record<string, unknown>;
  }): Promise<{ stream_id: string }>;

  /** The next item, or `{done: true}` once the node is finished. */
  export function take_node_stream(args: {
    stream_id: string;
  }): Promise<{ done: true } | { done: false; value: unknown }>;

  /** Release a stream the caller stopped reading. */
  export function close_node_stream(args: { stream_id: string }): Promise<void>;
}
