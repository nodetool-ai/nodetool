import type React from "react";
import { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import {
  BORDER_RADIUS,
  FlexRow,
  LoadingSpinner,
  SPACING,
  StatusDot,
  Text,
  ToolbarIconButton
} from "../../../ui_primitives";
import { RecordingWaveform } from "./RecordingWaveform";

export interface VoiceRecordingBarProps {
  levelsRef: React.MutableRefObject<Float32Array>;
  durationMs: number;
  isTranscribing: boolean;
  pendingSend?: boolean;
  onCancel: () => void;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Inline voice status strip inside the composer: a cancel (`X`) button on the
 * left paired with either the live recording waveform and timer or the
 * transcription status on the right, leaving the mic and Send buttons exposed.
 */
export const VoiceRecordingBar = memo(function VoiceRecordingBar({
  levelsRef,
  durationMs,
  isTranscribing,
  pendingSend = false,
  onCancel
}: VoiceRecordingBarProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  const cancelLabel = isTranscribing
    ? t(
        "i18n-next54.composer.voice.cancelTranscription",
        "Cancel transcription"
      )
    : t("i18n-next54.composer.voice.discard", "Discard recording");

  const statusLabel = pendingSend
    ? t(
        "i18n-next54.composer.voice.sendingOnceTranscribed",
        "Sending once transcribed…"
      )
    : t("i18n-next54.composer.voice.transcribing", "Transcribing…");

  return (
    <FlexRow
      className="voice-recording-bar"
      role="group"
      aria-label={
        isTranscribing
          ? statusLabel
          : t("i18n-next54.composer.voice.recording", "Voice recording")
      }
      align="center"
      gap={SPACING.sm}
      sx={{
        width: "100%",
        boxSizing: "border-box",
        px: SPACING.sm,
        py: SPACING.xs,
        borderRadius: BORDER_RADIUS.lg,
        backgroundColor: theme.vars.palette.c_overlay,
        border: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <ToolbarIconButton
        className="voice-cancel"
        aria-label={cancelLabel}
        tooltip={cancelLabel}
        icon={<CloseOutlinedIcon fontSize="small" />}
        onClick={onCancel}
        variant="error"
        nodrag={false}
      />

      {isTranscribing ? (
        <FlexRow
          className="wave-slot"
          role="status"
          aria-live="polite"
          gap={SPACING.md}
          align="center"
          sx={{ flex: 1, minWidth: 0 }}
        >
          <LoadingSpinner inline size={16} />
          <Text size="small" color="secondary">
            {statusLabel}
          </Text>
        </FlexRow>
      ) : (
        <>
          <FlexRow
            className="wave-slot"
            align="center"
            sx={{ flex: 1, minWidth: 0, overflow: "hidden" }}
          >
            <RecordingWaveform levelsRef={levelsRef} height={24} />
          </FlexRow>
          <StatusDot tone="error" size="medium" pulse />
          <Text
            size="small"
            className="duration"
            sx={{ fontVariantNumeric: "tabular-nums", flexShrink: 0 }}
          >
            {formatDuration(durationMs)}
          </Text>
        </>
      )}
    </FlexRow>
  );
});
