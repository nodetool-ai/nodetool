/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import React, { memo, useMemo } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import {
  BORDER_RADIUS,
  FlexRow,
  LoadingSpinner,
  SPACING,
  Text,
  ToolbarIconButton,
  Z_INDEX,
  StatusDot
} from "../../../ui_primitives";
import { RecordingWaveform } from "./RecordingWaveform";

interface VoiceRecordingBarProps {
  levelsRef: React.MutableRefObject<Float32Array>;
  durationMs: number;
  isTranscribing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(Math.max(0, durationMs) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

const styles = (theme: Theme) =>
  css({
    position: "absolute",
    inset: 0,
    zIndex: Z_INDEX.raised,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(SPACING.sm),
    padding: `0 ${theme.spacing(SPACING.sm)}`,
    borderRadius: BORDER_RADIUS.pill,
    backgroundColor: theme.vars.palette.c_overlay_strong,
    backdropFilter: "blur(10px)",

    ".wave-slot": {
      flex: 1,
      minWidth: 0,
      overflow: "hidden"
    },
    ".duration": {
      fontVariantNumeric: "tabular-nums",
      flexShrink: 0
    }
  });

/**
 * What the composer becomes while a voice message is being taken: a live input
 * meter between two decisions — discard on the left, accept on the right.
 */
export const VoiceRecordingBar = memo(function VoiceRecordingBar({
  levelsRef,
  durationMs,
  isTranscribing,
  onConfirm,
  onCancel
}: VoiceRecordingBarProps) {
  const theme = useTheme();
  const cssStyles = useMemo(() => styles(theme), [theme]);

  if (isTranscribing) {
    // The take is already accepted and the run cannot be called back, so the
    // bar holds no controls here — only what the composer is waiting on.
    return (
      <div
        css={cssStyles}
        className="voice-recording-bar"
        role="status"
        aria-label="Transcribing recording"
      >
        <FlexRow className="wave-slot" gap={1} align="center">
          <LoadingSpinner inline size={16} />
          <Text size="small" color="secondary">
            Transcribing…
          </Text>
        </FlexRow>
      </div>
    );
  }

  return (
    <div
      css={cssStyles}
      className="voice-recording-bar"
      role="group"
      aria-label="Voice recording"
    >
      <ToolbarIconButton
        className="voice-cancel"
        aria-label="Discard recording"
        tooltip="Discard recording"
        icon={<CloseOutlinedIcon fontSize="small" />}
        onClick={onCancel}
        variant="error"
      />
      <div className="wave-slot">
        <RecordingWaveform levelsRef={levelsRef} />
      </div>
      <StatusDot tone="error" size="medium" pulse />
      <Text size="small" className="duration">
        {formatDuration(durationMs)}
      </Text>
      <ToolbarIconButton
        className="voice-confirm"
        aria-label="Accept recording"
        tooltip="Accept recording"
        icon={<CheckRoundedIcon fontSize="small" />}
        onClick={onConfirm}
        variant="primary"
      />
    </div>
  );
});
