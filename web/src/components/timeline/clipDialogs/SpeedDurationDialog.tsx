/**
 * Premiere's Clip Speed/Duration dialog (Ctrl+R). Speed and duration are
 * two views of one number: typing either one updates the other, measured on
 * the first selected clip. "Ripple edit, shifting trailing clips" moves
 * what follows by the change in length instead of capping the clip at the
 * next one. All selected clips take the same speed, in one undo entry.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { sourceRate } from "@nodetool-ai/timeline";

import {
  useTimelineStore,
  useTimelineStoreApi
} from "../../../stores/timeline/TimelineStore";
import { runAsOneUndoEntry } from "../../../stores/timeline/useTimelineHistoryBatch";
import {
  Caption,
  Checkbox,
  Dialog,
  FlexColumn,
  FlexRow,
  NumberField,
  SPACING,
  TextInput
} from "../../ui_primitives";
import { formatTimecode } from "../Inspector/InspectorPrimitives.helpers";
import { parseTimecodeEntry } from "../timecodeEntry";

/** The speed range the speed menu and the rate stretch tool allow, in %. */
const MIN_SPEED_PERCENT = 1;
const MAX_SPEED_PERCENT = 10000;

interface SpeedDurationDialogProps {
  clipIds: readonly string[];
  onClose: () => void;
}

export const SpeedDurationDialog: React.FC<SpeedDurationDialogProps> = memo(
  ({ clipIds, onClose }) => {
    const { t } = useTranslation();
    const docStore = useTimelineStoreApi();
    const fps = useTimelineStore((s) => s.fps);
    const first = useMemo(
      () => docStore.getState().clips.find((c) => c.id === clipIds[0]),
      [docStore, clipIds]
    );
    const firstRate = first ? sourceRate(first) : 1;
    // The source the first clip shows, in timeline ms at 100%.
    const sourceSpanMs = first ? first.durationMs * firstRate : 0;

    const [speedText, setSpeedText] = useState(() =>
      String(Math.round(firstRate * 1000) / 10)
    );
    const [durationText, setDurationText] = useState(() =>
      formatTimecode(first?.durationMs ?? 0, fps)
    );
    const [ripple, setRipple] = useState(false);

    const speedPercent = Number(speedText);
    const speedValid =
      Number.isFinite(speedPercent) &&
      speedPercent >= MIN_SPEED_PERCENT &&
      speedPercent <= MAX_SPEED_PERCENT;

    const handleSpeed = useCallback(
      (raw: string) => {
        setSpeedText(raw);
        const pct = Number(raw);
        if (Number.isFinite(pct) && pct > 0 && sourceSpanMs > 0) {
          setDurationText(formatTimecode(sourceSpanMs / (pct / 100), fps));
        }
      },
      [sourceSpanMs, fps]
    );

    const handleDuration = useCallback(
      (raw: string) => {
        setDurationText(raw);
        const ms = parseTimecodeEntry(raw, fps, first?.durationMs ?? 0);
        if (ms !== null && ms > 0 && sourceSpanMs > 0) {
          setSpeedText(String(Math.round((sourceSpanMs / ms) * 1000) / 10));
        }
      },
      [first, fps, sourceSpanMs]
    );

    const handleConfirm = useCallback(() => {
      if (!speedValid) return;
      const doc = docStore.getState();
      // Later clips first, so a ripple from an earlier one does not move a
      // clip that is still to be retimed past the point it was measured at.
      const ordered = doc.clips
        .filter((c) => clipIds.includes(c.id))
        .sort((a, b) => b.startMs - a.startMs);
      runAsOneUndoEntry(docStore, () => {
        for (const clip of ordered) {
          docStore
            .getState()
            .setClipSpeed(clip.id, speedPercent / 100, { ripple });
        }
      });
      onClose();
    }, [speedValid, docStore, clipIds, speedPercent, ripple, onClose]);

    return (
      <Dialog
        open
        onClose={onClose}
        title={t("batch2_25.speedDuration.title")}
        onConfirm={handleConfirm}
        confirmText={t("batch2_25.common.apply")}
        confirmDisabled={!speedValid}
      >
        <FlexColumn gap={SPACING.lg}>
          <FlexRow gap={SPACING.lg} align="flex-start">
            <NumberField
              label={t("batch2_25.speedDuration.speed")}
              size="small"
              unit="%"
              value={speedText}
              onChange={(e) => handleSpeed(e.target.value)}
              min={MIN_SPEED_PERCENT}
              max={MAX_SPEED_PERCENT}
              step={1}
              errorMessage={
                speedValid
                  ? undefined
                  : t("batch2_25.speedDuration.rangeError", { min: MIN_SPEED_PERCENT, max: MAX_SPEED_PERCENT })
              }
              sx={{ flex: 1 }}
            />
            <TextInput
              label={t("batch2_25.speedDuration.duration")}
              size="small"
              monospace
              value={durationText}
              onChange={(e) => handleDuration(e.target.value)}
              disabled={clipIds.length !== 1}
              sx={{ flex: 1 }}
            />
          </FlexRow>
          <Checkbox
            size="small"
            checked={ripple}
            onChange={(_, checked) => setRipple(checked)}
            label={t("batch2_25.speedDuration.ripple")}
          />
          {clipIds.length > 1 && (
            <Caption color="muted">
              {t("batch2_25.speedDuration.multipleClips", { count: clipIds.length })}
            </Caption>
          )}
        </FlexColumn>
      </Dialog>
    );
  }
);

SpeedDurationDialog.displayName = "SpeedDurationDialog";
