import type { SyntheticEvent } from "react";

import {
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  NodeSlider,
  Text,
  TextInput
} from "../ui_primitives";

interface RealtimeSessionControlsCardProps {
  brightness: number;
  isStartSessionDisabled: boolean;
  hasPreviewStream: boolean;
  hasActiveSession: boolean;
  videoTargetNodeId: string;
  videoTargetInputName: string;
  previewError: string | null;
  webrtcConfigError: string | null;
  webrtcError: string | null;
  sessionError: string | null;
  onBrightnessChange: (brightness: number) => void;
  onBrightnessCommit: (
    event: Event | SyntheticEvent,
    value: number | number[]
  ) => Promise<void>;
  onVideoTargetNodeIdChange: (nodeId: string) => void;
  onVideoTargetInputNameChange: (inputName: string) => void;
  onStartPreview: () => Promise<void>;
  onStopPreview: () => void;
  onStartSession: () => Promise<void>;
  onStopSession: () => Promise<void>;
}

export const RealtimeSessionControlsCard = ({
  brightness,
  isStartSessionDisabled,
  hasPreviewStream,
  hasActiveSession,
  videoTargetNodeId,
  videoTargetInputName,
  previewError,
  webrtcConfigError,
  webrtcError,
  sessionError,
  onBrightnessChange,
  onBrightnessCommit,
  onVideoTargetNodeIdChange,
  onVideoTargetInputNameChange,
  onStartPreview,
  onStopPreview,
  onStartSession,
  onStopSession
}: RealtimeSessionControlsCardProps) => {
  return (
    <Card padding="normal" variant="outlined">
      <FlexColumn gap={2}>
        <Text weight={600}>Session Controls</Text>
        <FlexRow gap={2} sx={{ flexWrap: "wrap" }}>
          <EditorButton onClick={() => void onStartPreview()}>
            Start Camera Preview
          </EditorButton>
          <EditorButton onClick={onStopPreview} disabled={!hasPreviewStream}>
            Stop Preview
          </EditorButton>
          <EditorButton
            onClick={() => void onStartSession()}
            disabled={isStartSessionDisabled}
          >
            Start Realtime Session
          </EditorButton>
          <EditorButton onClick={() => void onStopSession()} disabled={!hasActiveSession}>
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
              onBrightnessChange(nextBrightness);
            }}
            onChangeCommitted={onBrightnessCommit}
          />
          <Text color="secondary">Current value: {brightness}</Text>
        </FlexColumn>

        <FlexColumn gap={1.5}>
          <Text weight={600}>WebRTC Video Track Mapping</Text>
          <Text color="secondary">
            Map the browser camera track to the realtime workflow node input that
            should receive the media stream.
          </Text>
          <TextInput
            label="Target node id"
            value={videoTargetNodeId}
            onChange={(event) => onVideoTargetNodeIdChange(event.target.value)}
            compact
          />
          <TextInput
            label="Target input name"
            value={videoTargetInputName}
            onChange={(event) => onVideoTargetInputNameChange(event.target.value)}
            compact
          />
        </FlexColumn>

        {previewError ? <Text color="error">{previewError}</Text> : null}
        {webrtcConfigError ? <Text color="error">{webrtcConfigError}</Text> : null}
        {webrtcError ? <Text color="error">{webrtcError}</Text> : null}
        {sessionError ? <Text color="error">{sessionError}</Text> : null}
      </FlexColumn>
    </Card>
  );
};
