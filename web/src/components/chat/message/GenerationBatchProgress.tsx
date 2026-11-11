/**
 * The progress of one `generate_batch` call: a bar with the time left, which
 * unfolds into one row per request.
 *
 * Live state comes from the batch store. After a reload the store is empty,
 * so the call's own result (which carries the final `batch`) draws it.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import ScheduleIcon from "@mui/icons-material/Schedule";
import type { GenerationBatchItem } from "@nodetool-ai/protocol";

import {
  useGenerationBatchStore,
  type GenerationBatchState
} from "../../../stores/GenerationBatchStore";
import {
  Box,
  Caption,
  Collapse,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ProgressBar,
  ResponsiveImage,
  Text,
  VideoPlayer,
  AudioPlayback,
  BORDER_RADIUS,
  MOTION,
  SPACING,
  reducedMotion
} from "../../ui_primitives";
import { generationBatchProgress } from "../../../utils/generationBatchProgress";
import { formatDuration } from "../../../utils/formatUtils";
import { isRecord } from "../../../utils/typePredicates";

const THUMB_HEIGHT = 72;
const TICK_MS = 1000;

/** The final batch a finished call returned, or null when its result has none. */
export function batchFromResult(content: unknown): GenerationBatchState | null {
  let value = content;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  const batch = isRecord(value) ? value["batch"] : null;
  if (!isRecord(batch) || !Array.isArray(batch["items"])) return null;
  const concurrency = typeof batch["concurrency"] === "number" ? batch["concurrency"] : 1;
  return { concurrency, items: batch["items"] as GenerationBatchItem[] };
}

const seconds = (value: number): string => formatDuration(value * 1000) ?? "0s";

const StatusIcon: React.FC<{ status: GenerationBatchItem["status"] }> = ({ status }) => {
  if (status === "running") return <LoadingSpinner inline size={14} />;
  const Icon =
    status === "completed" ? CheckCircleOutlineIcon : status === "failed" ? ErrorOutlineIcon : ScheduleIcon;
  return (
    <Icon
      aria-hidden
      sx={{
        fontSize: "inherit",
        color: status === "completed" ? "success.main" : status === "failed" ? "error.main" : "text.disabled"
      }}
    />
  );
};

const ItemPreview: React.FC<{ item: GenerationBatchItem }> = ({ item }) => {
  if (!item.uri) return null;
  const kind = item.media_type ?? item.tool;
  if (kind === "audio" || item.tool === "generate_speech" || item.tool === "generate_music") {
    return <AudioPlayback locator={item.uri} />;
  }
  if (kind === "video" || item.tool === "generate_video" || item.tool === "animate_image") {
    return (
      <Box sx={{ width: THUMB_HEIGHT * 2, borderRadius: BORDER_RADIUS.sm, overflow: "hidden" }}>
        <VideoPlayer locator={item.uri} label={item.label} muted loop hoverControls />
      </Box>
    );
  }
  return (
    <Box sx={{ width: THUMB_HEIGHT, height: THUMB_HEIGHT }}>
      <ResponsiveImage
        locator={item.uri}
        preferThumbnail
        alt={item.label}
        fit="cover"
        borderRadius={BORDER_RADIUS.sm}
      />
    </Box>
  );
};

