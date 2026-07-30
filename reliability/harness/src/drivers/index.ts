/**
 * Driver entry point (C2/C4, docs/RELIABILITY_TASKS.md Track C). Now also
 * re-exported from `../index.ts` (C4 item 7 lifts the "kept out of the main
 * barrel" constraint C2/C3 deliberately left in place).
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
export { findRepoRoot, resolveTsxBin } from "./repo-root.js";
export { spawnNodetoolCli, type CliRunResult } from "./spawn-cli.js";
export { CliDriver, cliDriverSupports } from "./cli.js";
export {
  AppHeadlessDriver,
  journeyHasAppDoc,
  runRecordFromAppDebugReport,
  type AppDebugReportLike
} from "./app-headless.js";
export {
  BrowserDriver,
  runRecordFromBrowserRecord,
  type BrowserRunRecordLike
} from "./browser.js";
export {
  PackagedDriver,
  stageBackendBundle,
  type PackagedDriverOptions
} from "./packaged.js";
