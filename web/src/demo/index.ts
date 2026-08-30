/**
 * NodeTool demo harness — public surface.
 *
 * A cast is an authored timeline of protocol messages plus the graph they run
 * against. DemoPlayer / DemoEngine replay one deterministically in the real
 * graph UI, for product-demo videos rendered with Remotion.
 *
 * End-to-end flow: author a cast module here → register it in
 * demo/src/casts/registry → `remotion render`. See demo/README.md.
 */
export * from "./castTypes";
export { DemoEngine, seedCastMetadata } from "./demoEngine";
export type { DemoEngineOptions } from "./demoEngine";
export { DemoPlayer } from "./DemoPlayer";
export type { DemoPlayerProps } from "./DemoPlayer";
export { resolveAssetUrls } from "./assetSubstitution";
export { useMediaReadiness } from "./mediaReadiness";
export type { PendingMediaHandler } from "./mediaReadiness";
export { sampleCast } from "./sampleCast";
export { promoTrailerCast } from "./promoTrailerCast";
export { tutorialCast } from "./tutorialCast";
export { connectRunCast } from "./connectRunCast";
export { listGeneratorCast } from "./listGeneratorCast";
export { chatQaCast } from "./chatQaCast";
export { templateMergeCast } from "./templateMergeCast";
export { summarizeCast } from "./summarizeCast";
export { describeImageCast } from "./describeImageCast";
export { cookbookCasts } from "./cookbook";
export { workflowCasts } from "./workflows";
export * from "./chat/chatCastTypes";
export { ChatDemoPlayer } from "./chat/ChatDemoPlayer";
export type { ChatDemoPlayerProps } from "./chat/ChatDemoPlayer";
export { computeChatStateAt, seedChatGlobalState } from "./chat/chatReplay";
export type { ChatReplayState } from "./chat/chatReplay";
export { agentChatCast } from "./chat/agentChatCast";
export * from "./doc";
export { AssistantDock, ASSISTANT_DOCK_WIDTH_PX } from "./assistant/AssistantDock";
export type { AssistantDockProps } from "./assistant/AssistantDock";
export { Model3DDemoSurface } from "./model3d/Model3DDemoSurface";
export type { Model3DDemoSurfaceProps } from "./model3d/Model3DDemoSurface";
export * from "./timeline/timelineCastTypes";
export { TimelineDemoPlayer } from "./timeline/TimelineDemoPlayer";
export type { TimelineDemoPlayerProps } from "./timeline/TimelineDemoPlayer";
export { TimelineDemoEngine, seedTimelineCastAssets } from "./timeline/timelineReplay";
export type { TimelineDemoEngineOptions } from "./timeline/timelineReplay";
export { timelineEditingCast } from "./timeline/timelineEditingCast";
export {
  promoTimelineCast,
  PROMO_PLAYHEAD_MODEL,
  PROMO_PLAYHEAD_PROMPT,
  PROMO_TIMELINE_MARKS,
} from "./timeline/promoTimelineCast";
