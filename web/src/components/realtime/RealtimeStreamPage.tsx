import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent
} from "react";
import { useLocation, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  NodeSlider,
  Text,
  EditorButton,
  TextInput
} from "../ui_primitives";
import VideoPreview from "./VideoPreview";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useVideoCapture } from "../../hooks/browser/useVideoCapture";
import { useRealtimeSessionWebRTC } from "../../hooks/browser/useRealtimeSessionWebRTC";
import { useRealtimeSessionStore } from "../../stores/RealtimeSessionStore";

const RealtimeStreamPage = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const location = useLocation();
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);

  const sessions = useRealtimeSessionStore((state) => state.sessions);
  const metrics = useRealtimeSessionStore((state) => state.metrics);
  const activeSessionId = useRealtimeSessionStore((state) => state.activeSessionId);
  const isLoadingSessions = useRealtimeSessionStore((state) => state.isLoading);
  const sessionError = useRealtimeSessionStore((state) => state.error);
  const hydrated = useRealtimeSessionStore((state) => state.hydrated);
  const hydrateSessions = useRealtimeSessionStore((state) => state.hydrateSessions);
  const startSession = useRealtimeSessionStore((state) => state.startSession);
  const updateSession = useRealtimeSessionStore((state) => state.updateSession);
  const stopSession = useRealtimeSessionStore((state) => state.stopSession);
  const setActiveSession = useRealtimeSessionStore(
    (state) => state.setActiveSession
  );

  const [brightness, setBrightness] = useState<number>(100);
  const [videoTargetNodeId, setVideoTargetNodeId] = useState<string>("camera");
  const [videoTargetInputName, setVideoTargetInputName] =
    useState<string>("video");
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
  } = useQuery({
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
  const webrtcRuntimeMode = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get("webrtcRuntime") === "backend" ? "backend" : "loopback";
  }, [location.search]);
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
      enabled: activeSession?.transport === "webrtc" && activeSession.status !== "error",
      runtimeMode: webrtcRuntimeMode
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

  const handleStartSession = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    if (!previewStream) {
      setWebrtcConfigError("Start the camera preview before launching WebRTC.");
      return;
    }

    if (!videoTargetNodeId.trim() || !videoTargetInputName.trim()) {
      setWebrtcConfigError(
        "Set the target node id and input name for the incoming video track."
      );
      return;
    }

    setWebrtcConfigError(null);
    const mediaTracks = previewStream
      .getVideoTracks()
      .map((track) => ({
        track_id: track.id,
        kind: "video" as const,
        label: track.label || "Camera track",
        node_id: videoTargetNodeId.trim(),
        input_name: videoTargetInputName.trim(),
        enabled: true
      }));

    await startSession(workflowId, {
      preview_source: "camera",
      brightness
    }, undefined, {
      transport: "webrtc",
      mediaTracks,
      signaling: {
        status: "idle"
      }
    });
  }, [
    brightness,
    previewStream,
    startSession,
    videoTargetInputName,
    videoTargetNodeId,
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

  return (
    <FlexColumn gap={3} padding={3} fullWidth fullHeight>
      <FlexColumn gap={1}>
        <Text size="big" weight={600}>
          Realtime Session MVP
        </Text>
        <Text color="secondary">
          This first slice adds a dedicated realtime session control plane to
          NodeTool: session lifecycle, live parameter updates, session state,
          and a local camera preview.
        </Text>
      </FlexColumn>

      {!workflowId && (
        <Card padding="normal" variant="outlined">
          <Text>
            Open this page with a workflow id, for example
            <code> /realtime/&lt;workflow-id&gt;</code>, to start a realtime
            session for a workflow.
          </Text>
        </Card>
      )}

      {workflowError && (
        <Card padding="normal" variant="outlined">
          <Text color="error">
            {workflowError instanceof Error
              ? workflowError.message
              : "Failed to load the realtime workflow"}
          </Text>
        </Card>
      )}

      {(isLoadingWorkflow || isLoadingSessions) && (
        <FlexRow justify="center" fullWidth>
          <LoadingSpinner />
        </FlexRow>
      )}

      {workflow && (
        <Card padding="normal" variant="outlined">
          <FlexColumn gap={1}>
            <Text weight={600}>{workflow.name}</Text>
            {workflow.description ? (
              <Text color="secondary">{workflow.description}</Text>
            ) : null}
            <Text color="secondary">
              Workflow id: <code>{workflow.id}</code>
            </Text>
          </FlexColumn>
        </Card>
      )}

      <FlexRow gap={3} align="stretch" sx={{ flexWrap: "wrap" }}>
        <FlexColumn gap={3} sx={{ flex: "1 1 420px", minWidth: 320 }}>
          <VideoPreview stream={previewStream} />
          <VideoPreview
            stream={remoteStream}
            title="WebRTC Runtime Preview"
            emptyText="Start a realtime session to negotiate the WebRTC proof transport and mirror the mapped runtime stream."
          />

          <Card padding="normal" variant="outlined">
            <FlexColumn gap={2}>
              <Text weight={600}>Session Controls</Text>
              <FlexRow gap={2} sx={{ flexWrap: "wrap" }}>
                <EditorButton onClick={startPreview}>
                  Start Camera Preview
                </EditorButton>
                <EditorButton onClick={stopPreview} disabled={!previewStream}>
                  Stop Preview
                </EditorButton>
                <EditorButton
                  onClick={() => void handleStartSession()}
                  disabled={isStartSessionDisabled}
                >
                  Start Realtime Session
                </EditorButton>
                <EditorButton
                  onClick={() => void handleStopSession()}
                  disabled={!activeSession}
                >
                  Stop Session
                </EditorButton>
              </FlexRow>

              <FlexColumn gap={1}>
                <Text weight={600}>Brightness</Text>
                <NodeSlider
                  min={0}
                  max={200}
                  value={brightness}
                  onChange={(_event, value) => {
                    const nextBrightness = Array.isArray(value) ? value[0] : value;
                    setBrightness(nextBrightness);
                  }}
                  onChangeCommitted={handleBrightnessCommit}
                />
                <Text color="secondary">Current value: {brightness}</Text>
              </FlexColumn>

              <FlexColumn gap={1.5}>
                <Text weight={600}>WebRTC Video Track Mapping</Text>
                <Text color="secondary">
                  Map the browser camera track to the realtime workflow node input
                  that should receive the media stream.
                </Text>
                <TextInput
                  label="Target node id"
                  value={videoTargetNodeId}
                  onChange={(event) => setVideoTargetNodeId(event.target.value)}
                  compact
                />
                <TextInput
                  label="Target input name"
                  value={videoTargetInputName}
                  onChange={(event) =>
                    setVideoTargetInputName(event.target.value)
                  }
                  compact
                />
              </FlexColumn>

              {previewError ? <Text color="error">{previewError}</Text> : null}
              {webrtcConfigError ? (
                <Text color="error">{webrtcConfigError}</Text>
              ) : null}
              {webrtcError ? <Text color="error">{webrtcError}</Text> : null}
              {sessionError ? <Text color="error">{sessionError}</Text> : null}
            </FlexColumn>
          </Card>
        </FlexColumn>

        <FlexColumn gap={3} sx={{ flex: "1 1 360px", minWidth: 320 }}>
          <Card padding="normal" variant="outlined">
            <FlexColumn gap={2}>
              <Text weight={600}>Active Session</Text>
              {activeSession ? (
                <>
                  <Text>Session id: {activeSession.session_id}</Text>
                   <Text>Status: {activeSession.status}</Text>
                   <Text>Transport: {activeSession.transport}</Text>
                   <Text color="secondary">
                     Signaling: {activeSession.signaling.status}
                   </Text>
                   <Text color="secondary">
                     Peer connection: {connectionState}
                   </Text>
                   <Text color="secondary">
                     WebRTC runtime: {runtimeMode}
                   </Text>
                   <Text color="secondary">
                     Codec bridge: {codecStatus}
                   </Text>
                   <Text color="secondary">
                     Metrics codec: {activeMetrics?.codec.status ?? "pending"}
                   </Text>
                   <Text color="secondary">
                     Frames: inbound {activeMetrics?.frames.inbound ?? 0}, routed{" "}
                     {activeMetrics?.frames.routed ?? 0}, dropped{" "}
                     {activeMetrics?.queues.total_dropped ?? 0}
                   </Text>
                   <Text color="secondary">
                     FPS: inbound{" "}
                     {(activeMetrics?.rates.inbound_fps ?? 0).toFixed(1)}, routed{" "}
                     {(activeMetrics?.rates.routed_fps ?? 0).toFixed(1)}
                   </Text>
                   <Text color="secondary">
                     Queue depth: {activeMetrics?.queues.total_depth ?? 0}
                   </Text>
                   <Text color="secondary">
                     Local hook state: {signalingStatus}
                   </Text>
                   <Text color="secondary">
                     Job id: {activeSession.job_id ?? "pending"}
                   </Text>
                  <Text color="secondary">
                    Started: {new Date(activeSession.created_at).toLocaleString()}
                  </Text>
                  <Text color="secondary">
                    Updated: {new Date(activeSession.updated_at).toLocaleString()}
                  </Text>
                   <Text color="secondary">
                     Parameters: {JSON.stringify(activeSession.parameters)}
                   </Text>
                   <Text color="secondary">
                     Media tracks: {JSON.stringify(activeSession.media_tracks)}
                   </Text>
                 </>
               ) : (
                <Text color="secondary">
                  No active realtime session for this workflow yet.
                </Text>
              )}
            </FlexColumn>
          </Card>

          <Card padding="normal" variant="outlined">
            <FlexColumn gap={2}>
              <Text weight={600}>Workflow Sessions</Text>
              {workflowSessions.length > 0 ? (
                workflowSessions.map((session) => (
                  <FlexRow
                    key={session.session_id}
                    justify="space-between"
                    align="center"
                    sx={{
                      borderColor: "divider",
                      borderStyle: "solid",
                      borderWidth: 1,
                      borderRadius: 1,
                      padding: 1.5
                    }}
                  >
                    <FlexColumn gap={0.5}>
                      <Text weight={600}>{session.session_id}</Text>
                      <Text color="secondary">{session.status}</Text>
                    </FlexColumn>
                    <EditorButton
                      onClick={() => setActiveSession(session.session_id)}
                      disabled={session.session_id === activeSession?.session_id}
                    >
                      View
                    </EditorButton>
                  </FlexRow>
                ))
              ) : (
                <Text color="secondary">
                  No realtime sessions have been started for this workflow.
                </Text>
              )}
            </FlexColumn>
          </Card>
        </FlexColumn>
      </FlexRow>
    </FlexColumn>
  );
};

export default RealtimeStreamPage;
