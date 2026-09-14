import React, { memo, useEffect, useState } from "react";

import {
  isMediaTrackStale,
  mediaTrackCanDriveReframe,
  smartReframeUnavailableClipIds,
  type MediaTrack,
  type TimelineSequence
} from "@nodetool-ai/timeline";

import {
  Caption,
  Checkbox,
  Dialog,
  FlexColumn,
  FlexRow,
  Label,
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
  const [formats, setFormats] = useState<Set<string>>(new Set(["9:16"]));
  const [strategy, setStrategy] = useState<AdaptFormatStrategy>("smart");
  const [safeMarginPercent, setSafeMarginPercent] = useState(10);
  const [trackId, setTrackId] = useState("");
  const { createAdaptations, isCreating, error } =
    useCreateFormatAdaptation(sequence);

  const sequenceWithTracks = sequence
    ? { ...sequence, mediaTracks: [...mediaTracks] }
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
    const clip = sequence?.clips.find((candidate) => candidate.id === track.clipId);
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
    const createdIds = await createAdaptations(options);
    if (createdIds.length > 0) onClose();
  };

  const cannotCreate =
    formats.size === 0 ||
    isCreating ||
    (strategy === "track" && trackId === "");

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Adapt format"
      onConfirm={() => void handleCreate()}
      onCancel={onClose}
      confirmText={
        formats.size > 1 ? "Create adaptations" : "Create adaptation"
      }
      cancelText="Cancel"
      confirmDisabled={cannotCreate}
      isLoading={isCreating}
    >
      <FlexColumn gap={SPACING.lg} sx={{ py: SPACING.md }}>
        <FlexColumn gap={SPACING.xs}>
          <Label>Original</Label>
          <Text size="small">
            {sequence ? `${sequence.width} × ${sequence.height}` : "—"}
          </Text>
        </FlexColumn>

        <FlexColumn gap={SPACING.xs}>
          <Label>Target formats</Label>
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

        <FlexColumn gap={SPACING.xs}>
          <Label>Strategy</Label>
          <RadioSet value={strategy} onChange={handleStrategyChange}>
            <Radio value="center" label="Center" size="small" />
            <Radio
              value="smart"
              label="Smart Reframe"
              size="small"
              disabled={smartUnavailable}
            />
            <Radio
              value="track"
              label="Follow selected object"
              size="small"
              disabled={readyTracks.length === 0}
            />
          </RadioSet>
          {strategy === "track" && (
            <SelectField
              label="Reframe subject"
              value={trackId}
              onChange={setTrackId}
              options={trackOptions}
              size="small"
            />
          )}
          {readyTracks.length === 0 && (
            <Caption color="muted">
              Track a subject first to use “Follow selected object.”
            </Caption>
          )}
          {smartUnavailable && (
            <Caption color="muted">
              Smart Reframe needs a current subject track or authored framing
              for every visual clip. Use Center until those signals exist.
            </Caption>
          )}
        </FlexColumn>

        <FlexColumn gap={SPACING.xs}>
          <FlexRow justify="space-between" align="center">
            <Label>Safe margin</Label>
            <Text size="small">{safeMarginPercent}%</Text>
          </FlexRow>
          <Slider
            value={safeMarginPercent}
            min={0}
            max={30}
            step={1}
            onChange={(_event, value) =>
              setSafeMarginPercent(Array.isArray(value) ? value[0] : value)
            }
            aria-label="Safe margin"
          />
        </FlexColumn>

        {error && <Caption color="error">{error}</Caption>}
        <Caption color="muted">
          New sequences share the source media. The original edit is not resized
          or changed.
        </Caption>
      </FlexColumn>
    </Dialog>
  );
};

export const AdaptFormatDialog = memo(AdaptFormatDialogInternal);
AdaptFormatDialog.displayName = "AdaptFormatDialog";

export default AdaptFormatDialog;
