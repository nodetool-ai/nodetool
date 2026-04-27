import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent
} from "react";
import { useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import type {
  RealtimeMetrics,
  RealtimeSessionRecord,
  RealtimeSignalingStatus,
  RealtimeSessionTransport
} from "@nodetool/protocol";

import type { Workflow } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useVideoCapture } from "../../hooks/browser/useVideoCapture";
import {
  useRealtimeSessionWebRTC,
  type RealtimeWebRTCRuntimeMode
} from "../../hooks/browser/useRealtimeSessionWebRTC";
import { useRealtimeCameraFramePublisher } from "../../hooks/realtime/useRealtimeCameraFramePublisher";
import { useRealtimeControlPlane } from "../../hooks/realtime/useRealtimeControlPlane";

interface VideoTrackTarget {
  nodeId: string;
  inputName: string;
  sourceHandle: string;
}

const getExternalInputName = (node: {
  id: string;
  name?: string | null;
  properties?: Record<string, unknown> | null;
}): string => {
  const propertyName =
    typeof node.properties?.name === "string" ? node.properties.name.trim() : "";
  return propertyName || node.name || node.id;
};

const findVideoTrackTarget = (
  workflow: Workflow | undefined
): VideoTrackTarget | null => {
  const nodes = workflow?.graph?.nodes ?? [];
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

export interface RealtimeStreamController {
  workflowId: string | undefined;
  workflow: Workflow | undefined;
  workflowError: Error | null;
  isLoadingWorkflow: boolean;
  isLoadingSessions: boolean;
  workflowSessions: RealtimeSessionRecord[];
  activeSession: RealtimeSessionRecord | null;
  activeMetrics: RealtimeMetrics | null;
  previewStream: MediaStream | null;
  remoteStream: MediaStream | null;
  signalingStatus: RealtimeSignalingStatus;
  connectionState: RTCPeerConnectionState | "closed";
  runtimeMode: RealtimeWebRTCRuntimeMode;
  codecStatus: "loopback" | "unsupported";
  brightness: number;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  videoTargetSourceHandle: string;
  ingressMode: "frame-push" | "webrtc";
  previewError: string | null;
  webrtcConfigError: string | null;
  webrtcError: string | null;
  sessionError: string | null;
  isStartSessionDisabled: boolean;
  startPreview: () => Promise<void>;
  stopPreview: () => void;
  setBrightness: (brightness: number) => void;
  setVideoTargetNodeId: (nodeId: string) => void;
  setVideoTargetInputName: (inputName: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  handleStartSession: () => Promise<void>;
  handleStopSession: () => Promise<void>;
  handleBrightnessCommit: (
    event: Event | SyntheticEvent,
    value: number | number[]
  ) => Promise<void>;
}

export const useRealtimeStreamController = (): RealtimeStreamController => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const location = useLocation();
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const {
    sessions,
    metrics,
    activeSessionId,
    isLoading: isLoadingSessions,
    error: sessionError,
    hydrated,
    hydrateSessions,
    startSession,
    updateSession,
    stopSession,
    setActiveSession
  } = useRealtimeControlPlane();

  const [brightness, setBrightness] = useState<number>(100);
  const [videoTargetNodeId, setVideoTargetNodeId] = useState<string>("camera");
  const [videoTargetInputName, setVideoTargetInputName] =
    useState<string>("video");
  const [videoTargetSourceHandle, setVideoTargetSourceHandle] =
    useState<string>("frame");
  const [webrtcConfigError, setWebrtcConfigError] = useState<string | null>(null);
  const {
    error: previewError,
    previewStream,
    startPreview,
    stopPreview
  } = useVideoCapture({
    includeAudio: false,
    autoFetchDevices: false
  });

  const {
    data: workflow,
    isLoading: isLoadingWorkflow,
    error: workflowError
  } = useQuery<Workflow | undefined, Error>({
    queryKey: ["realtime-workflow", workflowId],
    queryFn: async () => await fetchWorkflow(workflowId ?? ""),
    enabled: Boolean(workflowId),
    staleTime: 0,
    gcTime: 0,
    retry: false
  });

  useEffect(() => {
    if (!hydrated) {
      void hydrateSessions();
    }
  }, [hydrateSessions, hydrated]);

  const workflowSessions = useMemo(() => {
    return Object.values(sessions).filter(
      (session) => session.workflow_id === (workflowId ?? null)
    );
  }, [sessions, workflowId]);

  const activeSession = useMemo(() => {
    if (activeSessionId && sessions[activeSessionId]) {
      return sessions[activeSessionId];
    }

    return workflowSessions[0] ?? null;
  }, [activeSessionId, sessions, workflowSessions]);
  const activeMetrics = activeSession
    ? metrics[activeSession.session_id] ?? null
    : null;
  const discoveredVideoTrackTarget = useMemo(
    () => findVideoTrackTarget(workflow),
    [workflow]
  );
  const webrtcRuntimeMode = useMemo<RealtimeWebRTCRuntimeMode>(() => {
    const params = new URLSearchParams(location.search);
    return params.get("webrtcRuntime") === "backend" ? "backend" : "loopback";
  }, [location.search]);
  const sessionTransport = useMemo<RealtimeSessionTransport>(() => {
    const params = new URLSearchParams(location.search);
    return params.get("transport") === "webrtc" ? "webrtc" : "websocket";
  }, [location.search]);
  const ingressMode = sessionTransport === "webrtc" ? "webrtc" : "frame-push";
  const {
    remoteStream,
    signalingStatus,
    connectionState,
    runtimeMode,
    codecStatus,
    error: webrtcError
  } = useRealtimeSessionWebRTC({
    sessionId: activeSession?.session_id ?? null,
    workflowId: activeSession?.workflow_id ?? null,
    localStream: previewStream,
    enabled:
      activeSession?.transport === "webrtc" && activeSession.status !== "error",
    runtimeMode: webrtcRuntimeMode
  });
  useRealtimeCameraFramePublisher({
    enabled:
      activeSession?.transport !== "webrtc" &&
      Boolean(activeSession) &&
      Boolean(previewStream),
    previewStream,
    session: activeSession,
    intervalMs: 500,
    maxWidth: 320
  });
  const isStartSessionDisabled = useMemo(() => {
    return (
      !workflowId ||
      Boolean(activeSession) ||
      !previewStream ||
      !videoTargetNodeId.trim() ||
      !videoTargetInputName.trim()
    );
  }, [
    activeSession,
    previewStream,
    videoTargetInputName,
    videoTargetNodeId,
    workflowId
  ]);

  useEffect(() => {
    if (activeSession?.parameters.brightness) {
      const nextBrightness = Number(activeSession.parameters.brightness);
      if (Number.isFinite(nextBrightness)) {
        setBrightness(nextBrightness);
      }
    }
  }, [activeSession]);

  useEffect(() => {
    if (!discoveredVideoTrackTarget) {
      return;
    }

    if (
      videoTargetNodeId === "camera" &&
      videoTargetInputName === "video" &&
      videoTargetSourceHandle === "frame"
    ) {
      setVideoTargetNodeId(discoveredVideoTrackTarget.nodeId);
      setVideoTargetInputName(discoveredVideoTrackTarget.inputName);
      setVideoTargetSourceHandle(discoveredVideoTrackTarget.sourceHandle);
    }
  }, [
    discoveredVideoTrackTarget,
    videoTargetInputName,
    videoTargetNodeId,
    videoTargetSourceHandle
  ]);

  const handleStartSession = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    if (!previewStream) {
      setWebrtcConfigError(
        "Start the camera preview before launching the realtime session."
      );
      return;
    }

    if (!videoTargetNodeId.trim() || !videoTargetInputName.trim()) {
      setWebrtcConfigError(
        "Set the target node id and input name for the incoming video track."
      );
      return;
    }

    setWebrtcConfigError(null);
    const mediaTracks = previewStream.getVideoTracks().map((track) => ({
      track_id: track.id,
      kind: "video" as const,
      label: track.label || "Camera track",
      node_id: videoTargetNodeId.trim(),
      input_name: videoTargetInputName.trim(),
      source_handle: videoTargetSourceHandle.trim() || "frame",
      enabled: true
    }));

    await startSession(
      workflowId,
      {
        preview_source: "camera",
        brightness
      },
      undefined,
      {
        transport: sessionTransport,
        mediaTracks,
        signaling: {
          status: "idle"
        }
      }
    );
  }, [
    brightness,
    previewStream,
    sessionTransport,
    startSession,
    videoTargetInputName,
    videoTargetNodeId,
    videoTargetSourceHandle,
    workflowId
  ]);

  const handleStopSession = useCallback(async () => {
    if (!activeSession) {
      return;
    }

    await stopSession(activeSession.session_id, activeSession.workflow_id);
  }, [activeSession, stopSession]);

  const handleBrightnessCommit = useCallback(
    async (_event: Event | SyntheticEvent, value: number | number[]) => {
      if (!activeSession) {
        return;
      }

      const nextBrightness = Array.isArray(value) ? value[0] : value;
      await updateSession(activeSession.session_id, activeSession.workflow_id, {
        brightness: nextBrightness
      });
    },
    [activeSession, updateSession]
  );

  return {
    workflowId,
    workflow,
    workflowError,
    isLoadingWorkflow,
    isLoadingSessions,
    workflowSessions,
    activeSession,
    activeMetrics,
    previewStream,
    remoteStream,
    signalingStatus,
    connectionState,
    runtimeMode,
    codecStatus,
    brightness,
    videoTargetNodeId,
    videoTargetInputName,
    videoTargetSourceHandle,
    ingressMode,
    previewError,
    webrtcConfigError,
    webrtcError,
    sessionError,
    isStartSessionDisabled,
    startPreview,
    stopPreview,
    setBrightness,
    setVideoTargetNodeId,
    setVideoTargetInputName,
    setActiveSession,
    handleStartSession,
    handleStopSession,
    handleBrightnessCommit
  };
};
