/**
 * Step 2 of the Game flow, first half — the template (game-prd § 4.2).
 *
 * Three cards read from the live manifest list, so the meta line says what the
 * template actually asks for rather than what a card once said. Picking one
 * writes `settings.game.template` and nothing else: it decides which slots the
 * designer is given and which chains the graph builder places. No node is
 * placed here and no model is called — `Write the design` on the shell's
 * primary button is what runs the designer.
 *
 * The picker in the footer row chooses which model writes the design. It sits
 * at the weight of a setting rather than of the question this step asks, but it
 * is the way past a default model the account cannot use, so it stays on screen
 * rather than behind a disclosure.
 */

import React, { memo, useMemo } from "react";
import type { LanguageModelValue } from "../../../stores/ApiTypes";

import {
  Box,
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  LoadingSpinner,
  Text
} from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { OptionCardGrid } from "../OptionCardGrid";
import type { GameTemplate } from "../../../hooks/game/useGameTemplates";
import { templateCards } from "./templates";

/**
 * The picker holds one model name. Left to the container it stretches the full
 * width of the step and outweighs the cards, which are the actual question.
 */
const DESIGNER_PICKER_WIDTH = 320;

export interface GameTemplateStepProps {
  templates: readonly GameTemplate[];
  /** True while the manifest list is still being read. */
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The model that writes the design, or null when no provider offers one. */
  designerModel: { provider: string; id: string } | null;
  onDesignerModelChange: (model: { provider: string; id: string }) => void;
}

const TemplateStepInternal: React.FC<GameTemplateStepProps> = ({
  templates,
  loading = false,
  selectedId,
  onSelect,
  designerModel,
  onDesignerModelChange
}) => {
  const cards = useMemo(() => templateCards(templates), [templates]);
  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose your game&apos;s loop
        </Text>
        <Text size="normal" color="secondary">
          The template decides the asset slots your game needs and the code it
          ships with. You can change it before the design is written.
        </Text>
      </FlexColumn>
      {loading && cards.length === 0 ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            Reading the shipped templates…
          </Caption>
        </FlexRow>
      ) : (
        <OptionCardGrid
          label="Game template"
          options={cards}
          selectedId={selectedId}
          onSelect={onSelect}
          variant="media"
        />
      )}
      <FlexRow gap={GAP.normal} align="center">
        <Label>Design with</Label>
        <Box sx={{ width: DESIGNER_PICKER_WIDTH }}>
          <LanguageModelSelect
            value={designerModel?.id ?? ""}
            provider={designerModel?.provider}
            placeholder="Select designer model"
            onChange={(value: LanguageModelValue) =>
              onDesignerModelChange({ provider: value.provider, id: value.id })
            }
          />
        </Box>
      </FlexRow>
    </FlexColumn>
  );
};

export const GameTemplateStep = memo(TemplateStepInternal);
GameTemplateStep.displayName = "GameTemplateStep";

export default GameTemplateStep;
