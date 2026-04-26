import {
  validateRealtimeInferencePlacement,
  type RealtimeInferenceBackend,
  type RealtimeInferenceEngine,
  type RealtimeInferencePlacement
} from "@nodetool/protocol";
import type { NodeMetadata } from "../stores/ApiTypes";

export interface RealtimeNodeBadge {
  label: string;
  tone: "info" | "warning" | "success";
}

export interface RealtimeNodePlacementSelection {
  placement: RealtimeInferencePlacement;
  engine: RealtimeInferenceEngine;
  backend: RealtimeInferenceBackend;
}

export interface RealtimeNodePlacementValidation {
  valid: boolean;
  reasons: string[];
}

export function getRealtimeNodeBadges(metadata: NodeMetadata): RealtimeNodeBadge[] {
  const profile = metadata.realtime_profile;
  if (!metadata.is_realtime_capable && !profile) {
    return [];
  }

  const badges: RealtimeNodeBadge[] = [];
  if (profile?.browser_capable) {
    badges.push({ label: "Browser local", tone: "success" });
  }
  if (profile?.requires_browser_frame) {
    badges.push({ label: "Camera frame", tone: "info" });
  }
  if (profile?.requires_webgpu) {
    badges.push({ label: "WebGPU", tone: "warning" });
  }
  if (profile?.emits_analysis_event) {
    badges.push({ label: "Analysis event", tone: "info" });
  }
  if (profile?.emits_parameter_update) {
    badges.push({ label: "Parameter update", tone: "info" });
  }
  if (profile?.emits_media_frame) {
    badges.push({ label: "Media frame", tone: "info" });
  }

  return badges;
}

export function validateRealtimeNodePlacement(
  metadata: NodeMetadata,
  selection: RealtimeNodePlacementSelection
): RealtimeNodePlacementValidation {
  return validateRealtimeInferencePlacement({
    placement: selection.placement,
    engine: selection.engine,
    backend: selection.backend,
    profile: metadata.realtime_profile
  });
}
