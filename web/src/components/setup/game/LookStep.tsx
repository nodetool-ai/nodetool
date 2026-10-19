/**
 * Step 3 of the Game flow — the look, then the build.
 *
 * The art style is one of the shipped game presets; its descriptor is pasted
 * into every image prompt so the player, the walls and the collectible read as
 * one game. The game's name starts as the design's title. The image model sits
 * in the shell's footer beside the button that spends on it, and the line
 * beside that button says how many images it draws and roughly what they cost.
 */

import React, { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";

import type { ImageModelValue } from "../../../stores/ApiTypes";
import type { ImageModelTask } from "../../../hooks/useModelsByProvider";
import type { StylePresetEntity } from "../../../serverState/useStylePresets";
import {
  Box,
  Caption,
  FlexColumn,
  FormField,
  GAP,
  Text,
  TextInput,
  LoadingSpinner
} from "../../ui_primitives";
import ImageModelSelect from "../../properties/ImageModelSelect";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { SetupFooterField } from "../SetupFooterField";
import { SETUP_FIELD_WIDTH } from "../layout";
import { STYLE_DESCRIPTIONS } from "../styleDescriptions";
import { NO_GAME_STYLE_ID } from "./gameSetupModel";

const styleDescription = (
  presetId: string,
  descriptor: string,
  t: TFunction
): string => {
  switch (presetId) {
    case "comic":
      return t("pass3_6.game.look.styles.comic");
    case "cinematic":
      return t("pass3_6.game.look.styles.cinematic");
    case "soft-pencil":
      return t("pass3_6.game.look.styles.softPencil");
    case "animation-3d":
      return t("pass3_6.game.look.styles.animation3d");
    case "watercolor-paint":
      return t("pass3_6.game.look.styles.watercolorPaint");
    case "photo-commercial":
      return t("pass3_6.game.look.styles.photoCommercial");
    case "charcoal-sketch":
      return t("pass3_6.game.look.styles.charcoalSketch");
    case "dark-anime":
      return t("pass3_6.game.look.styles.darkAnime");
    case "flat-vector":
      return t("pass3_6.game.look.styles.flatVector");
    case "noir":
      return t("pass3_6.game.look.styles.noir");
    case "stick-figure":
      return t("pass3_6.game.look.styles.stickFigure");
    case "graphic-novel":
      return t("pass3_6.game.look.styles.graphicNovel");
    case "pixel-16bit":
      return t("pass3_6.game.look.styles.pixel16bit");
    case "pixel-8bit":
      return t("pass3_6.game.look.styles.pixel8bit");
    case "pixel-handheld":
      return t("pass3_6.game.look.styles.pixelHandheld");
    case "pixel-1bit":
      return t("pass3_6.game.look.styles.pixel1bit");
    case "pixel-modern":
      return t("pass3_6.game.look.styles.pixelModern");
    case "painted-2d":
      return t("pass3_6.game.look.styles.painted2d");
    default:
      return STYLE_DESCRIPTIONS[presetId] ?? descriptor.trim();
  }
};

const localizeSlotDescription = (line: string, t: TFunction): string => {
  const separator = line.indexOf(": ");
  if (separator < 0) {
    return line;
  }
  const id = line.slice(0, separator);
  const detail = line.slice(separator + 2);
  const sprite = /^(\d+)×(\d+) sprite, (.*)$/.exec(detail);
  if (sprite) {
    const animations = sprite[3].replace(
      /([a-z][a-z0-9_]*) \((\d+) frames\)/g,
      (_match, name: string, frames: string) =>
        t("pass3_6.game.look.animationFrames", {
          name,
          count: Number(frames)
        })
    );
    return t("pass3_6.game.look.slotSprite", {
      id,
      width: Number(sprite[1]),
      height: Number(sprite[2]),
      animations
    });
  }
  const tile = /^(\d+)×(\d+) tile$/.exec(detail);
  if (tile) {
    return t("pass3_6.game.look.slotTile", {
      id,
      width: Number(tile[1]),
      height: Number(tile[2])
    });
  }
  const image = /^(\d+)×(\d+) image$/.exec(detail);
  if (image) {
    return t("pass3_6.game.look.slotImage", {
      id,
      width: Number(image[1]),
      height: Number(image[2])
    });
  }
  return line;
};

const IMAGE_MODEL_TASKS: ImageModelTask[] = ["text_to_image"];

export interface GameLookStepProps {
  presets: readonly StylePresetEntity[];
  presetsLoading: boolean;
  styleEntityId: string | null;
  onStyleSelect: (entityId: string) => void;
  name: string;
  onNameChange: (name: string) => void;
  /** One line per image the build draws. */
  imageSlots: readonly string[];
  readOnly?: boolean;
}

const LookStepInternal: React.FC<GameLookStepProps> = ({
  presets,
  presetsLoading,
  styleEntityId,
  onStyleSelect,
  name,
  onNameChange,
  imageSlots,
  readOnly = false
}) => {
  const { t } = useTranslation();
  const tiles = useMemo<PresetTile[]>(
    () =>
      presets.map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        description: styleDescription(preset.presetId, preset.descriptor, t),
        image: preset.thumbnail,
        disabled: readOnly
      })),
    [presets, readOnly, t]
  );

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_6.game.look.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_6.game.look.description")}
        </Text>
      </FlexColumn>

      <Box sx={{ maxWidth: SETUP_FIELD_WIDTH }}>
        <TextInput
          label={t("pass3_6.game.look.gameNameLabel")}
          value={name}
          placeholder={t("pass3_6.game.look.gameNamePlaceholder")}
          onChange={(event) => onNameChange(event.target.value)}
          disabled={readOnly}
        />
      </Box>

      <FormField label={t("pass3_6.game.look.artStyleLabel")}>
        {presetsLoading && presets.length === 0 ? (
          <LoadingSpinner
            size="small"
            text={t("pass3_6.game.look.loadingStyles")}
          />
        ) : (
          <PresetTileGrid
            label={t("pass3_6.game.look.artStyleLabel")}
            presets={tiles}
            selectedId={styleEntityId}
            onSelect={onStyleSelect}
            onAddOwn={() => onStyleSelect(NO_GAME_STYLE_ID)}
            addOwnOptionId={NO_GAME_STYLE_ID}
            addOwnLabel={t("pass3_6.game.look.noStyle")}
            addOwnDescription={t("pass3_6.game.look.noStyleDescription")}
            addOwnDisabled={readOnly}
          />
        )}
      </FormField>

      <FlexColumn gap={GAP.tight}>
        <Text size="small" component="h3">
          {t("pass3_6.game.look.buildDrawsHeading")}
        </Text>
        <FlexColumn
          gap={GAP.tight}
          component="ul"
          sx={{ listStyle: "none", m: 0, p: 0, "& li": { listStyle: "none" } }}
        >
          {imageSlots.map((line) => (
            <Caption key={line} component="li" color="secondary">
              {localizeSlotDescription(line, t)}
            </Caption>
          ))}
        </FlexColumn>
        <Caption color="secondary" component="p">
          {t("pass3_6.game.look.assetNote")}
        </Caption>
      </FlexColumn>
    </FlexColumn>
  );
};

export interface ImageModelFooterFieldProps {
  model: { provider: string; id: string } | null;
  onModelChange: (model: { provider: string; id: string }) => void;
  readOnly?: boolean;
}

/** The model that draws every image, for the shell's footer. */
export const ImageModelFooterField: React.FC<ImageModelFooterFieldProps> = ({
  model,
  onModelChange,
  readOnly = false
}) => {
  const { t } = useTranslation();
  return (
    <SetupFooterField label={t("pass3_6.game.look.artModelLabel")}>
      <ImageModelSelect
        value={model?.id ?? ""}
        provider={model?.provider}
        task={IMAGE_MODEL_TASKS}
        disabled={readOnly}
        onChange={(value: ImageModelValue) =>
          onModelChange({ provider: value.provider, id: value.id })
        }
      />
    </SetupFooterField>
  );
};

export const GameLookStep = memo(LookStepInternal);
GameLookStep.displayName = "GameLookStep";

export default GameLookStep;
