/** @jsxImportSource @emotion/react */
/**
 * GeneratedClipHeader
 *
 * Compact identity row for a generated clip: the clip name, a status badge,
 * and a single dotted metadata line (type · duration · when). Timestamps come
 * from the latest ClipVersion.
 *
 * PRD §5.4 (Generated clip selected → GeneratedClipPanel) and §5.5 (status mapping).
 */

import React, { memo } from "react";
import type { ClipStatus, TimelineClip } from "@nodetool-ai/timeline";

import type { StatusType } from "../../ui_primitives/StatusIndicator";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  StatusIndicator,
  FONT_WEIGHT
} from "../../ui_primitives";
import { relativeTime } from "../../../utils/formatDateAndTime";

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

const capitalize = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

// ── Types ─────────────────────────────────────────────────────────────────

export interface GeneratedClipHeaderProps {
  clip: TimelineClip;
}

// ── Component ─────────────────────────────────────────────────────────────

export const GeneratedClipHeader: React.FC<GeneratedClipHeaderProps> = memo(
  ({ clip }) => {
    const statusInfo = CLIP_STATUS_MAP[clip.status];

    const latestVersion = clip.versions[clip.versions.length - 1] ?? null;

    const timelineDurationMs = clip.durationMs;
    const generatedDurationMs = latestVersion?.durationMs ?? null;
    const speedMultiplier = clip.speedMultiplier ?? 1;
    const speedBaked = clip.speedBaked ?? false;
    const showBothDurations =
      generatedDurationMs !== null && speedMultiplier !== 1 && !speedBaked;

    // One dotted meta line: type · duration · when. The status badge already
    // says "Generated", so the metadata never repeats it.
    const metaParts: string[] = [capitalize(clip.mediaType)];
    if (showBothDurations && generatedDurationMs !== null) {
      metaParts.push(
        `${formatDuration(timelineDurationMs)} (src ${formatDuration(
          generatedDurationMs
        )} ×${speedMultiplier.toFixed(2)})`
      );
    } else {
      metaParts.push(formatDuration(timelineDurationMs));
    }
    if (latestVersion?.createdAt) {
      metaParts.push(relativeTime(latestVersion.createdAt));
    }

    return (
      <FlexColumn gap={0.5} sx={{ px: 1, pt: 1, pb: 0.5 }}>
        <FlexRow align="center" gap={1}>
          <Text
            sx={{
              flex: 1,
              fontWeight: FONT_WEIGHT.medium,
              color: "text.primary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap"
            }}
          >
            {clip.name}
          </Text>
          <StatusIndicator
            status={statusInfo.status}
            label={statusInfo.label}
            pulse={statusInfo.pulse}
            size="small"
          />
        </FlexRow>

        <Caption color="secondary">{metaParts.join(" · ")}</Caption>
      </FlexColumn>
    );
  }
);

GeneratedClipHeader.displayName = "GeneratedClipHeader";
