import type { Workflow } from "../../stores/ApiTypes";
import type { VideoCaptureResolutionPreset } from "../../hooks/browser/useVideoCapture";

interface WorkflowNodeLike {
  id: string;
  type?: string;
  name?: string | null;
  properties?: Record<string, unknown> | null;
  outputs?: Record<string, unknown> | null;
  is_media_adapter?: boolean | null;
  is_streaming_output?: boolean | null;
}

export interface VideoTrackTarget {
  nodeId: string;
  inputName: string;
  sourceHandle: string;
}

export interface VideoTrackCameraSettings {
  nodeId: string;
  deviceId: string;
  deviceLabel: string;
  resolution: VideoCaptureResolutionPreset;
}

const VIDEO_CAPTURE_RESOLUTION_VALUES = new Set<VideoCaptureResolutionPreset>([
  "qvga",
  "vga",
  "wide480p",
  "hd",
  "fhd"
]);

const getExternalInputName = (node: WorkflowNodeLike): string => {
  if (node.type === "nodetool.video.VideoSource") {
    const source =
      typeof node.properties?.source === "string"
        ? node.properties.source.trim()
        : "";
    return source || "camera";
  }

  const propertyName =
    typeof node.properties?.name === "string" ? node.properties.name.trim() : "";
  return propertyName || node.name || node.id;
};

export const findVideoTrackTarget = (
  workflow: Workflow | undefined
): VideoTrackTarget | null => {
  const nodes = (workflow?.graph?.nodes ?? []) as WorkflowNodeLike[];
  const node = nodes.find((candidate) => {
    const outputTypes = Object.values(candidate.outputs ?? {});
    return (
      candidate.type === "nodetool.video.VideoSource" ||
      (candidate.is_media_adapter === true &&
        candidate.is_streaming_output === true &&
        outputTypes.includes("realtime_video_frame"))
    );
  });

  if (!node) {
    return null;
  }

  return {
    nodeId: node.id,
    inputName: getExternalInputName(node),
    sourceHandle:
      node.type === "nodetool.video.VideoSource" ? "realtime_frame" : "frame"
  };
};

export const findVideoTrackCameraSettings = (
  workflow: Workflow | undefined
): VideoTrackCameraSettings | null => {
  const nodes = (workflow?.graph?.nodes ?? []) as WorkflowNodeLike[];
  const node = nodes.find(
    (candidate) => candidate.type === "nodetool.video.VideoSource"
  );

  if (!node) {
    return null;
  }

  const resolution =
    typeof node.properties?.camera_resolution === "string" &&
    VIDEO_CAPTURE_RESOLUTION_VALUES.has(
      node.properties.camera_resolution as VideoCaptureResolutionPreset
    )
      ? (node.properties.camera_resolution as VideoCaptureResolutionPreset)
      : "hd";

  return {
    nodeId: node.id,
    deviceId:
      typeof node.properties?.camera_device_id === "string"
        ? node.properties.camera_device_id
        : "",
    deviceLabel:
      typeof node.properties?.camera_device_label === "string"
        ? node.properties.camera_device_label
        : "",
    resolution
  };
};
