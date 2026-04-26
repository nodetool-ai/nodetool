import type {
  RealtimeMediaTrackKind,
  RealtimeMediaTrackMapping,
  RealtimeSessionSignalingState,
  RealtimeSessionTransport,
  RealtimeSignalPeer
} from "@nodetool/protocol";
import type {
  NormalizedRealtimeSignal,
  WorkflowGraphPayload
} from "./command-handler-types.js";

export const normalizeParameters = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
};

export const normalizeTransport = (value: unknown): RealtimeSessionTransport => {
  return value === "webrtc" ? "webrtc" : "websocket";
};

export const normalizeMediaTracks = (
  value: unknown
): RealtimeMediaTrackMapping[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalizedTracks: RealtimeMediaTrackMapping[] = [];
  for (const track of value) {
    if (!track || typeof track !== "object" || Array.isArray(track)) {
      continue;
    }

    const record = track as Record<string, unknown>;
    const trackId =
      typeof record.track_id === "string" ? record.track_id.trim() : "";
    const nodeId =
      typeof record.node_id === "string" ? record.node_id.trim() : "";
    const inputName =
      typeof record.input_name === "string" ? record.input_name.trim() : "";
    const kind: RealtimeMediaTrackKind =
      record.kind === "audio" ? "audio" : "video";

    if (!trackId || !nodeId || !inputName) {
      continue;
    }

    normalizedTracks.push({
      track_id: trackId,
      kind,
      node_id: nodeId,
      input_name: inputName,
      label: typeof record.label === "string" ? record.label : null,
      enabled: record.enabled !== false
    });
  }

  return normalizedTracks;
};

export const normalizeSignalingState = (
  value: unknown
): Partial<RealtimeSessionSignalingState> | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const status = record.status;
  const validStatus =
    status === "idle" ||
    status === "negotiating" ||
    status === "connected" ||
    status === "failed"
      ? status
      : undefined;

  const signaling: Partial<RealtimeSessionSignalingState> = {};
  if (validStatus) {
    signaling.status = validStatus;
  }
  if (
    record.last_signal_type === "offer" ||
    record.last_signal_type === "answer" ||
    record.last_signal_type === "ice_candidate"
  ) {
    signaling.last_signal_type = record.last_signal_type;
  }
  if (typeof record.last_signal_at === "string") {
    signaling.last_signal_at = record.last_signal_at;
  }
  if (typeof record.error === "string" || record.error === null) {
    signaling.error = record.error;
  }

  return Object.keys(signaling).length > 0 ? signaling : undefined;
};

export const normalizeSignal = (
  value: unknown
): NormalizedRealtimeSignal | undefined => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const signalType = record.signal_type;
  if (
    signalType !== "offer" &&
    signalType !== "answer" &&
    signalType !== "ice_candidate"
  ) {
    return undefined;
  }

  const source: RealtimeSignalPeer =
    record.source === "runtime" ? "runtime" : "operator";
  const target: RealtimeSignalPeer =
    record.target === "operator" ? "operator" : "runtime";

  const normalizedSignal: NormalizedRealtimeSignal = {
    signal_type: signalType,
    source,
    target
  };

  if (
    (signalType === "offer" || signalType === "answer") &&
    record.description &&
    typeof record.description === "object" &&
    !Array.isArray(record.description)
  ) {
    const descriptionRecord = record.description as Record<string, unknown>;
    const sdp =
      typeof descriptionRecord.sdp === "string" ? descriptionRecord.sdp : "";
    const descriptionType = descriptionRecord.type;
    if (
      sdp &&
      ((signalType === "offer" && descriptionType === "offer") ||
        (signalType === "answer" && descriptionType === "answer"))
    ) {
      normalizedSignal.description = {
        type: descriptionType,
        sdp
      };
    }
  }

  if (
    signalType === "ice_candidate" &&
    record.candidate &&
    typeof record.candidate === "object" &&
    !Array.isArray(record.candidate)
  ) {
    const candidateRecord = record.candidate as Record<string, unknown>;
    const iceCandidateValue =
      typeof candidateRecord.candidate === "string"
        ? candidateRecord.candidate
        : "";
    if (iceCandidateValue) {
      normalizedSignal.candidate = {
        candidate: iceCandidateValue,
        sdpMid:
          typeof candidateRecord.sdpMid === "string" ||
          candidateRecord.sdpMid === null
            ? candidateRecord.sdpMid
            : null,
        sdpMLineIndex:
          typeof candidateRecord.sdpMLineIndex === "number"
            ? candidateRecord.sdpMLineIndex
            : null
      };
    }
  }

  if (
    (signalType === "offer" || signalType === "answer") &&
    !normalizedSignal.description
  ) {
    return undefined;
  }

  if (signalType === "ice_candidate" && !normalizedSignal.candidate) {
    return undefined;
  }

  return normalizedSignal;
};

export const normalizeGraph = (
  value: unknown
): WorkflowGraphPayload | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    throw new Error("graph must be an object with nodes and edges arrays");
  }
  if (Array.isArray(value)) {
    throw new Error("graph must be an object, not an array");
  }
  if (typeof value !== "object") {
    throw new Error("graph must be an object with nodes and edges arrays");
  }

  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.nodes) || !Array.isArray(record.edges)) {
    throw new Error("graph must include nodes and edges arrays");
  }

  return {
    nodes: record.nodes.map((node) => ({ ...(node as Record<string, unknown>) })),
    edges: record.edges.map((edge) => ({ ...(edge as Record<string, unknown>) }))
  };
};
