import type { VideoFrame } from "./realtime-frame.js";

/** Single-slot latest-wins media slot on the realtime bus. */
export interface RealtimeMediaSlot {
  frame: VideoFrame;
  sequence: number;
  receivedAt: number;
}

/** Per-slot counters on the realtime media bus. */
export interface RealtimeMediaBusSlotMetrics {
  framesAccepted: number;
  framesDropped: number;
  lastSequence: number;
}

/**
 * Server-owned media plane API — implemented in `@nodetool/websocket`,
 * typed here so `@nodetool/kernel` / nodes do not depend on the server package.
 */
export interface RealtimeMediaBus {
  setInput(
    sessionId: string,
    nodeId: string,
    handle: string,
    frame: VideoFrame
  ): void;
  getLatestInput(
    sessionId: string,
    nodeId: string,
    handle: string
  ): RealtimeMediaSlot | null;
  setOutput(
    sessionId: string,
    nodeId: string,
    handle: string,
    frame: VideoFrame
  ): void;
  getLatestOutput(
    sessionId: string,
    nodeId: string,
    handle: string
  ): RealtimeMediaSlot | null;
  clearSession(sessionId: string): void;
}
