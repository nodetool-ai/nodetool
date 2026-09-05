/**
 * Step 1 of the storyboard flow — the idea (PRD § 7.1).
 *
 * One sentence, or a whole pasted script, in a box that writes straight to the
 * board: the brief is on the document as it is typed, so `Continue` has only
 * the stage left to write and a reload resumes with the text intact (D1, D3).
 *
 * `/` completes a skill on the New Project surface, where the prompt starts a
 * project agent. Inside the flow the text is a brief for the Director, not a
 * turn for an agent, so the skill trigger is deliberately not wired here.
 */

import React, { memo, useCallback, useMemo } from "react";

import {
  Box,
  Caption,
  Chip,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";

/** How many example loglines are offered as inspiration (PRD § 7.1). */
const INSPIRATION_COUNT = 3;

/** A card that is shown but cannot be pressed yet. */
const notYet = (): void => {};

export interface IdeaStepProps {
  boardId: string;
  /** Opens a blank board — the flow's escape hatch, stage `done` (PRD § 6.2). */
  onStartBlank: () => void;
  /** Opens the existing tutorials entry. */
  onOpenTutorial: () => void;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  boardId,
  onStartBlank,
  onOpenTutorial
}) => {
  const brief = useStoryboardStore((state) => state.boards[boardId]?.brief ?? "");
  const setSetup = useStoryboardStore((state) => state.setSetup);
  const { data: examples } = useExampleStoryboards();

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup(boardId, { brief: event.target.value });
    },
    [boardId, setSetup]
  );

  // The shipped boards' own briefs: what someone typed to get a board that
  // exists, which is a better start than an invented example.
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
        id: "upload",
        title: "Upload your file",
        description: "PDF, DOCX, FDX",
        onSelect: notYet,
        disabled: true,
        disabledReason: "Available in P5"
      },
      {
        id: "shotlist",
        title: "Import your shotlist",
        description: "Download the template to get started",
        onSelect: notYet,
        disabled: true,
        disabledReason: "Available in P5"
      },
      {
        id: "blank",
        title: "Start with a blank storyboard",
        description: "Skip the story and go straight to the board",
        onSelect: onStartBlank
      },
      {
        id: "tutorial",
        title: "Take the tutorial",
        description: "Walk one board end to end, with the steps explained",
        onSelect: onOpenTutorial
      }
    ],
    [onOpenTutorial, onStartBlank]
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
            What&apos;s your story?
          </Text>
          <Text size="normal" color="secondary">
            We&apos;ll turn it into a screenplay and storyboard.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={5}
          label="Your story"
          hideLabel
          placeholder="One sentence is enough, or paste a full script."
          onChange={handleChange}
        />

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
                  onClick={() => setSetup(boardId, { brief: logline })}
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
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "IdeaStep";

export default IdeaStep;
