/**
 * Step 2 of the Game flow, first half — the template.
 *
 * The built-in engine's templates as cards, each saying how its game plays
 * and which pieces of art the build will draw for it. Picking one writes
 * `settings.game.template` and nothing else. `Write the design` on the
 * shell's primary button is what calls the designer.
 */

import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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

const describeSlot = (
  slot: (typeof NATIVE_GAME_TEMPLATES)[number]["manifest"]["slots"][number],
  t: TFunction
): string => {
  switch (slot.kind) {
    case "spritesheet": {
      const animations = Object.entries(slot.animations)
        .map(([name, frames]) =>
          frames === 1
            ? name
            : t("pass3_6.game.template.animationFrames", {
                name,
                count: frames
              })
        )
        .join(", ");
      return t("pass3_6.game.template.slotSprite", {
        id: slot.id,
        width: slot.cell[0],
        height: slot.cell[1],
        animations
      });
    }
    case "tileset":
      return t("pass3_6.game.template.slotTile", {
        id: slot.id,
        width: slot.cell[0],
        height: slot.cell[1]
      });
    case "image":
      return t("pass3_6.game.template.slotImage", {
        id: slot.id,
        width: slot.size[0],
        height: slot.size[1]
      });
    case "sfx":
      return t("pass3_6.game.template.slotSound", { id: slot.id });
    case "music":
      return t("pass3_6.game.template.slotMusic", { id: slot.id });
  }
};

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
  const { t } = useTranslation();
  const chosen = selectedId ? findNativeGameTemplate(selectedId) : null;
  const options: readonly OptionCardItem[] = NATIVE_GAME_TEMPLATES.map(
    (template) => {
      const localized =
        template.id === "topdown"
          ? {
              title: t("pass3_6.game.template.templates.topdown.title"),
              description: t(
                "pass3_6.game.template.templates.topdown.description"
              )
            }
          : { title: template.name, description: template.description };
      return {
        id: template.id,
        ...localized,
        meta: t("pass3_6.game.template.assetCount", {
          count: template.manifest.slots.length
        })
      };
    }
  );
  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_6.game.template.heading")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_6.game.template.description")}
        </Text>
      </FlexColumn>
      <OptionCardGrid
        label={t("pass3_6.game.template.groupLabel")}
        options={options.map((option) => ({
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
          aria-label={t("pass3_6.game.template.assetsLabel")}
          sx={{ listStyle: "none", m: 0, p: 0, "& li": { listStyle: "none" } }}
        >
          {chosen.manifest.slots.map((slot) => (
            <Caption key={slot.id} component="li" color="secondary">
              {describeSlot(slot, t)}
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
> = ({ designerModel, onDesignerModelChange, readOnly = false }) => {
  const { t } = useTranslation();
  return (
    <SetupFooterField label={t("pass3_6.game.template.modelLabel")}>
      <LanguageModelSelect
        value={designerModel?.id ?? ""}
        provider={designerModel?.provider}
        placeholder={t("pass3_6.game.template.modelPlaceholder")}
        disabled={readOnly}
        onChange={(value: LanguageModelValue) =>
          onDesignerModelChange({ provider: value.provider, id: value.id })
        }
      />
    </SetupFooterField>
  );
};

export const GameTemplateStep = memo(TemplateStepInternal);
GameTemplateStep.displayName = "GameTemplateStep";

export default GameTemplateStep;
