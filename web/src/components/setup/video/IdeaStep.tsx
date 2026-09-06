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
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import {
  AlertBanner,
  Box,
  Caption,
  Chip,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useSetupMediaImport } from "../../../hooks/timeline/useSetupMediaImport";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";

/** How many example loglines are offered as inspiration (PRD § 8.1). */
const INSPIRATION_COUNT = 3;

/** What the media picker takes: the three kinds a timeline track can hold. */
export const MEDIA_ACCEPT = "video/*,audio/*,image/*";

export interface IdeaStepProps {
  /** Opens an empty timeline — the flow's escape hatch, stage `done`. */
  onStartBlank: () => void;
  /** Hands the brief to the script flow (E3), which sends it back finished. */
  onStartFromScript: () => void;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  onStartFromScript
}) => {
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const setSetup = useTimelineStore((state) => state.setSetup);
  const { importFiles, importing } = useSetupMediaImport();
  const [error, setError] = useState<string | null>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const { data: examples } = useExampleStoryboards();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup({ brief: event.target.value });
    },
    [setSetup]
  );

  const handlePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      if (files.length === 0) {
        return;
      }
      setError(null);
      try {
        // Drop order is the cut order, so the files are uploaded and placed in
        // the order they were picked.
        await importFiles(files);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [importFiles]
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
        onSelect: onStartFromScript
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
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start"
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
        />

        {error ? (
          <AlertBanner severity="error" onClose={() => setError(null)}>
            {error}
          </AlertBanner>
        ) : null}

        {inspirations.length > 0 ? (
          <FlexColumn gap={GAP.normal}>
            <Caption color="secondary" component="p">
              Or start from one of these:
            </Caption>
            <Box
              role="group"
              aria-label="Inspiration"
              sx={{ display: "flex", flexWrap: "wrap", gap: GAP.normal }}
            >
              {inspirations.map((logline) => (
                <Chip
                  key={logline}
                  label={logline}
                  onClick={() => setSetup({ brief: logline })}
                />
              ))}
            </Box>
          </FlexColumn>
        ) : null}
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
