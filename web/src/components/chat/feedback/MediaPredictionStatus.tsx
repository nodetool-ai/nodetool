import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import { Caption, FlexRow, ShimmerText, Text } from "../../ui_primitives";
import { useElapsedSince } from "../../../hooks/useElapsedTime";
import {
  formatPredictionElapsed,
  type ActiveMediaPrediction
} from "../../../core/chat/mediaPrediction";

interface MediaPredictionRowProps {
  prediction: ActiveMediaPrediction;
}

function predictionLabelKey(capability: string):
  | "i18n-next67.chat.mediaPrediction.generatingImage"
  | "i18n-next67.chat.mediaPrediction.generatingVideo"
  | "i18n-next67.chat.mediaPrediction.generatingAudio"
  | "i18n-next67.chat.mediaPrediction.generating" {
  switch (capability) {
    case "text_to_image":
    case "image_to_image":
      return "i18n-next67.chat.mediaPrediction.generatingImage";
    case "text_to_video":
    case "image_to_video":
    case "reference_to_video":
    case "video_to_video":
    case "lip_sync":
      return "i18n-next67.chat.mediaPrediction.generatingVideo";
    case "text_to_speech":
    case "text_to_music":
      return "i18n-next67.chat.mediaPrediction.generatingAudio";
    default:
      return "i18n-next67.chat.mediaPrediction.generating";
  }
}

const MediaPredictionRow: React.FC<MediaPredictionRowProps> = memo(
  ({ prediction }) => {
    const { t } = useTranslation();
    const elapsed = useElapsedSince(prediction.startedAt);
    const parts = [
      t(predictionLabelKey(prediction.capability)),
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
    const { t } = useTranslation();
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
          className="media-prediction-label"
          truncate
        >
          <ShimmerText>
            {t(predictionLabelKey(prediction.capability))}
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
