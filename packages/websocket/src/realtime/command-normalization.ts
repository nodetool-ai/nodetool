import type {
  VideoFrame,
  VideoPixelFormat,
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
    const sourceHandle =
      typeof record.source_handle === "string"
        ? record.source_handle.trim()
        : "";
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
      source_handle: sourceHandle || null,
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

const videoPixelFormats = new Set<VideoPixelFormat>([
  "rgba8",
  "rgb8",
  "jpeg",
  "yuv420p",
  "nv12"
]);

function validateJpegBitstream(data: Uint8Array): void {
  if (
    data.length < 4 ||
    data[0] !== 0xff ||
    data[1] !== 0xd8 ||
    data[2] !== 0xff
  ) {
    throw new Error("JPEG missing SOI marker");
  }
  let endMarker = false;
  for (let i = data.length - 2; i >= 0; i--) {
    if (data[i] === 0xff && data[i + 1] === 0xd9) {
      endMarker = true;
      break;
    }
  }
  if (!endMarker) {
    throw new Error("JPEG missing EOI marker");
  }
}

const normalizeFrameBytes = (value: unknown): Uint8Array => {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value) && value.every((item) => Number.isInteger(item))) {
    return new Uint8Array(value as number[]);
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => /^\d+$/.test(key) && Number.isInteger(item))
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    if (entries.length > 0) {
      return new Uint8Array(entries.map(([, item]) => Number(item)));
    }
  }
  throw new Error("frame.data must be bytes");
};

const normalizePositiveInteger = (
  value: unknown,
  fieldName: string
): number => {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new Error(`frame.${fieldName} must be a positive integer`);
  }
  return Number(value);
};

const normalizeNonNegativeInteger = (
  value: unknown,
  fieldName: string
): number => {
  if (typeof value === "bigint") {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`frame.${fieldName} must be a non-negative safe integer`);
    }
    return Number(value);
  }

  if (!Number.isInteger(value) || Number(value) < 0) {
    throw new Error(`frame.${fieldName} must be a non-negative integer`);
  }
  return Number(value);
};

export const normalizeRealtimeVideoFrame = (value: unknown): VideoFrame => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("frame must be an object");
  }

  const record = value as Record<string, unknown>;
  if (record.type !== "realtime_video_frame") {
    throw new Error("frame.type must be realtime_video_frame");
  }

  const pixelFormat = record.pixel_format;
  if (
    typeof pixelFormat !== "string" ||
    !videoPixelFormats.has(pixelFormat as VideoPixelFormat)
  ) {
    throw new Error("frame.pixel_format is unsupported");
  }

  const data = normalizeFrameBytes(record.data);

  if (pixelFormat === "jpeg") {
    validateJpegBitstream(data);
    return {
      type: "realtime_video_frame",
      data,
      width: normalizePositiveInteger(record.width, "width"),
      height: normalizePositiveInteger(record.height, "height"),
      stride: data.byteLength,
      pixel_format: "jpeg",
      timestamp_ns: normalizeNonNegativeInteger(
        record.timestamp_ns,
        "timestamp_ns"
      ),
      sequence: normalizeNonNegativeInteger(record.sequence, "sequence")
    };
  }

  return {
    type: "realtime_video_frame",
    data,
    width: normalizePositiveInteger(record.width, "width"),
    height: normalizePositiveInteger(record.height, "height"),
    stride: normalizePositiveInteger(record.stride, "stride"),
    pixel_format: pixelFormat as VideoPixelFormat,
    timestamp_ns: normalizeNonNegativeInteger(
      record.timestamp_ns,
      "timestamp_ns"
    ),
    sequence: normalizeNonNegativeInteger(record.sequence, "sequence")
  };
};
