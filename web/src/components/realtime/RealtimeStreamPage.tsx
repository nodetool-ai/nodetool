import {
  Card,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text
} from "../ui_primitives";
import VideoPreview from "./VideoPreview";
import { RealtimeModelStatusCard } from "./RealtimeModelStatusCard";
import { RealtimeOutputPreviewCard } from "./RealtimeOutputPreviewCard";
import { RealtimeSessionControlsCard } from "./RealtimeSessionControlsCard";
import { RealtimeSessionDetailsCard } from "./RealtimeSessionDetailsCard";
import { RealtimeSessionListCard } from "./RealtimeSessionListCard";
import { RealtimeWorkflowSummaryCard } from "./RealtimeWorkflowSummaryCard";
import { useRealtimeStreamController } from "./useRealtimeStreamController";

const RealtimeStreamPage = () => {
  const controller = useRealtimeStreamController();

  return (
    <FlexColumn
      gap={3.5}
      fullWidth
      fullHeight
      sx={{
        boxSizing: "border-box",
        minHeight: 0,
        ml: "5em",
        overflow: "hidden",
        px: { xs: 3, md: 6 },
        pl: { xs: 4, md: 7 },
        py: { xs: 3, md: 5 },
        width: "calc(100% - 5em)"
      }}
    >
      <FlexColumn gap={1.5} sx={{ maxWidth: 920 }}>
        <Text size="big" weight={600}>
          Realtime Session Controls
        </Text>
        <Text color="secondary">
          Developer controls for realtime session lifecycle, live parameter
          updates, and camera ingress. The graph editor remains the product path;
          this page is for inspecting and exercising transports.
        </Text>
      </FlexColumn>

      {!controller.workflowId && (
        <Card
          padding="normal"
          variant="outlined"
          sx={(theme) => ({ borderRadius: theme.rounded.xs })}
        >
          <Text>
            Open this page with a workflow id, for example
            <code> /realtime/&lt;workflow-id&gt;</code>, to start a realtime
            session for a workflow.
          </Text>
        </Card>
      )}

      {controller.workflowError && (
        <Card
          padding="normal"
          variant="outlined"
          sx={(theme) => ({ borderRadius: theme.rounded.xs })}
        >
          <Text color="error">
            {controller.workflowError.message ||
              "Failed to load the realtime workflow"}
          </Text>
        </Card>
      )}

      {(controller.isLoadingWorkflow || controller.isLoadingSessions) && (
        <FlexRow justify="center" fullWidth>
          <LoadingSpinner />
        </FlexRow>
      )}

      {controller.workflow ? (
        <RealtimeWorkflowSummaryCard workflow={controller.workflow} />
      ) : null}

      <FlexRow
        gap={4}
        align="stretch"
        wrap
        sx={{ flex: 1, minHeight: 0 }}
      >
        <ScrollArea
          fullHeight
          thin
          sx={{
            flex: "0 1 440px",
            minHeight: 0,
            minWidth: { xs: "100%", md: 360 },
            maxWidth: { lg: 480 },
            pr: 1
          }}
        >
          <FlexColumn gap={2.5}>
            <VideoPreview stream={controller.previewStream} />
            {controller.ingressMode === "webrtc" ? (
              <VideoPreview
                stream={controller.remoteStream}
                title="WebRTC Runtime Preview"
                emptyText="Start a realtime session to negotiate the WebRTC transport and mirror the mapped runtime stream."
              />
            ) : null}

            <RealtimeSessionControlsCard
              brightness={controller.brightness}
              isStartSessionDisabled={controller.isStartSessionDisabled}
              hasPreviewStream={Boolean(controller.previewStream)}
              hasActiveSession={Boolean(controller.activeSession)}
              videoTargetNodeId={controller.videoTargetNodeId}
              videoTargetInputName={controller.videoTargetInputName}
              videoTargetSourceHandle={controller.videoTargetSourceHandle}
              ingressMode={controller.ingressMode}
              cameraPublisherStatus={controller.cameraPublisherStatus}
              previewError={controller.previewError}
              webrtcConfigError={controller.webrtcConfigError}
              webrtcError={controller.webrtcError}
              sessionError={controller.sessionError}
              onBrightnessChange={controller.setBrightness}
              onBrightnessCommit={controller.handleBrightnessCommit}
              onVideoTargetNodeIdChange={controller.setVideoTargetNodeId}
              onVideoTargetInputNameChange={controller.setVideoTargetInputName}
              onStartPreview={controller.startPreview}
              onStopPreview={controller.stopPreview}
              onStartSession={controller.handleStartSession}
              onStopSession={controller.handleStopSession}
            />
          </FlexColumn>
        </ScrollArea>

        <ScrollArea
          fullHeight
          thin
          sx={{
            flex: "1 1 420px",
            minHeight: 0,
            minWidth: { xs: "100%", md: 360 },
            pr: 1
          }}
        >
          <FlexColumn gap={2.5}>
            <RealtimeModelStatusCard
              activeSession={controller.activeSession}
              activeMetrics={controller.activeMetrics}
              activeInferenceMetrics={controller.activeInferenceMetrics}
              activeAnalysisEvents={controller.activeAnalysisEvents}
              cameraPublisherStatus={controller.cameraPublisherStatus}
              isLoadingSessions={controller.isLoadingSessions}
              sessionError={controller.sessionError}
            />
            <RealtimeOutputPreviewCard
              outputFrame={controller.activeOutputFrame}
            />
            <RealtimeSessionDetailsCard
              activeSession={controller.activeSession}
              activeMetrics={controller.activeMetrics}
              signalingStatus={controller.signalingStatus}
              connectionState={controller.connectionState}
              runtimeMode={controller.runtimeMode}
              codecStatus={controller.codecStatus}
            />
            <RealtimeSessionListCard
              activeSessionId={controller.activeSession?.session_id ?? null}
              sessions={controller.workflowSessions}
              onSelectSession={controller.setActiveSession}
            />
          </FlexColumn>
        </ScrollArea>
      </FlexRow>
    </FlexColumn>
  );
};

export default RealtimeStreamPage;
