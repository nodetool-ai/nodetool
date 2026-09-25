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
 * `DesignerModelFooterField` chooses which model writes the design. It sits in
 * the shell's footer beside the estimate, at the weight of a setting rather
 * than of the question this step asks, but it is the way past a default model
 * the account cannot use, so it stays on screen rather than behind a
 * disclosure.
 */

import React, { memo, useMemo } from "react";
import type { LanguageModelValue } from "../../../stores/ApiTypes";

import {
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  Text
} from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { OptionCardGrid } from "../OptionCardGrid";
import { SetupFooterField } from "../SetupFooterField";
import type { GameTemplate } from "../../../hooks/game/useGameTemplates";
import { templateCards } from "./templates";

export interface GameTemplateStepProps {
  templates: readonly GameTemplate[];
  /** True while the manifest list is still being read. */
  loading?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export interface DesignerModelFooterFieldProps {
  /** The model that writes the design, or null when no provider offers one. */
  designerModel: { provider: string; id: string } | null;
  onDesignerModelChange: (model: { provider: string; id: string }) => void;
  readOnly?: boolean;
}

/** The designer model, for the shell's footer. */
export const DesignerModelFooterField: React.FC<
  DesignerModelFooterFieldProps
> = ({ designerModel, onDesignerModelChange, readOnly = false }) => (
  <SetupFooterField label="Model">
    <LanguageModelSelect
      value={designerModel?.id ?? ""}
      provider={designerModel?.provider}
      placeholder="Designer model"
      disabled={readOnly}
      onChange={(value: LanguageModelValue) =>
        onDesignerModelChange({ provider: value.provider, id: value.id })
      }
    />
  </SetupFooterField>
);

const TemplateStepInternal: React.FC<GameTemplateStepProps> = ({
  templates,
  loading = false,
  selectedId,
  onSelect
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
    </FlexColumn>
  );
};

export const GameTemplateStep = memo(TemplateStepInternal);
GameTemplateStep.displayName = "GameTemplateStep";

export default GameTemplateStep;
