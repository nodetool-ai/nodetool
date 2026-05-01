import type {
  RealtimeAnalysisEvent,
  RealtimeInferenceMetrics,
  RealtimeMetrics,
  RealtimeSessionRecord
} from "@nodetool/protocol";

import {
  Card,
  Caption,
  FlexColumn,
  StatusIndicator,
  Text,
  type StatusType
} from "../ui_primitives";
import type { RealtimeCameraFramePublisherStatus } from "../../hooks/realtime/useRealtimeCameraFramePublisher";
import { realtimeCardSx } from "./realtimeStyles";

interface RealtimeModelStatusCardProps {
  activeSession: RealtimeSessionRecord | null;
  activeMetrics: RealtimeMetrics | null;
  activeInferenceMetrics: RealtimeInferenceMetrics[];
  activeAnalysisEvents: RealtimeAnalysisEvent[];
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  isLoadingSessions: boolean;
  sessionError: string | null;
}

interface RuntimeStatus {
  status: StatusType;
  label: string;
  detail: string;
  pulse: boolean;
}

const latestByCreatedAt = (
  metrics: RealtimeInferenceMetrics[]
): RealtimeInferenceMetrics | null => {
  return metrics.reduce<RealtimeInferenceMetrics | null>((latest, next) => {
    if (!latest) {
      return next;
    }
    return next.created_at > latest.created_at ? next : latest;
  }, null);
};

const runtimeStatus = ({
  activeSession,
  activeMetrics,
  latestInferenceMetrics,
  cameraPublisherStatus,
  isLoadingSessions,
  sessionError
}: {
  activeSession: RealtimeSessionRecord | null;
  activeMetrics: RealtimeMetrics | null;
  latestInferenceMetrics: RealtimeInferenceMetrics | null;
  cameraPublisherStatus: RealtimeCameraFramePublisherStatus;
  isLoadingSessions: boolean;
  sessionError: string | null;
}): RuntimeStatus => {
  if (sessionError) {
    return {
      status: "error",
      label: activeSession ? "Realtime error" : "Startup error",
      detail: sessionError,
      pulse: false
    };
  }

  if (!activeSession) {
    return {
      status: isLoadingSessions ? "info" : "pending",
      label: isLoadingSessions ? "Starting session" : "Not started",
      detail: isLoadingSessions
        ? "Waiting for the realtime session to acknowledge startup."
        : "Press Start Realtime Session to launch the model path.",
      pulse: isLoadingSessions
    };
  }

  if (activeSession.status === "error") {
    return {
      status: "error",
      label: "Session error",
      detail: "The realtime session stopped with an error.",
      pulse: false
    };
  }

  if (latestInferenceMetrics) {
    const loading = latestInferenceMetrics.loading;
    if (loading.status === "error") {
      return {
        status: "error",
        label: "Model error",
        detail: loading.error || "The model reported an inference error.",
        pulse: false
      };
    }

    if (loading.status === "ready") {
      return {
        status: "success",
        label: "Model ready",
        detail: `${latestInferenceMetrics.model.id} on ${latestInferenceMetrics.backend}`,
        pulse: false
      };
    }

    return {
      status: "info",
      label: `Model ${loading.status}`,
      detail: `${latestInferenceMetrics.model.id} on ${latestInferenceMetrics.backend}`,
      pulse: true
    };
  }

  if ((activeMetrics?.frames.routed ?? 0) > 0) {
    return {
      status: "info",
      label: "Frames routed to workflow",
      detail: "Waiting for model inference metrics from the realtime node.",
      pulse: true
    };
  }

  if ((activeMetrics?.frames.unrouted ?? 0) > 0) {
    return {
      status: "warning",
      label: "Frames reached backend, not routed",
      detail: "Check the video track target node, input name, and source handle.",
      pulse: false
    };
  }

  if (cameraPublisherStatus.framesPublished > 0) {
    return {
      status: "warning",
      label: "No backend frame acknowledgements yet",
      detail:
        "The browser is publishing frames, but the session has not reported routed or unrouted frames. Check the WebSocket push-frame ack path and backend routing logs.",
      pulse: true
    };
  }

  if (activeSession.status === "starting") {
    return {
      status: "info",
      label: "Starting realtime session",
      detail: "The session is alive. Heavy models may take several minutes to load and warm.",
      pulse: true
    };
  }

  return {
    status: "warning",
    label: "Session running, no frames yet",
    detail: "Start the camera preview or check the video track mapping.",
    pulse: false
  };
};

