/**
 * Step 1 of the video flow — the idea (PRD § 8.1).
 *
 * One sentence, written straight onto the sequence's `setup.brief` as it is
 * typed, so `Continue` has only the stage left to write and a reload resumes
 * with the text intact (D1, D3).
 *
 * The three alternatives are the ways in that skip the writing: bring footage
 * you already have, start from a script, or open an empty timeline. Dropping
 * media places clips before any beat exists (criterion 1) — the plan then
 * describes the footage rather than inventing shots over it.
 *
 * The card is named "Drop your media", so the step is a drop target as well as
 * a picker: files dropped anywhere on it are imported in drop order. What
 * landed and what could not be placed is listed afterwards, and footage
 * dropped with no brief keeps the creator here, because step 2 ends in a
 * planner that refuses an empty one.
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  GAP,
  ResponsiveImage,
  Text,
  TextInput
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useEntities } from "../../../serverState/useEntities";
import { useSetupMediaImport } from "../../../hooks/timeline/useSetupMediaImport";
import type { SetupMediaImportResult } from "../../../hooks/timeline/useSetupMediaImport";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { useVideoSetupContext } from "./setupContext";

/** How wide a carried reference thumbnail is drawn. */
const REFERENCE_THUMBNAIL = "48px";

/** How many example loglines are offered as inspiration (PRD § 8.1). */
const INSPIRATION_COUNT = 3;

/** What the media picker takes: the three kinds a timeline track can hold. */
export const MEDIA_ACCEPT = "video/*,audio/*,image/*";

/** The same three kinds, for files that arrive by drop rather than by picker. */
const isMediaFile = (file: File): boolean =>
  /^(video|audio|image)\//.test(file.type);

export interface IdeaStepProps {
  /** Opens an empty timeline — the flow's escape hatch, stage `done`. */
  onStartBlank: () => void;
  /**
   * Hands the brief to the script flow (E3), which sends it back finished.
   * Absent on a host that cannot open a script: the card is then offered
   * disabled with the reason, never enabled with nothing behind it.
   */
  onStartFromScript?: () => void;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  onStartFromScript
}) => {
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const setSetup = useTimelineStore((state) => state.setSetup);
  const { importFiles, importing } = useSetupMediaImport();
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState<SetupMediaImportResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const { data: examples } = useExampleStoryboards();
  // What the project composer was holding when the Video card was clicked
  // (F4). Shown so the creator can see it arrived rather than guessing.
  const { references, entityIds } = useVideoSetupContext();
  const { data: entities } = useEntities();
  const carriedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup({ brief: event.target.value });
    },
    [setSetup]
  );

  const runImport = useCallback(
    async (files: readonly File[]) => {
      if (files.length === 0) {
        return;
      }
      setError(null);
      try {
        // Drop order is the cut order, so the files are uploaded and placed in
        // the order they arrived.
        const result = await importFiles(files);
        setImported(result);
        if (!result.advanced) {
          briefField.current?.focus();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [importFiles]
  );

  const handlePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await runImport(files);
    },
    [runImport]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) {
      return;
    }
    event.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      setDragging(false);
      const media = files.filter(isMediaFile);
      if (media.length === 0) {
        setError("Drop video, audio or images. Nothing else goes on a track.");
        return;
      }
      await runImport(media);
    },
    [runImport]
  );

  // There are no shipped example timelines to draw from, so the inspiration
  // lines are the shipped boards' briefs: sentences somebody actually typed to
  // get finished footage, which beats an invented example.
  const inspirations = useMemo(
    () =>
      (examples ?? [])
        .map((example) => example.logline.trim())
        .filter((logline) => logline.length > 0)
        .slice(0, INSPIRATION_COUNT),
    [examples]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "media",
        title: "Drop your media",
        description: "Video, audio and images land on the timeline in order",
        onSelect: () => mediaInput.current?.click(),
        disabled: importing,
        disabledReason: importing ? "Uploading your files…" : undefined
      },
      {
        id: "script",
        title: "Start from a script",
        description: "Write the words first, then send them to the timeline",
        onSelect: onStartFromScript ?? (() => undefined),
        disabled: !onStartFromScript,
        disabledReason: onStartFromScript
          ? undefined
          : "Not available here. Start a script from the project screen."
      },
      {
        id: "blank",
        title: "Start with a blank timeline",
        description: "Skip the plan and cut it yourself",
        onSelect: onStartBlank
      }
    ],
    [importing, onStartBlank, onStartFromScript]
  );

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start",
        borderRadius: BORDER_RADIUS.md,
        outline: dragging ? "2px dashed" : "none",
        outlineColor: "primary.main"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            What&apos;s the video?
          </Text>
          <Text size="normal" color="secondary">
            We&apos;ll plan the beats and cut it on the timeline.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={4}
          label="Your video"
          hideLabel
          placeholder="One sentence is enough."
          onChange={handleChange}
          inputRef={briefField}
        />

        {dragging ? (
          <Caption color="secondary" role="status">
            Drop to place your media on the timeline.
          </Caption>
        ) : null}

        {error ? (
          <AlertBanner severity="error" onClose={() => setError(null)}>
            {error}
          </AlertBanner>
        ) : null}

        {imported ? (
          <AlertBanner
            severity={imported.skipped.length > 0 ? "warning" : "info"}
            onClose={() => setImported(null)}
          >
            <FlexColumn gap={GAP.micro}>
              <Text size="normal" component="span">
                {`Placed ${imported.placed.length} file${
                  imported.placed.length === 1 ? "" : "s"
                } on the timeline${
                  imported.advanced ? "" : ". Say what to make of it below."
                }`}
              </Text>
              {imported.placed.length > 0 ? (
                <Caption component="span" color="secondary">
                  {imported.placed.map((asset) => asset.name).join(" · ")}
                </Caption>
              ) : null}
              {imported.skipped.length > 0 ? (
                <Caption component="span" color="secondary">
                  {`No track takes ${imported.skipped
                    .map((asset) => asset.name)
                    .join(" · ")}. Video, audio and images only.`}
                </Caption>
              ) : null}
            </FlexColumn>
          </AlertBanner>
        ) : null}

        {references.length > 0 || entityIds.length > 0 ? (
          <FlexColumn
            gap={GAP.tight}
            role="group"
            aria-label="Carried from your project screen"
          >
            <Caption color="muted">From your project screen</Caption>
            {references.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {references.map((reference) => (
                  <ResponsiveImage
                    key={reference.uri}
                    locator={reference.uri}
                    alt={reference.name ?? "Reference image"}
                    fit="cover"
                    borderRadius={BORDER_RADIUS.sm}
                    showErrorFallback
                    sx={{
                      width: REFERENCE_THUMBNAIL,
                      height: REFERENCE_THUMBNAIL
                    }}
                  />
                ))}
              </FlexRow>
            ) : null}
            {carriedEntities.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {carriedEntities.map((entity) => (
                  <Chip key={entity.id} label={entity.name} size="small" />
                ))}
              </FlexRow>
            ) : null}
          </FlexColumn>
        ) : null}

        <ExampleBriefs
          examples={inspirations}
          brief={brief}
          onSelect={(value) => setSetup({ brief: value })}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        multiple
        ref={mediaInput}
        accept={MEDIA_ACCEPT}
        aria-label="Drop your media"
        onChange={handlePicked}
      />
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "VideoIdeaStep";

export default IdeaStep;
