/**
 * NodeTool demo harness — public surface.
 *
 * Record a real workflow run into a cast (recorder), store it (cast JSON + a
 * folder of pinned assets), and replay it deterministically in the graph UI
 * (DemoPlayer / DemoEngine) for product-demo videos rendered with Remotion.
 */
export * from "./castTypes";
export { DemoEngine, seedCastMetadata } from "./demoEngine";
export type { DemoEngineOptions } from "./demoEngine";
export {
  DemoPlayer,
  default as DemoPlayerDefault,
  useDemoClock,
} from "./DemoPlayer";
export type { DemoPlayerProps } from "./DemoPlayer";
export { CastRecorder, downloadCastJson } from "./recorder";
export type {
  StartRecordingOptions,
  StopRecordingOptions,
} from "./recorder";
export {
  collectAndRewriteAssets,
  resolveAssetUrls,
} from "./assetSubstitution";
export type { CollectedAssets } from "./assetSubstitution";
export { sampleCast } from "./sampleCast";
