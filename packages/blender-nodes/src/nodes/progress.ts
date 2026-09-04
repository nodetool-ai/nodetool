/**
 * Blender `Fra:` progress as `node_progress` messages (D6).
 *
 * `LocalBlenderRunner` turns the op's `Fra:<n>` stderr lines into
 * `onProgress` calls; this binds them to `context.postMessage`, the way the
 * ComfyUI node reports progress. Returns undefined without a context, so
 * context-free node tests stay silent.
 */

import type { ProcessingContext } from "@nodetool-ai/runtime";

export function blenderProgressHandler(
  context: ProcessingContext | undefined,
  nodeId: string
): ((frame: number, total: number) => void) | undefined {
  if (!context) return undefined;
  return (frame: number, total: number) => {
    context.postMessage({
      type: "node_progress",
      node_id: nodeId,
      progress: frame,
      total
    });
  };
}
