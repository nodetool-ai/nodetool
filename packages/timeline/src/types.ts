/**
 * Core timeline types for the NodeTool timeline feature.
 *
 * This module exports all canonical type definitions for sequences, tracks,
 * clips, markers, versions, and status values. No runtime code lives here —
 * runtime helpers (dependency hash, timeline math) live in NOD-297.
 *
 * `paramOverrides` values are typed as `unknown` because they come from
 * heterogeneous Input* nodes and cannot be narrowed further at this layer.
 */

export type ClipStatus =
  | "draft"
  | "queued"
  | "generating"
  | "generated"
  | "stale"
  | "failed"
  | "locked"
  | "missing";

export type BlendMode =
  | "normal"
  | "screen"
  | "multiply"
  | "add"
  | "overlay";

export interface TimelineSequence {
  id: string;
  projectId: string;
  /** Reserved for Slice 3 sequence-as-workflow. */
  workflowId?: string;
  name: string;
  fps: number;
  width: number;
  height: number;
  durationMs: number;
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  markers: TimelineMarker[];
  createdAt: string;
  updatedAt: string;
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: "video" | "audio" | "overlay" | "subtitle";
  index: number;
  visible: boolean;
  locked: boolean;
  muted?: boolean;
  solo?: boolean;
  /** Pixel height of the track row in the timeline UI. */
  heightPx?: number;
}

export interface TimelineClip {
  id: string;
  trackId: string;
  name: string;
  startMs: number;
  durationMs: number;
  inPointMs?: number;
  outPointMs?: number;
  mediaType: "image" | "video" | "audio" | "overlay";
  sourceType: "imported" | "generated";
  workflowId?: string;
  selectedOutputNodeId?: string;
  /** Heterogeneous per-clip parameter overrides for the associated workflow. */
  paramOverrides?: Record<string, unknown>;
  dependencyHash?: string;
  lastGeneratedHash?: string;
  currentAssetId?: string;
  thumbnailAssetId?: string;
  waveformAssetId?: string;
  status: ClipStatus;
  locked: boolean;
  muted?: boolean;
  hidden?: boolean;
  versions: ClipVersion[];
  /** Opacity in the range [0, 1]. Default: 1. */
  opacity?: number;
  blendMode?: BlendMode;
  /** Playback speed multiplier. Default: 1. */
  speedMultiplier?: number;
  /** Whether the speed change has been baked into the asset. */
  speedBaked?: boolean;
  /** Audio volume in dB. Default: 0. */
  volumeDb?: number;
  /** Duration of the fade-in effect in milliseconds. */
  fadeInMs?: number;
  /** Duration of the fade-out effect in milliseconds. */
  fadeOutMs?: number;
}

export interface ClipVersion {
  id: string;
  createdAt: string;
  jobId: string;
  assetId: string;
  workflowUpdatedAt: string;
  dependencyHash: string;
  /** Snapshot of paramOverrides at the time this version was generated. */
  paramOverridesSnapshot: Record<string, unknown>;
  costCredits?: number;
  durationMs?: number;
  status: "success" | "failed" | "cancelled";
  favorite?: boolean;
}

export interface TimelineMarker {
  id: string;
  timeMs: number;
  label: string;
  color?: string;
  note?: string;
}
