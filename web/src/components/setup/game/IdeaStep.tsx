/**
 * Step 1 of the Game flow — the idea (game-prd § 4.1).
 *
 * A box for the premise, three inspiration chips, and the three other ways in.
 * The brief writes straight to `settings.game` as it is typed, so `Continue`
 * has only the stage left to write and a reload resumes with the text intact.
 *
 * Two of the alternatives skip a step rather than leaving the flow:
 * `Start from a template` opens the three template cards inline and lands on
 * the Design step with that card selected, and `Export a blank template` picks
 * one, writes stage `done`, and places the export node alone — a project that
 * runs in Godot today with the template's placeholder art (D27).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { GAME_INSPIRATION_CHIPS } from "@nodetool-ai/protocol";

import {
  Box,
  Caption,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { OptionCardGrid } from "../OptionCardGrid";
import type { GameTemplate } from "../../../hooks/game/useGameTemplates";
import { templateCards } from "./templates";

export interface GameIdeaStepProps {
  brief: string;
  /** Writes the brief as it is typed. */
  onBriefChange: (brief: string) => void;
  /** The shipped templates, for both inline card grids. */
  templates: readonly GameTemplate[];
  /** Picks a template and moves to the Design step with it selected. */
  onStartFromTemplate: (templateId: string) => void;
  /** Picks a template, writes stage `done`, and exports the placeholders. */
  onExportBlank: (templateId: string) => void;
  /** True while the blank export is placing and running its one node. */
  exportingBlank?: boolean;
  /** Opens the existing tutorials entry. */
  onOpenTutorial: () => void;
}

/** Which inline card grid the step body has been replaced by, if any. */
type Picker = "template" | "blank" | null;

const IdeaStepInternal: React.FC<GameIdeaStepProps> = ({
  brief,
  onBriefChange,
  templates,
  onStartFromTemplate,
  onExportBlank,
  exportingBlank = false,
  onOpenTutorial
}) => {
  const [picker, setPicker] = useState<Picker>(null);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onBriefChange(event.target.value);
    },
    [onBriefChange]
  );

  const cards = useMemo(() => templateCards(templates), [templates]);

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "template",
        title: "Start from a template",
        description: "Pick the loop and skip straight to the design",
        onSelect: () => setPicker("template"),
        disabled: templates.length === 0,
        disabledReason:
          templates.length === 0 ? "Reading the shipped templates…" : undefined
      },
      {
        id: "blank",
        title: "Export a blank template",
        description: "A running project with placeholder art, fill it later",
        onSelect: () => setPicker("blank"),
        disabled: templates.length === 0 || exportingBlank,
        disabledReason: exportingBlank
          ? "Exporting the template…"
          : templates.length === 0
            ? "Reading the shipped templates…"
            : undefined
      },
      {
        id: "tutorial",
        title: "Tutorial",
        description: "Walk one project end to end, with the steps explained",
        onSelect: onOpenTutorial
      }
    ],
    [exportingBlank, onOpenTutorial, templates.length]
  );

  if (picker !== null) {
    const blank = picker === "blank";
    return (
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            {blank ? "Export a blank template" : "Start from a template"}
          </Text>
          <Caption color="secondary" component="p">
            {blank
              ? "The template with its placeholder art, exported and ready to open in Godot."
              : "Pick the loop and skip straight to the design."}
          </Caption>
        </FlexColumn>
        <OptionCardGrid
          label={blank ? "Blank template" : "Template"}
          options={cards}
          onSelect={(id) => {
            setPicker(null);
            if (blank) {
              onExportBlank(id);
              return;
            }
            onStartFromTemplate(id);
          }}
        />
      </FlexColumn>
    );
  }

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
            Tell us the premise. We&apos;ll pick a template, write the design,
            and fill every asset slot.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={4}
          label="The premise"
          hideLabel
          placeholder="One sentence is enough: who you play, what you do, and what stops you."
          onChange={handleChange}
        />

        <ExampleBriefs
          examples={GAME_INSPIRATION_CHIPS.map((chip) => chip.brief)}
          brief={brief}
          onSelect={onBriefChange}
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
