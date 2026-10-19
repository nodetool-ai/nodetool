/**
 * Premiere's Audio Gain dialog (G): set the selected clips' gain to a value,
 * or move every clip's gain by the same amount so their balance holds. Only
 * clips with sound change, and the whole edit is one undo entry.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { canClipFade } from "@nodetool-ai/timeline";

import { useTimelineStoreApi } from "../../../stores/timeline/TimelineStore";
import {
  Caption,
  Dialog,
  FlexColumn,
  FormField,
  NumberField,
  Radio,
  RadioSet,
  SPACING
} from "../../ui_primitives";

/** The fader range the document schema accepts, in dB. */
const MIN_DB = -120;
const MAX_DB = 24;

type GainMode = "set" | "adjust";

interface AudioGainDialogProps {
  clipIds: readonly string[];
  onClose: () => void;
}

export const AudioGainDialog: React.FC<AudioGainDialogProps> = memo(
  ({ clipIds, onClose }) => {
    const { t } = useTranslation();
    const docStore = useTimelineStoreApi();
    const audible = useMemo(
      () =>
        docStore
          .getState()
          .clips.filter(
            (c) => clipIds.includes(c.id) && canClipFade(c.mediaType)
          ),
      [docStore, clipIds]
    );
    const [mode, setMode] = useState<GainMode>("set");
    const [dbText, setDbText] = useState(() =>
      String(audible[0]?.volumeDb ?? 0)
    );

    const db = Number(dbText);
    const valid =
      dbText.trim() !== "" &&
      Number.isFinite(db) &&
      (mode === "adjust" || (db >= MIN_DB && db <= MAX_DB));

    const handleMode = useCallback(
      (_: React.ChangeEvent<HTMLInputElement>, value: string) => {
        const next: GainMode = value === "adjust" ? "adjust" : "set";
        setMode(next);
        setDbText(next === "adjust" ? "0" : String(audible[0]?.volumeDb ?? 0));
      },
      [audible]
    );

    const handleConfirm = useCallback(() => {
      if (!valid) return;
      docStore.getState().setClipsGain(new Set(clipIds), db, mode);
      onClose();
    }, [valid, docStore, clipIds, db, mode, onClose]);

    return (
      <Dialog
        open
        onClose={onClose}
        title={t("batch2_25.audioGain.title")}
        onConfirm={handleConfirm}
        confirmText={t("batch2_25.common.apply")}
        confirmDisabled={!valid || audible.length === 0}
      >
        <FlexColumn gap={SPACING.lg}>
          <FormField label={t("batch2_25.audioGain.change")}>
            <RadioSet value={mode} onChange={handleMode}>
              <Radio value="set" label={t("batch2_25.audioGain.setGainTo")} size="small" />
              <Radio value="adjust" label={t("batch2_25.audioGain.adjustGainBy")} size="small" />
            </RadioSet>
          </FormField>
          <NumberField
            label={mode === "set" ? t("batch2_25.audioGain.gain") : t("batch2_25.audioGain.change")}
            size="small"
            unit="dB"
            value={dbText}
            onChange={(e) => setDbText(e.target.value)}
            min={mode === "set" ? MIN_DB : undefined}
            max={mode === "set" ? MAX_DB : undefined}
            step={1}
            errorMessage={valid ? undefined : t("batch2_25.audioGain.rangeError", { min: MIN_DB, max: MAX_DB })}
          />
          <Caption color="muted">
            {audible.length === 0
              ? t("batch2_25.audioGain.noAudio")
              : audible.length === 1
                ? t("batch2_25.audioGain.appliesToOne")
                : t("batch2_25.audioGain.appliesToMany", { count: audible.length })}
          </Caption>
        </FlexColumn>
      </Dialog>
    );
  }
);

AudioGainDialog.displayName = "AudioGainDialog";