export const RealtimeModelStatusCard = ({
  activeSession,
  activeMetrics,
  activeInferenceMetrics,
  activeAnalysisEvents,
  cameraPublisherStatus,
  isLoadingSessions,
  sessionError
}: RealtimeModelStatusCardProps) => {
  const latestInferenceMetrics = latestByCreatedAt(activeInferenceMetrics);
  const currentStatus = runtimeStatus({
    activeSession,
    activeMetrics,
    latestInferenceMetrics,
    cameraPublisherStatus,
    isLoadingSessions,
    sessionError
  });

  return (
    <Card
      padding="normal"
      variant="outlined"
      sx={realtimeCardSx}
    >
      <FlexColumn gap={1.25}>
        <Text weight={600}>Model Runtime Status</Text>
        <StatusIndicator
          status={currentStatus.status}
          label={currentStatus.label}
          pulse={currentStatus.pulse}
          filledIcon
        />
        <Text color="secondary">{currentStatus.detail}</Text>
        <Caption>
          Browser frames: {cameraPublisherStatus.framesPublished.toLocaleString()}
        </Caption>
        <Caption>
          Routed frames: {(activeMetrics?.frames.routed ?? 0).toLocaleString()}
        </Caption>
        <Caption>
          Unrouted frames: {(activeMetrics?.frames.unrouted ?? 0).toLocaleString()}
        </Caption>
        {activeMetrics ? (
          <>
            <Caption>
              Server throughput (est.):{" "}
              {activeMetrics.rates.inbound_fps.toFixed(1)} in fps ·{" "}
              {activeMetrics.rates.outbound_fps.toFixed(1)} out fps
              {activeMetrics.latency.frame_age_ms_avg != null
                ? ` · avg bus slot age ${Math.round(activeMetrics.latency.frame_age_ms_avg)} ms`
                : ""}
            </Caption>
            {activeMetrics.websocket_lanes ? (
              <Caption>
                WebSocket send backlog: control{" "}
                {activeMetrics.websocket_lanes.control_pending} · media{" "}
                {activeMetrics.websocket_lanes.media_pending}
              </Caption>
            ) : null}
            {activeMetrics.frame_sender ? (
              <Caption>
                Egress:{" "}
                {activeMetrics.frame_sender.framesSent.toLocaleString()} wire sends
                {activeMetrics.queues &&
                typeof activeMetrics.queues.total_dropped === "number" &&
                activeMetrics.queues.total_dropped > 0 ? (
                  <>
                    {" "}
                    · {activeMetrics.queues.total_dropped.toLocaleString()} latest-wins
                    drops on media bus
                  </>
                ) : null}
              </Caption>
            ) : null}
            {activeMetrics.media_plane &&
            (Object.keys(activeMetrics.media_plane.inputs).length > 0 ||
              Object.keys(activeMetrics.media_plane.outputs).length > 0) ? (
              <Caption>
                Media bus:{" "}
                {Object.keys(activeMetrics.media_plane.inputs).length} input slot(s) ·{" "}
                {Object.keys(activeMetrics.media_plane.outputs).length} output slot(s)
              </Caption>
            ) : null}
          </>
        ) : null}
        <Caption>
          Inference nodes reporting: {activeInferenceMetrics.length.toLocaleString()}
        </Caption>
        {activeSession ? (
          <>
            <Caption>Session status: {activeSession.status}</Caption>
            <Caption>Job id: {activeSession.job_id ?? "pending"}</Caption>
          </>
        ) : null}
        {latestInferenceMetrics ? (
          <>
            <Caption>
              Latest model: {latestInferenceMetrics.model.id} (
              {latestInferenceMetrics.loading.status}, cache{" "}
              {latestInferenceMetrics.loading.cache})
            </Caption>
            <Caption>
              Throughput:{" "}
              {latestInferenceMetrics.throughput.inference_fps?.toFixed(1) ?? "-"}{" "}
              fps, latency{" "}
              {latestInferenceMetrics.throughput.average_latency_ms?.toFixed(0) ??
                "-"}{" "}
              ms
            </Caption>
          </>
        ) : null}
        <Caption>
          Analysis events: {activeAnalysisEvents.length.toLocaleString()}
        </Caption>
      </FlexColumn>
    </Card>
  );
};
