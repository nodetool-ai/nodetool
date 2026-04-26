import { Card, FlexColumn, FlexRow, LoadingSpinner, Text } from "../ui_primitives";
import VideoPreview from "./VideoPreview";
import { RealtimeSessionControlsCard } from "./RealtimeSessionControlsCard";
import { RealtimeSessionDetailsCard } from "./RealtimeSessionDetailsCard";
import { RealtimeSessionListCard } from "./RealtimeSessionListCard";
import { RealtimeWorkflowSummaryCard } from "./RealtimeWorkflowSummaryCard";
import { useRealtimeStreamController } from "./useRealtimeStreamController";

const RealtimeStreamPage = () => {
  const controller = useRealtimeStreamController();

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

      {!controller.workflowId && (
        <Card padding="normal" variant="outlined">
          <Text>
            Open this page with a workflow id, for example
            <code> /realtime/&lt;workflow-id&gt;</code>, to start a realtime
            session for a workflow.
          </Text>
        </Card>
      )}

      {controller.workflowError && (
        <Card padding="normal" variant="outlined">
          <Text color="error">
            {controller.workflowError.message || "Failed to load the realtime workflow"}
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

      <FlexRow gap={3} align="stretch" sx={{ flexWrap: "wrap" }}>
        <FlexColumn gap={3} sx={{ flex: "1 1 420px", minWidth: 320 }}>
          <VideoPreview stream={controller.previewStream} />
          <VideoPreview
            stream={controller.remoteStream}
            title="WebRTC Runtime Preview"
            emptyText="Start a realtime session to negotiate the WebRTC proof transport and mirror the mapped runtime stream."
          />

          <RealtimeSessionControlsCard
            brightness={controller.brightness}
            isStartSessionDisabled={controller.isStartSessionDisabled}
            hasPreviewStream={Boolean(controller.previewStream)}
            hasActiveSession={Boolean(controller.activeSession)}
            videoTargetNodeId={controller.videoTargetNodeId}
            videoTargetInputName={controller.videoTargetInputName}
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

        <FlexColumn gap={3} sx={{ flex: "1 1 360px", minWidth: 320 }}>
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
      </FlexRow>
    </FlexColumn>
  );
};

export default RealtimeStreamPage;
