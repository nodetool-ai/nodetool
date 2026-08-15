import React, { memo } from "react";
import { Caption, FlexRow, ShimmerText, Text } from "../../ui_primitives";
import { useElapsedSince } from "../../../hooks/useElapsedTime";
import {
  formatPredictionElapsed,
  mediaPredictionLabel,
  type ActiveMediaPrediction
} from "../../../core/chat/mediaPrediction";

interface MediaPredictionRowProps {
  prediction: ActiveMediaPrediction;
}

const MediaPredictionRow: React.FC<MediaPredictionRowProps> = memo(
  ({ prediction }) => {
    const elapsed = useElapsedSince(prediction.startedAt);
    const parts = [
      mediaPredictionLabel(prediction.capability),
      prediction.provider,
      prediction.model
    ].filter((part) => part.length > 0);
    return (
      <FlexRow className="chat-status-row" align="center" gap={2} fullWidth>
        <Text
          component="span"
          size="small"
          color="secondary"
          role="status"
          aria-live="polite"
          className="chat-status-label"
        >
          <ShimmerText>{parts.join(" · ")}</ShimmerText>
        </Text>
        <Caption className="chat-status-elapsed" color="muted">
          {formatPredictionElapsed(elapsed)}
        </Caption>
      </FlexRow>
    );
  }
);
MediaPredictionRow.displayName = "MediaPredictionRow";

interface MediaPredictionStatusProps {
  predictions: ActiveMediaPrediction[];
}

export const MediaPredictionStatus: React.FC<MediaPredictionStatusProps> = memo(
  ({ predictions }) => (
    <>
      {predictions.map((prediction) => (
        <div key={prediction.id} className="chat-message-list-item">
          <MediaPredictionRow prediction={prediction} />
        </div>
      ))}
    </>
  )
);
MediaPredictionStatus.displayName = "MediaPredictionStatus";

export const MediaPredictionInline: React.FC<MediaPredictionRowProps> = memo(
  ({ prediction }) => {
    const elapsed = useElapsedSince(prediction.startedAt);
    const parts = [prediction.provider, prediction.model].filter(
      (part) => part.length > 0
    );
    return (
      <FlexRow
        className="media-prediction-inline"
        align="center"
        gap={1}
        fullWidth
      >
        <Text
          component="span"
          size="small"
          color="secondary"
          className="tool-message"
          truncate
        >
          <ShimmerText>
            {mediaPredictionLabel(prediction.capability)}
            {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
          </ShimmerText>
        </Text>
        <Caption className="chat-status-elapsed" color="muted">
          {formatPredictionElapsed(elapsed)}
        </Caption>
      </FlexRow>
    );
  }
);
MediaPredictionInline.displayName = "MediaPredictionInline";
