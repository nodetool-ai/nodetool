/**
 * Step 1 of the Game flow — the idea.
 *
 * A box for the game, three inspiration chips written for the built-in
 * top-down template, and the ways in that skip the design: a blank room to
 * edit by hand, or a blank 3D game. The brief writes straight to
 * `settings.game` as it is typed, so a reload resumes with the text intact.
 */

import React, { memo, useCallback, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NATIVE_GAME_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Box,
  FlexColumn,
  GAP,
  Text,
  TextArea
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
  const { t } = useTranslation();
  const briefField = useRef<HTMLElement | null>(null);

  const handleChange = useCallback(
    (value: string) => {
      onBriefChange(value);
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
  const examples = NATIVE_GAME_INSPIRATION_CHIPS.map((chip) => {
    switch (chip.id) {
      case "acorn-clearing":
        return t("pass3_6.game.idea.inspiration.acornClearing");
      case "sunken-pearl":
        return t("pass3_6.game.idea.inspiration.sunkenPearl");
      case "server-cell":
        return t("pass3_6.game.idea.inspiration.serverCell");
      default:
        return chip.brief;
    }
  });

  const alternatives: AlternativeEntry[] = useMemo(() => {
    const busy = startingAlternative !== null || readOnly;
    const busyReason =
      startingAlternative !== null
        ? t("pass3_6.game.idea.creatingGame")
        : t("pass3_6.game.idea.notEditable");
    return [
      {
        id: "blank-2d",
        title: t("pass3_6.game.idea.blankRoom.title"),
        description:
          startingAlternative === "blank-2d"
            ? t("pass3_6.game.idea.creatingGame")
            : t("pass3_6.game.idea.blankRoom.description"),
        onSelect: () => onStartAlternative("blank-2d"),
        disabled: busy,
        disabledReason: busyReason
      },
      {
        id: "blank-3d",
        title: t("pass3_6.game.idea.blank3d.title"),
        description:
          startingAlternative === "blank-3d"
            ? t("pass3_6.game.idea.creatingGame")
            : t("pass3_6.game.idea.blank3d.description"),
        onSelect: () => onStartAlternative("blank-3d"),
        disabled: busy,
        disabledReason: busyReason
      }
    ];
  }, [onStartAlternative, readOnly, startingAlternative, t]);

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
            {t("pass3_6.game.idea.title")}
          </Text>
          <Text size="normal" color="secondary">
            {t("pass3_6.game.idea.description")}
          </Text>
        </FlexColumn>

        <TextArea
          value={brief}
          autoFocus
          rows={3}
          label={t("pass3_6.game.idea.briefLabel")}
          hideLabel
          placeholder={t("pass3_6.game.idea.briefPlaceholder")}
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
                  summary: t("pass3_6.game.idea.createFailed"),
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
          examples={examples}
          brief={brief}
          onSelect={handleChip}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label={t("pass3_6.game.idea.alternativesLabel")}
        alternatives={alternatives}
      />
    </Box>
  );
};

export const GameIdeaStep = memo(IdeaStepInternal);
GameIdeaStep.displayName = "GameIdeaStep";

export default GameIdeaStep;
