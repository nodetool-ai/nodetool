/**
 * Node registry shared by the kernel driver and, via `registerFixtureNodes`,
 * added onto the ws-server driver's own registry — the same real node
 * classes (`registerBaseNodes`) run on both surfaces, so journeys exercise
 * identical node behavior everywhere. See `fixture-nodes.ts` for the three
 * nodes neither surface's real registry has.
 */
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { registerBaseNodes } from "@nodetool-ai/base-nodes";
import { registerFixtureNodes } from "./fixture-nodes.js";

/** Fresh registry for one kernel-driver run: real base nodes + harness fixtures. */
export function buildJourneyRegistry(): NodeRegistry {
  const registry = new NodeRegistry();
  registerBaseNodes(registry);
  registerFixtureNodes(registry);
  return registry;
}
