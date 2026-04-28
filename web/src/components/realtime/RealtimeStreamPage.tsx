import {
  Card,
  CollapsibleSection,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ScrollArea,
  Text
} from "../ui_primitives";
import VideoPreview from "./VideoPreview";
import { RealtimeCameraSetupCard } from "./RealtimeCameraSetupCard";
import { RealtimeModelStatusCard } from "./RealtimeModelStatusCard";
import { RealtimeOutputPreviewCard } from "./RealtimeOutputPreviewCard";
import { RealtimeSessionControlsCard } from "./RealtimeSessionControlsCard";
import { RealtimeSessionDetailsCard } from "./RealtimeSessionDetailsCard";
import { RealtimeSessionListCard } from "./RealtimeSessionListCard";
import { RealtimeWorkflowSummaryCard } from "./RealtimeWorkflowSummaryCard";
import { realtimeCardSx } from "./realtimeStyles";
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
      <FlexColumn gap={1} sx={{ maxWidth: 760 }}>
        <Text size="big" weight={600}>
          Realtime Session
        </Text>
        <Text color="secondary">
          Start the camera, run the realtime workflow, and watch generated output.
        </Text>
      </FlexColumn>

      {!controller.workflowId && (
        <Card
          padding="normal"
          variant="outlined"
          sx={realtimeCardSx}
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
          sx={realtimeCardSx}
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

      <RealtimeSessionControlsCard
        brightness={controller.brightness}
        isStartSessionDisabled={controller.isStartSessionDisabled}
        hasPreviewStream={Boolean(controller.previewStream)}
        hasActiveSession={Boolean(controller.activeSession)}
        previewError={controller.previewError}
        webrtcConfigError={controller.webrtcConfigError}
        webrtcError={controller.webrtcError}
        sessionError={controller.sessionError}
        onBrightnessChange={controller.setBrightness}
        onBrightnessCommit={controller.handleBrightnessCommit}
        onStartPreview={controller.startPreview}
        onStopPreview={controller.stopPreview}
        onStartSession={controller.handleStartSession}
        onStopSession={controller.handleStopSession}
      />

      <FlexRow gap={4} align="stretch" wrap sx={{ flex: 1, minHeight: 0 }}>
        <ScrollArea
          fullHeight
          thin
          sx={{
            flex: "1 1 620px",
            minHeight: 0,
            minWidth: { xs: "100%", md: 420 },
            pr: 1
          }}
        >
          <FlexColumn gap={2.5}>
            <FlexRow
              gap={2.5}
              align="stretch"
              wrap
              sx={{
                "& > *": {
                  flex: "1 1 320px",
                  minWidth: 0
                }
              }}
            >
              <VideoPreview stream={controller.previewStream} />
              <RealtimeOutputPreviewCard
                outputFrame={controller.activeOutputFrame}
              />
              {controller.ingressMode === "webrtc" ? (
                <VideoPreview
                  stream={controller.remoteStream}
                  title="WebRTC Runtime Preview"
                  emptyText="Waiting for WebRTC runtime video."
                />
              ) : null}
            </FlexRow>
          </FlexColumn>
        </ScrollArea>

        <ScrollArea
          fullHeight
          thin
          sx={{
            flex: "0 1 440px",
            minHeight: 0,
            minWidth: { xs: "100%", md: 360 },
            pr: 1
          }}
        >
          <FlexColumn gap={2.5}>
            <RealtimeCameraSetupCard
              selectedVideoResolution={controller.selectedVideoResolution}
              videoTrackSettings={controller.videoTrackSettings}
              videoTargetNodeId={controller.videoTargetNodeId}
              videoTargetInputName={controller.videoTargetInputName}
              videoTargetSourceHandle={controller.videoTargetSourceHandle}
              ingressMode={controller.ingressMode}
              cameraPublisherStatus={controller.cameraPublisherStatus}
              onVideoResolutionChange={controller.handleVideoResolutionChange}
              onVideoTargetNodeIdChange={controller.setVideoTargetNodeId}
              onVideoTargetInputNameChange={controller.setVideoTargetInputName}
            />
            <RealtimeModelStatusCard
              activeSession={controller.activeSession}
              activeMetrics={controller.activeMetrics}
              activeInferenceMetrics={controller.activeInferenceMetrics}
              activeAnalysisEvents={controller.activeAnalysisEvents}
              cameraPublisherStatus={controller.cameraPublisherStatus}
              isLoadingSessions={controller.isLoadingSessions}
              sessionError={controller.sessionError}
            />
            <CollapsibleSection
              title={<Text weight={600}>Session Debug</Text>}
              defaultOpen={false}
              compact
            >
              <FlexColumn gap={2.5}>
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
            </CollapsibleSection>
          </FlexColumn>
        </ScrollArea>
      </FlexRow>
    </FlexColumn>
  );
};

export default RealtimeStreamPage;
