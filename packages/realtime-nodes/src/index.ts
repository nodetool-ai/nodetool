import type { NodeClass, NodeRegistry } from "@nodetool/node-sdk";
export { AudioSink, AUDIO_SINK_NODES } from "./nodes/audio-sink.js";
export { AudioSource, AUDIO_SOURCE_NODES } from "./nodes/audio-source.js";
export { Parameter, PARAMETER_NODES } from "./nodes/parameter.js";
export { SessionInfo, SESSION_INFO_NODES } from "./nodes/session-info.js";
export { VideoSink, VIDEO_SINK_NODES } from "./nodes/video-sink.js";
import { AudioSink } from "./nodes/audio-sink.js";
import { AudioSource } from "./nodes/audio-source.js";
import { Parameter } from "./nodes/parameter.js";
import { SessionInfo } from "./nodes/session-info.js";
import { VideoSink } from "./nodes/video-sink.js";

export const REALTIME_NODES: readonly NodeClass[] = [
  VideoSink,
  AudioSource,
  AudioSink,
  Parameter,
  SessionInfo
];

export function registerRealtimeNodes(registry: NodeRegistry): void {
  for (const nodeClass of REALTIME_NODES) {
    registry.register(nodeClass);
  }
}