const ItemRow: React.FC<{ item: GenerationBatchItem; now: number }> = ({ item, now }) => {
  const { t } = useTranslation();
  const timing =
    item.started_at != null && item.finished_at != null
      ? t("generationBatch.took", { time: seconds((item.finished_at - item.started_at) / 1000) })
      : item.status === "running" && item.started_at != null
        ? `${seconds(Math.max(0, (now - item.started_at) / 1000))} / ${seconds(item.estimate_seconds)}`
        : t("generationBatch.expected", { time: seconds(item.estimate_seconds) });
  const model = [item.provider, item.model].filter(Boolean).join(":");
  return (
    <FlexRow gap={SPACING.sm} align="flex-start" fullWidth>
      <FlexRow align="center" sx={{ pt: SPACING.xxs, flexShrink: 0 }}>
        <StatusIcon status={item.status} />
      </FlexRow>
      <FlexColumn gap={SPACING.xxs} sx={{ minWidth: 0, flex: 1 }}>
        <FlexRow gap={SPACING.sm} align="center" fullWidth>
          <Text size="small" truncate sx={{ minWidth: 0 }}>
            {item.label}
          </Text>
          <Box sx={{ flex: 1 }} />
          <Caption component="span" sx={{ flexShrink: 0 }}>
            {t(`generationBatch.status.${item.status}`)} · {timing}
          </Caption>
        </FlexRow>
        {model ? <Caption component="span">{model}</Caption> : null}
        {item.prompt ? (
          <Caption component="span" sx={{ color: "text.secondary" }}>
            {item.prompt}
          </Caption>
        ) : null}
        {item.error ? (
          <Caption component="span" sx={{ color: "error.main" }}>
            {item.error}
          </Caption>
        ) : null}
        <ItemPreview item={item} />
      </FlexColumn>
    </FlexRow>
  );
};

export interface GenerationBatchProgressProps {
  toolCallId: string;
  /** The call's result, read when the store has no live state for it. */
  resultContent?: unknown;
}

export const GenerationBatchProgress: React.FC<GenerationBatchProgressProps> = ({
  toolCallId,
  resultContent
}) => {
  const { t } = useTranslation();
  const live = useGenerationBatchStore((state) => state.batches[toolCallId]);
  const fallback = useMemo(() => (live ? null : batchFromResult(resultContent)), [live, resultContent]);
  const batch = live ?? fallback;
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const active = !!batch?.items.some((item) => item.status === "queued" || item.status === "running");

  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [active]);

  const toggle = useCallback(() => setOpen((value) => !value), []);
  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((value) => !value);
    }
  }, []);

  if (!batch || batch.items.length === 0) return null;
  const progress = generationBatchProgress(batch.items, batch.concurrency, now);
  const status =
    progress.remainingSeconds === null
      ? null
      : progress.remainingSeconds <= 1
        ? t("generationBatch.finishing")
        : t("generationBatch.remaining", { time: seconds(progress.remainingSeconds) });

  return (
    <FlexColumn gap={SPACING.xs} fullWidth sx={{ mt: SPACING.xs }}>
      <FlexColumn
        gap={SPACING.xs}
        fullWidth
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? t("generationBatch.hideRequests") : t("generationBatch.showRequests")}
        onClick={toggle}
        onKeyDown={onKeyDown}
        sx={{
          cursor: "pointer",
          borderRadius: BORDER_RADIUS.sm,
          p: SPACING.xs,
          mx: -SPACING.xs,
          "&:hover": { bgcolor: "action.hover" },
          "&:focus-visible": { outline: "2px solid", outlineColor: "primary.main" }
        }}
      >
        <FlexRow gap={SPACING.sm} align="center" fullWidth>
          <Text size="small" component="span">
            {t("generationBatch.summary", { done: progress.done, total: progress.total })}
          </Text>
          {progress.failed > 0 ? (
            <Caption component="span" sx={{ color: "error.main" }}>
              {t("generationBatch.failedCount", { count: progress.failed })}
            </Caption>
          ) : null}
          <Box sx={{ flex: 1 }} />
          {status ? <Caption component="span">{status}</Caption> : null}
          <ExpandMoreIcon
            aria-hidden
            sx={{
              fontSize: "inherit",
              color: "text.disabled",
              transform: open ? "rotate(180deg)" : "none",
              transition: MOTION.transform,
              ...reducedMotion({ transition: MOTION.none })
            }}
          />
        </FlexRow>
        <ProgressBar
          value={progress.percent}
          size="small"
          aria-label={t("generationBatch.progressLabel")}
        />
      </FlexColumn>
      <Collapse in={open} timeout="auto" unmountOnExit>
        <FlexColumn gap={SPACING.sm} fullWidth>
          {batch.items.map((item) => (
            <ItemRow key={item.id} item={item} now={now} />
          ))}
        </FlexColumn>
      </Collapse>
    </FlexColumn>
  );
};
