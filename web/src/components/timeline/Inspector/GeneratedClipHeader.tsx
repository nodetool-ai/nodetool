/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipHeader
 *
 * Displays the clip's name, media type, status badge, duration info,
 * and created/modified timestamps sourced from the latest ClipVersion.
 *
 * PRD §5.4 (Generated clip selected → GeneratedClipPanel) and §5.5 (status mapping).
 */

import React, { memo } from "react";
import type { ClipStatus, TimelineClip } from "@nodetool-ai/timeline";

import type { StatusType } from "../../ui_primitives/StatusIndicator";
import { FlexColumn } from "../../ui_primitives/FlexColumn";
import { FlexRow } from "../../ui_primitives/FlexRow";
import { Label } from "../../ui_primitives/Label";
import { Caption } from "../../ui_primitives/Caption";
import { StatusIndicator } from "../../ui_primitives/StatusIndicator";

// ── Status mapping (PRD §5.5) ─────────────────────────────────────────────

const CLIP_STATUS_MAP: Record<
  ClipStatus,
  { status: StatusType; label: string; pulse: boolean }
> = {
  draft: { status: "default", label: "Draft", pulse: false },
  queued: { status: "pending", label: "Queued", pulse: false },
  generating: { status: "pending", label: "Generating", pulse: true },
  generated: { status: "success", label: "Generated", pulse: false },
  stale: { status: "warning", label: "Stale", pulse: false },
  failed: { status: "error", label: "Failed", pulse: false },
  locked: { status: "info", label: "Locked", pulse: false },
  missing: { status: "error", label: "Missing", pulse: false }
};

// ── Helpers ───────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatTimestamp(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      dateStyle: "short",
      timeStyle: "short"
    });
  } catch {
    return isoString;
  }
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface GeneratedClipHeaderProps {
  clip: TimelineClip;
}

// ── Component ─────────────────────────────────────────────────────────────

export const GeneratedClipHeader: React.FC<GeneratedClipHeaderProps> = memo(
  ({ clip }) => {
    const statusInfo = CLIP_STATUS_MAP[clip.status];

    // Latest version for timestamps
    const latestVersion = clip.versions[clip.versions.length - 1] ?? null;
    const createdAt = latestVersion?.createdAt ?? null;

    // Duration: timeline duration vs generated duration
    const timelineDurationMs = clip.durationMs;
    const generatedDurationMs = latestVersion?.durationMs ?? null;
    const speedMultiplier = clip.speedMultiplier ?? 1;
    const speedBaked = clip.speedBaked ?? false;
    const showBothDurations =
      generatedDurationMs !== null &&
      speedMultiplier !== 1 &&
      !speedBaked;

    return (
      <FlexColumn gap={0.75} sx={{ px: 1, pt: 0.5, pb: 0.5 }}>
        {/* Name + status */}
        <FlexRow align="center" gap={1}>
          <Label sx={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {clip.name}
          </Label>
          <StatusIndicator
            status={statusInfo.status}
            label={statusInfo.label}
            pulse={statusInfo.pulse}
            size="small"
          />
        </FlexRow>

        {/* Type */}
        <Caption color="secondary">
          {clip.mediaType.charAt(0).toUpperCase() + clip.mediaType.slice(1)} · Generated
        </Caption>

        {/* Duration */}
        {showBothDurations && generatedDurationMs !== null ? (
          <FlexRow gap={0.5}>
            <Caption color="secondary">
              Timeline: {formatDuration(timelineDurationMs)}
            </Caption>
            <Caption color="secondary">·</Caption>
            <Caption color="secondary">
              Generated: {formatDuration(generatedDurationMs)}
            </Caption>
            <Caption color="secondary">
              (×{speedMultiplier.toFixed(2)})
            </Caption>
          </FlexRow>
        ) : (
          <Caption color="secondary">
            Duration: {formatDuration(timelineDurationMs)}
          </Caption>
        )}

        {/* Timestamps */}
        {createdAt && (
          <Caption color="secondary">
            Generated: {formatTimestamp(createdAt)}
          </Caption>
        )}
      </FlexColumn>
    );
  }
);

GeneratedClipHeader.displayName = "GeneratedClipHeader";
