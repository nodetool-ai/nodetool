import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type SyntheticEvent
} from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import {
  Card,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  NodeSlider,
  Text,
  EditorButton
} from "../ui_primitives";
import VideoPreview from "./VideoPreview";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useRealtimeSessionStore } from "../../stores/RealtimeSessionStore";

const RealtimeStreamPage = () => {
  const { workflowId } = useParams<{ workflowId?: string }>();
  const fetchWorkflow = useWorkflowManager((state) => state.fetchWorkflow);

  const sessions = useRealtimeSessionStore((state) => state.sessions);
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

  const [previewStream, setPreviewStream] = useState<MediaStream | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [brightness, setBrightness] = useState<number>(100);

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

  useEffect(() => {
    return () => {
      previewStream?.getTracks().forEach((track) => track.stop());
    };
  }, [previewStream]);

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

  useEffect(() => {
    if (activeSession?.parameters.brightness) {
      const nextBrightness = Number(activeSession.parameters.brightness);
      if (Number.isFinite(nextBrightness)) {
        setBrightness(nextBrightness);
      }
    }
  }, [activeSession]);

  const startPreview = useCallback(async () => {
    try {
      setPreviewError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
      setPreviewStream((currentStream) => {
        currentStream?.getTracks().forEach((track) => track.stop());
        return stream;
      });
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Failed to access the camera preview"
      );
    }
  }, []);

  const stopPreview = useCallback(() => {
    setPreviewStream((currentStream) => {
      currentStream?.getTracks().forEach((track) => track.stop());
      return null;
    });
  }, []);

  const handleStartSession = useCallback(async () => {
    if (!workflowId) {
      return;
    }

    if (!previewStream) {
      await startPreview();
    }

    await startSession(workflowId, {
      preview_source: "camera",
      brightness
    });
  }, [brightness, previewStream, startPreview, startSession, workflowId]);

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
                  disabled={!workflowId || Boolean(activeSession)}
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

              {previewError ? <Text color="error">{previewError}</Text> : null}
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
                  <Text color="secondary">
                    Started: {new Date(activeSession.created_at).toLocaleString()}
                  </Text>
                  <Text color="secondary">
                    Updated: {new Date(activeSession.updated_at).toLocaleString()}
                  </Text>
                  <Text color="secondary">
                    Parameters: {JSON.stringify(activeSession.parameters)}
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
