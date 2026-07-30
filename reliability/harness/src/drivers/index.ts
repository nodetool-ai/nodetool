/**
 * Driver entry point (C2, docs/RELIABILITY_TASKS.md Track C).
 *
 * Kept out of `../index.ts` deliberately: that barrel is being extended
 * concurrently (kernel strict-flag wiring lands in C4) and driver exports
 * belong here until C4 wires them into the main barrel.
 */
export type { RunDriver } from "./types.js";
export { matchesAnchor, AnchorWaiter, type AnchoredMessage } from "./anchors.js";
export {
  RELIABILITY_FIXTURE_NODES,
  registerFixtureNodes,
  ReliabilityStreamingInputNode,
  ReliabilityStreamSinkNode,
  ReliabilityCancelProbeNode
} from "./fixture-nodes.js";
export { buildJourneyRegistry } from "./registry.js";
export { KernelDriver } from "./kernel.js";
export { WsServerDriver } from "./ws-server.js";
