import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SyntheticEvent
} from "react";
import { useLocation, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceMetrics,
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
import {
  useRealtimeCameraFramePublisher,
  DEFAULT_REALTIME_MAX_IN_FLIGHT_FRAMES,
  type RealtimeFramePushMode,
  type RealtimeCameraFramePublisherStatus
} from "../../hooks/realtime/useRealtimeCameraFramePublisher";
import type { VideoCaptureResolutionPreset } from "../../hooks/browser/useVideoCapture";
import { useRealtimeControlPlane } from "../../hooks/realtime/useRealtimeControlPlane";
import type { RealtimeOutputFrame } from "../../stores/RealtimeSessionStore";
import {
  findVideoTrackCameraSettings,
  findVideoTrackTarget
} from "./realtimeTargetDiscovery";

const isStoppableSession = (
  session: RealtimeSessionRecord | null
): session is RealtimeSessionRecord => {
  return session?.status === "starting" || session?.status === "running";
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
  activeInferenceMetrics: RealtimeInferenceMetrics[];
  activeAnalysisEvents: RealtimeAnalysisEvent[];
  activeOutputFrame: RealtimeOutputFrame | null;
  previewStream: MediaStream | null;
  videoTrackSettings: MediaTrackSettings | null;
  videoInputDevices: Array<{ deviceId: string; label: string }>;
  selectedVideoDeviceId: string;
  unavailableVideoDeviceLabel: string | null;
  selectedVideoResolution: VideoCaptureResolutionPreset;
  remoteStream: MediaStream | null;
  signalingStatus: RealtimeSignalingStatus;
  connectionState: RTCPeerConnectionState | "closed";
  runtimeMode: RealtimeWebRTCRuntimeMode;
  codecStatus: "loopback" | "unsupported";
  brightness: number;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  videoTargetSourceHandle: string;
  framePushMode: RealtimeFramePushMode;
  ingressMode: "frame-push" | "webrtc";
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  previewError: string | null;
  webrtcConfigError: string | null;
  webrtcError: string | null;
  sessionError: string | null;
  isStartSessionDisabled: boolean;
  isStopSessionDisabled: boolean;
  isStoppingSession: boolean;
  startPreview: () => Promise<void>;
  stopPreview: () => void;
  refreshDevices: () => void;
  handleVideoDeviceChange: (deviceId: string) => void;
  setBrightness: (brightness: number) => void;
  handleVideoResolutionChange: (resolution: VideoCaptureResolutionPreset) => void;
  setVideoTargetNodeId: (nodeId: string) => void;
  setVideoTargetInputName: (inputName: string) => void;
  setFramePushMode: (mode: RealtimeFramePushMode) => void;
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
  const queryClient = useQueryClient();
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);
  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const {
    sessions,
    metrics,
    inferenceMetrics,
    analysisEvents,
    outputFrames,
    activeSessionId,
    isLoading: isLoadingSessions,
    error: sessionError,
    hydrated,
    hydrateSessions,
    startSession,
    updateSession,
    stopSession,
    removeSession,
    setActiveSession
  } = useRealtimeControlPlane();

  const [brightness, setBrightness] = useState<number>(100);
  const [videoTargetNodeId, setVideoTargetNodeId] = useState<string>("camera");
  const [videoTargetInputName, setVideoTargetInputName] =
    useState<string>("video");
  const [videoTargetSourceHandle, setVideoTargetSourceHandle] =
    useState<string>("frame");
  const [framePushMode, setFramePushMode] =
    useState<RealtimeFramePushMode>("paced");
  const [webrtcConfigError, setWebrtcConfigError] = useState<string | null>(null);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const appliedCameraSettingsKeyRef = useRef<string | null>(null);
  const {
    error: previewError,
    previewStream,
    videoTrackSettings,
    videoInputDevices,
    selectedVideoDeviceId,
    unavailableVideoDeviceLabel,
    selectedVideoResolution,
    isPreviewReady,
    startPreview,
    stopPreview,
    refreshDevices,
    handleVideoDeviceChange,
    handleVideoResolutionChange
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

    return null;
  }, [activeSessionId, sessions]);
  const activeMetrics = activeSession
    ? metrics[activeSession.session_id] ?? null
    : null;
  const activeInferenceMetrics = activeSession
    ? Object.values(inferenceMetrics[activeSession.session_id] ?? {})
    : [];
  const activeAnalysisEvents = activeSession
    ? analysisEvents[activeSession.session_id] ?? []
    : [];
  const activeOutputFrame = activeSession
    ? outputFrames[activeSession.session_id] ?? null
    : null;
  const isStopSessionDisabled = !isStoppableSession(activeSession);
  const discoveredVideoTrackTarget = useMemo(
    () => findVideoTrackTarget(workflow),
    [workflow]
  );
  const videoSourceCameraSettings = useMemo(
    () => findVideoTrackCameraSettings(workflow),
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
  const cameraPublisherStatus = useRealtimeCameraFramePublisher({
    enabled:
      activeSession?.transport !== "webrtc" &&
      Boolean(activeSession) &&
      Boolean(previewStream) &&
      isPreviewReady,
    previewStream,
    session: activeSession,
    framePushMode,
    maxWidth: 320,
    maxInFlightFrames: DEFAULT_REALTIME_MAX_IN_FLIGHT_FRAMES
  });
  const isStartSessionDisabled = useMemo(() => {
    return (
      !workflowId ||
      !workflow?.graph ||
      Boolean(activeSession) ||
      isStoppingSession ||
      !previewStream ||
      !isPreviewReady ||
      !videoTargetNodeId.trim() ||
      !videoTargetInputName.trim()
    );
  }, [
    activeSession,
    isPreviewReady,
    isStoppingSession,
    previewStream,
    videoTargetInputName,
    videoTargetNodeId,
    workflow?.graph,
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

  useEffect(() => {
    if (!videoSourceCameraSettings) {
      return;
    }

    const settingsKey = [
      videoSourceCameraSettings.nodeId,
      videoSourceCameraSettings.deviceId,
      videoSourceCameraSettings.resolution
    ].join(":");
    if (appliedCameraSettingsKeyRef.current === settingsKey) {
      return;
    }

    appliedCameraSettingsKeyRef.current = settingsKey;
    handleVideoDeviceChange(videoSourceCameraSettings.deviceId);
    handleVideoResolutionChange(videoSourceCameraSettings.resolution);
  }, [
    handleVideoDeviceChange,
    handleVideoResolutionChange,
    videoSourceCameraSettings
  ]);

  const persistVideoSourceCameraSettings = useCallback(
    (properties: Record<string, unknown>) => {
      if (!workflow || !videoSourceCameraSettings) {
        return;
      }

      const nextWorkflow: Workflow = {
        ...workflow,
        graph: {
          ...workflow.graph,
          nodes: (workflow.graph?.nodes ?? []).map((node) => {
            if (node.id !== videoSourceCameraSettings.nodeId) {
              return node;
            }

            return {
              ...node,
              properties: {
                ...(node.properties ?? {}),
                ...properties
              }
            };
          }),
          edges: workflow.graph?.edges ?? []
        }
      };

      queryClient.setQueryData(["realtime-workflow", workflowId], nextWorkflow);
      void saveWorkflow(nextWorkflow).catch((error: unknown) => {
        setWebrtcConfigError(
          error instanceof Error
            ? error.message
            : "Failed to save camera settings"
        );
      });
    },
    [queryClient, saveWorkflow, videoSourceCameraSettings, workflow, workflowId]
  );

  const handlePersistedVideoDeviceChange = useCallback(
    (deviceId: string) => {
      const deviceLabel =
        videoInputDevices.find((device) => device.deviceId === deviceId)?.label ??
        "";
      handleVideoDeviceChange(deviceId);
      persistVideoSourceCameraSettings({
        camera_device_id: deviceId,
        camera_device_label: deviceLabel
      });
    },
    [
      handleVideoDeviceChange,
      persistVideoSourceCameraSettings,
      videoInputDevices
    ]
  );

  const handlePersistedVideoResolutionChange = useCallback(
    (resolution: VideoCaptureResolutionPreset) => {
      handleVideoResolutionChange(resolution);
      persistVideoSourceCameraSettings({
        camera_resolution: resolution
      });
    },
    [handleVideoResolutionChange, persistVideoSourceCameraSettings]
  );

  const handleStartSession = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    if (!workflow?.graph) {
      setWebrtcConfigError(
        "Wait for the workflow graph to load before launching the realtime session."
      );
      return;
    }

    if (!previewStream) {
      setWebrtcConfigError(
        "Start the camera preview before launching the realtime session."
      );
      return;
    }

    if (!isPreviewReady) {
      setWebrtcConfigError("Wait for the camera warm-up before launching the realtime session.");
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
      workflow.graph,
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
    isPreviewReady,
    previewStream,
    sessionTransport,
    startSession,
    videoTargetInputName,
    videoTargetNodeId,
    videoTargetSourceHandle,
    workflow,
    workflowId
  ]);

  const handleStopSession = useCallback(async () => {
    if (!isStoppableSession(activeSession)) {
      setActiveSession(null);
      return;
    }

    const session = activeSession;
    const sessionId = session.session_id;
    const sessionWorkflowId = session.workflow_id;
    setIsStoppingSession(true);
    removeSession(sessionId);
    setActiveSession(null);

    window.setTimeout(() => setIsStoppingSession(false), 1000);
    void stopSession(sessionId, sessionWorkflowId)
      .catch((error) => {
        setWebrtcConfigError(
          error instanceof Error
            ? error.message
            : "Failed to stop realtime session"
        );
      })
      .finally(() => setIsStoppingSession(false));
  }, [activeSession, removeSession, setActiveSession, stopSession]);

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
    activeInferenceMetrics,
    activeAnalysisEvents,
    activeOutputFrame,
    previewStream,
    videoTrackSettings,
    videoInputDevices,
    selectedVideoDeviceId,
    unavailableVideoDeviceLabel,
    selectedVideoResolution,
    remoteStream,
    signalingStatus,
    connectionState,
    runtimeMode,
    codecStatus,
    brightness,
    videoTargetNodeId,
    videoTargetInputName,
    videoTargetSourceHandle,
    framePushMode,
    ingressMode,
    cameraPublisherStatus,
    previewError,
    webrtcConfigError,
    webrtcError,
    sessionError,
    isStartSessionDisabled,
    isStopSessionDisabled,
    isStoppingSession,
    startPreview,
    stopPreview,
    refreshDevices,
    setBrightness,
    handleVideoDeviceChange: handlePersistedVideoDeviceChange,
    handleVideoResolutionChange: handlePersistedVideoResolutionChange,
    setVideoTargetNodeId,
    setVideoTargetInputName,
    setFramePushMode,
    setActiveSession,
    handleStartSession,
    handleStopSession,
    handleBrightnessCommit
  };
};
