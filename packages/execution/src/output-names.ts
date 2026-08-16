/**
 * Renames terminal Output-node keys to their public `properties.name` before
 * the run starts. The kernel keys terminal outputs by `node.name`; SDK/API
 * callers that need `output_update`/terminal-result addressing to agree with
 * their declared interface names set `requireTerminalResult`.
 *
 * Ported from `unified-websocket-runner.ts`'s `startJobInner`
 * (`req.require_terminal_result` branch) — the only site that did this
 * before this package existed.
 */
import type { HydratedGraphData } from "@nodetool-ai/protocol";
import { isNonBlankString } from "./predicates.js";

export function rewriteOutputNames(graph: HydratedGraphData): void {
  for (const node of graph.nodes) {
    if (!node.type.startsWith("nodetool.output.")) continue;
    const properties = node.properties as Record<string, unknown> | null;
    const publicName = properties?.["name"];
    if (isNonBlankString(publicName)) {
      node.name = publicName;
    }
  }
}
