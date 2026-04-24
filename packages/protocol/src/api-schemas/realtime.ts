import { z } from "zod";

export const realtimeSessionTransport = z.enum(["websocket", "webrtc"]);
export type RealtimeSessionTransport = z.infer<typeof realtimeSessionTransport>;

export const realtimeMediaTrackKind = z.enum(["audio", "video"]);
export type RealtimeMediaTrackKind = z.infer<typeof realtimeMediaTrackKind>;

export const realtimeMediaTrackMapping = z.object({
  track_id: z.string(),
  kind: realtimeMediaTrackKind,
  node_id: z.string(),
  input_name: z.string(),
  label: z.string().nullable().optional(),
  enabled: z.boolean().optional()
});
export type RealtimeMediaTrackMapping = z.infer<typeof realtimeMediaTrackMapping>;

export const realtimeSignalType = z.enum(["offer", "answer", "ice_candidate"]);
export type RealtimeSignalType = z.infer<typeof realtimeSignalType>;

export const realtimeSignalingStatus = z.enum([
  "idle",
  "negotiating",
  "connected",
  "failed"
]);
export type RealtimeSignalingStatus = z.infer<typeof realtimeSignalingStatus>;

export const realtimeSessionSignalingState = z.object({
  status: realtimeSignalingStatus,
  last_signal_type: realtimeSignalType.nullable().optional(),
  last_signal_at: z.string().nullable().optional(),
  error: z.string().nullable().optional()
});
export type RealtimeSessionSignalingState = z.infer<
  typeof realtimeSessionSignalingState
>;

export const realtimeSessionStatus = z.enum([
  "starting",
  "running",
  "stopped",
  "error"
]);
export type RealtimeSessionStatus = z.infer<typeof realtimeSessionStatus>;

export const realtimeSessionRecord = z.object({
  session_id: z.string(),
  workflow_id: z.string().nullable(),
  job_id: z.string().nullable(),
  status: realtimeSessionStatus,
  transport: realtimeSessionTransport,
  parameters: z.record(z.string(), z.unknown()),
  media_tracks: z.array(realtimeMediaTrackMapping),
  signaling: realtimeSessionSignalingState,
  created_at: z.string(),
  updated_at: z.string()
});
export type RealtimeSessionRecord = z.infer<typeof realtimeSessionRecord>;

export const listOutput = z.object({
  sessions: z.array(realtimeSessionRecord)
});
export type ListOutput = z.infer<typeof listOutput>;

export const getInput = z.object({
  id: z.string().min(1)
});
export type GetInput = z.infer<typeof getInput>;
