import React, { memo, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  isMediaTrackStale,
  mediaTrackCanDriveReframe,
  smartReframeUnavailableClipIds,
  type MediaTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import { useTimelineStore } from "../../stores/timeline/TimelineStore";
import {
  AlertBanner,
  Caption,
  Checkbox,
  Dialog,
  FlexColumn,
  FlexRow,
  FormField,
  Radio,
  RadioSet,
  SelectField,
  Slider,
  SPACING,
  Text
} from "../ui_primitives";
import {
  type AdaptFormatStrategy,
  type CreateFormatAdaptationOptions,
  useCreateFormatAdaptation
} from "../../hooks/timeline/useCreateFormatAdaptation";

const FORMAT_OPTIONS = [
  { value: "9:16", label: "9:16", dimensions: "1080 × 1920" },
  { value: "1:1", label: "1:1", dimensions: "1080 × 1080" },
  { value: "4:5", label: "4:5", dimensions: "1080 × 1350" }
] as const;

interface AdaptFormatDialogProps {
  open: boolean;
  onClose: () => void;
  sequence: TimelineSequence | undefined;
  mediaTracks: readonly MediaTrack[];
}

const AdaptFormatDialogInternal: React.FC<AdaptFormatDialogProps> = ({
  open,
  onClose,
  sequence,
  mediaTracks
}) => {
  const { t } = useTranslation();
  const [formats, setFormats] = useState<Set<string>>(new Set(["9:16"]));
  const [strategy, setStrategy] = useState<AdaptFormatStrategy>("smart");
  const [safeMarginPercent, setSafeMarginPercent] = useState(10);
  const [trackId, setTrackId] = useState("");
  const { createAdaptations, isCreating, error } =
    useCreateFormatAdaptation(sequence);

  // The query's sequence is the one loaded when the editor opened; the clips
  // come from the live document so edits since then count.
  const clips = useTimelineStore((state) => state.clips);
  const sequenceWithTracks = sequence
    ? { ...sequence, clips, mediaTracks: [...mediaTracks] }
    : undefined;
  const smartUnavailable = Boolean(
    sequenceWithTracks &&
      smartReframeUnavailableClipIds(sequenceWithTracks).length > 0
  );

  useEffect(() => {
    if (!open) return;
    setFormats(new Set(["9:16"]));
    setStrategy(smartUnavailable ? "center" : "smart");
    setSafeMarginPercent(10);
    setTrackId("");
  }, [open, smartUnavailable]);

  const readyTracks = mediaTracks.filter((track) => {
    const clip = clips.find((candidate) => candidate.id === track.clipId);
    return (
      mediaTrackCanDriveReframe(track) &&
      clip !== undefined &&
      !isMediaTrackStale(track, clip)
    );
  });
  const trackOptions = readyTracks.map((track) => ({
    value: track.id,
    label: track.name
  }));

  const toggleFormat = (format: string): void => {
    setFormats((current) => {
      const next = new Set(current);
      if (next.has(format)) next.delete(format);
      else next.add(format);
      return next;
    });
  };

  const handleStrategyChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ): void => {
    const value = event.target.value;
    if (value === "center" || value === "smart" || value === "track") {
      setStrategy(value);
    }
  };

  const handleCreate = async (): Promise<void> => {
    const options: CreateFormatAdaptationOptions = {
      aspectRatios: [...formats],
      strategy,
      safeMargin: safeMarginPercent / 100
    };
    if (trackId) {
      options.trackId = trackId;
    }
    const { createdAspectRatios, failures } = await createAdaptations(options);
    if (failures.length === 0 && createdAspectRatios.length > 0) {
      onClose();
      return;
    }
    // Keep the dialog open on a partial failure, with only the formats that
    // still need creating selected, so a retry cannot duplicate the rest.
    if (createdAspectRatios.length > 0) {
      setFormats((current) => {
        const next = new Set(current);
        for (const ratio of createdAspectRatios) next.delete(ratio);
        return next;
      });
    }
  };

  const cannotCreate =
    formats.size === 0 ||
    isCreating ||
    (strategy === "track" && trackId === "");

  const strategyHelp =
    [
      readyTracks.length === 0
        ? t("i18n-next3.timeline.adaptFormat.trackUnavailable")
        : undefined,
      smartUnavailable
        ? t("i18n-next3.timeline.adaptFormat.smartUnavailable")
        : undefined
    ]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("i18n-next3.timeline.adaptFormat.title")}
      onConfirm={() => void handleCreate()}
      confirmText={
        formats.size > 1 ? t("i18n-next3.timeline.adaptFormat.createPlural", { count: formats.size }) : t("i18n-next3.timeline.adaptFormat.createSingular")
      }
      confirmDisabled={cannotCreate}
      isLoading={isCreating}
    >
      <FlexColumn gap={SPACING.lg}>
        <FormField label={t("i18n-next3.timeline.adaptFormat.original")}>
          <Text size="small">
            {sequence ? `${sequence.width} × ${sequence.height}` : "—"}
          </Text>
        </FormField>

        <FormField label={t("i18n-next3.timeline.adaptFormat.targetFormats")}>
          <FlexColumn gap={SPACING.xs}>
            {FORMAT_OPTIONS.map((format) => (
              <Checkbox
                key={format.value}
                size="small"
                checked={formats.has(format.value)}
                onChange={() => toggleFormat(format.value)}
                label={`${format.label} — ${format.dimensions}`}
              />
            ))}
          </FlexColumn>
        </FormField>

        <FormField label={t("i18n-next3.timeline.adaptFormat.strategy")} helperText={strategyHelp}>
          <RadioSet value={strategy} onChange={handleStrategyChange}>
            <Radio value="center" label={t("i18n-next3.timeline.adaptFormat.center")} size="small" />
            <Radio
              value="smart"
              label={t("i18n-next3.timeline.adaptFormat.smartReframe")}
              size="small"
              disabled={smartUnavailable}
            />
            <Radio
              value="track"
              label={t("i18n-next3.timeline.adaptFormat.followObject")}
              size="small"
              disabled={readyTracks.length === 0}
            />
          </RadioSet>
        </FormField>
        {strategy === "track" && (
          <SelectField
            label={t("i18n-next3.timeline.adaptFormat.reframeSubject")}
            value={trackId}
            onChange={setTrackId}
            options={trackOptions}
            size="small"
          />
        )}

        <FormField label={t("i18n-next3.timeline.adaptFormat.safeMargin")}>
          <FlexRow gap={SPACING.lg} align="center">
            <Slider
              value={safeMarginPercent}
              min={0}
              max={30}
              step={1}
              onChange={(_event, value) =>
                setSafeMarginPercent(Array.isArray(value) ? value[0] : value)
              }
              aria-label={t("i18n-next3.timeline.adaptFormat.safeMargin")}
              sx={{ flex: 1 }}
            />
            <Text size="small">{safeMarginPercent}%</Text>
          </FlexRow>
        </FormField>

        {error && <AlertBanner severity="error">{error}</AlertBanner>}
        <Caption color="muted">
          {t("i18n-next3.timeline.adaptFormat.note")}
        </Caption>
      </FlexColumn>
    </Dialog>
  );
};

export const AdaptFormatDialog = memo(AdaptFormatDialogInternal);
AdaptFormatDialog.displayName = "AdaptFormatDialog";

export default AdaptFormatDialog;
