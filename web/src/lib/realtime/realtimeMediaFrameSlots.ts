import type { VideoFrame } from "@nodetool/protocol";

/** Latest egress frame per realtime session (media lane — not React state). */
export interface RealtimeMediaSlotSnapshot {
  frame: VideoFrame;
  sequence: number;
  receivedAtMs: number;
  nodeId: string;
  outputName: string;
}

const slots = new Map<string, RealtimeMediaSlotSnapshot>();

export function writeRealtimeMediaSlot(
  sessionId: string,
  payload: {
    frame: VideoFrame;
    sequence: number;
    nodeId: string;
    outputName: string;
  }
): void {
  slots.set(sessionId, {
    ...payload,
    receivedAtMs: Date.now()
  });
}

export function readRealtimeMediaSlot(
  sessionId: string
): RealtimeMediaSlotSnapshot | undefined {
  return slots.get(sessionId);
}

export function clearRealtimeMediaSlot(sessionId: string): void {
  slots.delete(sessionId);
}
