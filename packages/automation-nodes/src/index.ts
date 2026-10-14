import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { TRIGGER_NODES } from "./nodes/triggers.js";
import { LIB_SQLITE_NODES } from "./nodes/lib-sqlite.js";
import { LIB_BROWSER_NODES } from "./nodes/lib-browser.js";

export * from "./nodes/lib-browser.js";
export * from "./nodes/triggers.js";
export * from "./nodes/lib-sqlite.js";

// File-watch matching/debounce logic shared with the host file-watch adapter
// (packages/websocket/src/triggers/file-watch.ts) so both call sites stay in
// sync instead of duplicating pattern/debounce behavior.
export * from "./lib/file-watch-match.js";

export const ALL_AUTOMATION_NODES: readonly NodeClass[] = [
  ...TRIGGER_NODES,
  ...LIB_SQLITE_NODES,
  ...LIB_BROWSER_NODES,
];

export function registerAutomationNodes(registry: NodeRegistry): void {
  for (const nodeClass of ALL_AUTOMATION_NODES) {
    registry.register(nodeClass);
  }
}
