/**
 * Step 1 of the Game flow — the idea.
 *
 * A box for the game, three inspiration chips written for the built-in
 * top-down template, and the ways in that skip the design: a blank room to
 * edit by hand, or a blank 3D game. The brief writes straight to
 * `settings.game` as it is typed, so a reload resumes with the text intact.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { NATIVE_GAME_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Box,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import ReportBugButton from "../../support/ReportBugButton";

/** A way in that makes a game without designing one. */
export type GameStartAlternative = "blank-2d" | "blank-3d";

export interface GameIdeaStepProps {
  workflowId: string;
  brief: string;
  /** Writes the brief as it is typed. */
  onBriefChange: (brief: string) => void;
  /** Makes a game without the design steps, then leaves the flow. */
  onStartAlternative: (kind: GameStartAlternative) => void;
  /** The alternative being created right now. */
  startingAlternative?: GameStartAlternative | null;
  /** Why the last alternative was refused. */
  alternativeError?: string | null;
  onDismissAlternativeError?: () => void;
  readOnly?: boolean;
}

const IdeaStepInternal: React.FC<GameIdeaStepProps> = ({
  workflowId,
  brief,
  onBriefChange,
  onStartAlternative,
  startingAlternative = null,
  alternativeError = null,
  onDismissAlternativeError,
  readOnly = false
}) => {
  const briefField = useRef<HTMLElement | null>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onBriefChange(event.target.value);
    },
    [onBriefChange]
  );
  // A step shown for reading takes no chip either.
  const handleChip = useCallback(
    (next: string) => {
      if (!readOnly) {
        onBriefChange(next);
      }
    },
    [onBriefChange, readOnly]
  );

  const alternatives: AlternativeEntry[] = useMemo(() => {
    const busy = startingAlternative !== null || readOnly;
    const busyReason =
      startingAlternative !== null ? "Creating your game" : "Not editable";
    return [
      {
        id: "blank-2d",
        title: "Start with a blank room",
        description:
          startingAlternative === "blank-2d"
            ? "Creating your game"
            : "Skip the design and edit the top-down room yourself",
        onSelect: () => onStartAlternative("blank-2d"),
        disabled: busy,
        disabledReason: busyReason
      },
      {
        id: "blank-3d",
        title: "Start a blank 3D game",
        description:
          startingAlternative === "blank-3d"
            ? "Creating your game"
            : "An empty 3D scene in the built-in engine",
        onSelect: () => onStartAlternative("blank-3d"),
        disabled: busy,
        disabledReason: busyReason
      }
    ];
  }, [onStartAlternative, readOnly, startingAlternative]);

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
            What&apos;s your game?
          </Text>
          <Text size="normal" color="secondary">
            Describe it in a sentence. We&apos;ll write a design you can edit,
            then draw its art.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={3}
          label="Your game"
          hideLabel
          placeholder="A cat collecting fish in a moonlit garden"
          onChange={handleChange}
          inputRef={briefField}
          disabled={readOnly}
        />

        {alternativeError ? (
          <AlertBanner
            severity="error"
            onClose={onDismissAlternativeError}
            action={
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: "Creating a game failed",
                  errorText: alternativeError,
                  workflowId
                }}
              />
            }
          >
            {alternativeError}
          </AlertBanner>
        ) : null}

        <ExampleBriefs
          examples={NATIVE_GAME_INSPIRATION_CHIPS.map((chip) => chip.brief)}
          brief={brief}
          onSelect={handleChip}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />
    </Box>
  );
};

export const GameIdeaStep = memo(IdeaStepInternal);
GameIdeaStep.displayName = "GameIdeaStep";

export default GameIdeaStep;
