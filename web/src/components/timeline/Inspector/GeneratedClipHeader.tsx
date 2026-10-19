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
import { useTranslation } from "react-i18next";
import type { ClipStatus, TimelineClip } from "@nodetool-ai/timeline";

import { GENERATION_STATUS } from "../../ui_primitives";
import {
  FlexColumn,
  FlexRow,
  Text,
  Caption,
  StatusIndicator,
  FONT_WEIGHT,
  SPACING
} from "../../ui_primitives";

// ── Status mapping (PRD §5.5), shared with sketch layers ──────────────────

const CLIP_STATUS_MAP = GENERATION_STATUS satisfies Record<ClipStatus, unknown>;
const STATUS_LABEL_KEYS: Record<ClipStatus, string> = {
  draft: "pass3_28.timeline.inspector.generatedClipHeader.status.draft",
  queued: "pass3_28.timeline.inspector.generatedClipHeader.status.queued",
  generating:
    "pass3_28.timeline.inspector.generatedClipHeader.status.generating",
  generated: "pass3_28.timeline.inspector.generatedClipHeader.status.generated",
  stale: "pass3_28.timeline.inspector.generatedClipHeader.status.stale",
  failed: "pass3_28.timeline.inspector.generatedClipHeader.status.failed",
  locked: "pass3_28.timeline.inspector.generatedClipHeader.status.locked",
  missing: "pass3_28.timeline.inspector.generatedClipHeader.status.missing"
};

const MEDIA_TYPE_LABEL_KEYS: Record<string, string> = {
  audio: "pass3_28.timeline.inspector.generatedClipHeader.mediaType.audio",
  image: "pass3_28.timeline.inspector.generatedClipHeader.mediaType.image",
  video: "pass3_28.timeline.inspector.generatedClipHeader.mediaType.video"
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

function formatRelativeTime(date: Date | string, locale: string): string {
  const timestamp = date instanceof Date ? date : new Date(date);
  const differenceMs = timestamp.getTime() - new Date().getTime();
  const absoluteSeconds = Math.abs(differenceMs) / 1000;
  if (absoluteSeconds < 30) {
    return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
      0,
      "second"
    );
  }
  const units = [
    { limitSeconds: 60, milliseconds: 1000, unit: "second" as const },
    { limitSeconds: 3600, milliseconds: 60_000, unit: "minute" as const },
    { limitSeconds: 86_400, milliseconds: 3_600_000, unit: "hour" as const },
    { limitSeconds: 604_800, milliseconds: 86_400_000, unit: "day" as const },
    {
      limitSeconds: 2_629_746,
      milliseconds: 604_800_000,
      unit: "week" as const
    },
    {
      limitSeconds: 31_556_952,
      milliseconds: 2_629_746_000,
      unit: "month" as const
    },
    {
      limitSeconds: Number.POSITIVE_INFINITY,
      milliseconds: 31_556_952_000,
      unit: "year" as const
    }
  ];
  const selected =
    units.find((candidate) => absoluteSeconds < candidate.limitSeconds) ??
    units[units.length - 1];
  const value = Math.round(differenceMs / selected.milliseconds);
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    value,
    selected.unit
  );
}

// ── Types ─────────────────────────────────────────────────────────────────

interface GeneratedClipHeaderProps {
  clip: TimelineClip;
}

// ── Component ─────────────────────────────────────────────────────────────

export const GeneratedClipHeader: React.FC<GeneratedClipHeaderProps> = memo(
  ({ clip }) => {
    const { t, i18n } = useTranslation();
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
    const metaParts: string[] = [
      MEDIA_TYPE_LABEL_KEYS[clip.mediaType]
        ? t(MEDIA_TYPE_LABEL_KEYS[clip.mediaType])
        : capitalize(clip.mediaType)
    ];
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
      metaParts.push(
        formatRelativeTime(latestVersion.createdAt, i18n.language)
      );
    }

    return (
      <FlexColumn
        gap={SPACING.xs}
        sx={{ px: SPACING.md, pt: SPACING.md, pb: SPACING.xs }}
      >
        <FlexRow align="center" gap={SPACING.md}>
          <Text
            size="small"
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
            label={t(STATUS_LABEL_KEYS[clip.status])}
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
