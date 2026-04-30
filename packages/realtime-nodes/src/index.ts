import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";
export { AudioSink, AUDIO_SINK_NODES } from "./nodes/audio-sink.js";
export { AudioSource, AUDIO_SOURCE_NODES } from "./nodes/audio-source.js";
export { Parameter, PARAMETER_NODES } from "./nodes/parameter.js";
export { SessionInfo, SESSION_INFO_NODES } from "./nodes/session-info.js";
export {
  VideoPassthrough,
  VIDEO_PASSTHROUGH_NODES
} from "./nodes/video-passthrough.js";
export { VideoSink, VIDEO_SINK_NODES } from "./nodes/video-sink.js";
import { Parameter } from "./nodes/parameter.js";
import { VideoPassthrough } from "./nodes/video-passthrough.js";
import { VideoSink } from "./nodes/video-sink.js";

/**
 * Nodes registered by default on the server and in codegen. MVP keeps video
 * passthrough/sink + parameter only. Audio and session-info nodes stay
 * exported above for Phase 3 / tests; register them explicitly when needed.
 */
export const REALTIME_NODES: readonly NodeClass[] = [
  VideoSink,
  VideoPassthrough,
  Parameter
];

export function registerRealtimeNodes(registry: NodeRegistry): void {
  for (const nodeClass of REALTIME_NODES) {
    registry.register(nodeClass);
  }
}
