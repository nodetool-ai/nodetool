/**
 * Step 2 of the Game flow, first half — the template.
 *
 * The built-in engine's templates as cards, each saying how its game plays
 * and which pieces of art the build will draw for it. Picking one writes
 * `settings.game.template` and nothing else. `Write the design` on the
 * shell's primary button is what calls the designer.
 */

import React, { memo } from "react";
import {
  NATIVE_GAME_TEMPLATES,
  findNativeGameTemplate
} from "@nodetool-ai/protocol";

import type { LanguageModelValue } from "../../../stores/ApiTypes";
import { Caption, FlexColumn, GAP, Text } from "../../ui_primitives";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { SetupFooterField } from "../SetupFooterField";
import { describeGameSlot } from "./gameSetupModel";

const TEMPLATE_OPTIONS: readonly OptionCardItem[] = NATIVE_GAME_TEMPLATES.map(
  (template) => ({
    id: template.id,
    title: template.name,
    description: template.description,
    meta: `${template.manifest.slots.length} assets`
  })
);

export interface GameTemplateStepProps {
  selectedId: string | null;
  onSelect: (id: string) => void;
  readOnly?: boolean;
}

const TemplateStepInternal: React.FC<GameTemplateStepProps> = ({
  selectedId,
  onSelect,
  readOnly = false
}) => {
  const chosen = selectedId ? findNativeGameTemplate(selectedId) : null;
  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Pick how it plays
        </Text>
        <Text size="normal" color="secondary">
          The template sets the rules and the pieces of art. The design you
          review next fills them in for your idea.
        </Text>
      </FlexColumn>
      <OptionCardGrid
        label="Game template"
        options={TEMPLATE_OPTIONS.map((option) => ({
          ...option,
          disabled: readOnly
        }))}
        selectedId={selectedId}
        onSelect={onSelect}
      />
      {chosen ? (
        <FlexColumn
          gap={GAP.tight}
          component="ul"
          aria-label="Assets this template uses"
          sx={{ listStyle: "none", m: 0, p: 0, "& li": { listStyle: "none" } }}
        >
          {chosen.manifest.slots.map((slot) => (
            <Caption key={slot.id} component="li" color="secondary">
              {describeGameSlot(slot)}
            </Caption>
          ))}
        </FlexColumn>
      ) : null}
    </FlexColumn>
  );
};

export interface DesignerModelFooterFieldProps {
  /** The model that writes the design, or null when none is picked. */
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

export const GameTemplateStep = memo(TemplateStepInternal);
GameTemplateStep.displayName = "GameTemplateStep";

export default GameTemplateStep;
