import type { SyntheticEvent } from "react";

import {
  Card,
  EditorButton,
  FlexColumn,
  FlexRow,
  NodeSlider,
  Text
} from "../ui_primitives";
import {
  realtimeCardSx,
  realtimeStartControlSx,
  realtimeStopControlSx
} from "./realtimeStyles";

interface RealtimeSessionControlsCardProps {
  brightness: number;
  isStartSessionDisabled: boolean;
  hasPreviewStream: boolean;
  hasActiveSession: boolean;
  previewError: string | null;
  webrtcConfigError: string | null;
  webrtcError: string | null;
  sessionError: string | null;
  onBrightnessChange: (brightness: number) => void;
  onBrightnessCommit: (
    event: Event | SyntheticEvent,
    value: number | number[]
  ) => Promise<void>;
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
  previewError,
  webrtcConfigError,
  webrtcError,
  sessionError,
  onBrightnessChange,
  onBrightnessCommit,
  onStartPreview,
  onStopPreview,
  onStartSession,
  onStopSession
}: RealtimeSessionControlsCardProps) => {
  return (
    <Card padding="normal" variant="outlined" sx={realtimeCardSx}>
      <FlexColumn gap={2}>
        <FlexRow gap={2} align="center" wrap>
          <EditorButton
            onClick={
              hasPreviewStream ? onStopPreview : () => void onStartPreview()
            }
            sx={hasPreviewStream ? realtimeStopControlSx : realtimeStartControlSx}
          >
            {hasPreviewStream ? "Stop Preview" : "Start Preview"}
          </EditorButton>
          <EditorButton
            onClick={
              hasActiveSession
                ? () => void onStopSession()
                : () => void onStartSession()
            }
            disabled={!hasActiveSession && isStartSessionDisabled}
            sx={hasActiveSession ? realtimeStopControlSx : realtimeStartControlSx}
          >
            {hasActiveSession ? "Stop Session" : "Start Session"}
          </EditorButton>
        </FlexRow>

        <FlexColumn gap={0.75} sx={{ maxWidth: 320 }}>
          <Text weight={600}>Brightness: {brightness}</Text>
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
        </FlexColumn>

        {previewError ? <Text color="error">{previewError}</Text> : null}
        {webrtcConfigError ? (
          <Text color="error">{webrtcConfigError}</Text>
        ) : null}
        {webrtcError ? <Text color="error">{webrtcError}</Text> : null}
        {sessionError ? <Text color="error">{sessionError}</Text> : null}
      </FlexColumn>
    </Card>
  );
};
