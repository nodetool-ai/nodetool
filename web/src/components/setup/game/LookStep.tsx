/**
 * Step 3 of the Game flow — the look and the models (game-prd § 4.3).
 *
 * One style, one image model, and one row each for sound effects and music.
 * The style is required and the image model is required, because every sprite,
 * tile and background goes through them and a game whose slots were drawn by
 * different models does not read as one game. Audio is optional by design
 * (D27): a creator with no audio provider keeps the template's placeholder
 * files and still gets a running project.
 *
 * The shell's primary button is `Build your game` — the first thing in the
 * whole flow that places a node or spends anything. The cost line beside it is
 * computed here, from the slot counts and the chosen models' unit prices, and
 * says so plainly when a model has no published price.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { formatUsd, getModelUnitPrice } from "@nodetool-ai/model-pricing";
import {
  GAME_PLACEHOLDER_SENTINEL,
  type Entity,
  type GameSlotSpec
} from "@nodetool-ai/protocol";

import {
  AlertBanner,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  TextInput
} from "../../ui_primitives";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import type { OnboardingCapability } from "../../../stores/ProviderOnboardingStore";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { SETUP_FIELD_WIDTH } from "../layout";
import { AddStyleDialog } from "../storyboard/AddStyleDialog";
import { useGameCustomStyle } from "./useGameCustomStyle";
import type { StylePresetEntity } from "../../../serverState/useStylePresets";

/**
 * The tile that keeps a template's shipped audio. It is a real choice, not an
 * absent one (D27), so it is the first tile of its row rather than a cleared
 * selection nobody can see. The id is the protocol's, because the value is
 * saved on the document and every reader — this flow and the headless
 * `build_game` — has to normalize the same string.
 */
export const GAME_PLACEHOLDER_TILE_ID = GAME_PLACEHOLDER_SENTINEL;

/** Whether a row's tiles are there yet, and why not when they are not. */
export type GameRowStatus = "loading" | "error" | "empty" | "ready";

/** One row of tiles: what is on offer, and what the workflow remembers. */
export interface GameModelRow {
  /** Heading above the row, e.g. "Image model". */
  label: string;
  tiles: readonly OptionCardItem[];
  status: GameRowStatus;
  errorMessage?: string | null;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** The provider capability `Connect a provider` opens onboarding for. */
  capability: OnboardingCapability;
  /** What the row says when no configured provider offers anything for it. */
  emptyMessage: string;
  /**
   * The label of the row's `keep the placeholder` tile. Set on the audio rows,
   * absent on the image row, where there is nothing to fall back to.
   */
  placeholderLabel?: string;
  /** One line under the placeholder tile's title. */
  placeholderDescription?: string;
}

export interface GameLookStepProps {
  /** The chosen template's slots — what the counts and the cost are read from. */
  slots: readonly GameSlotSpec[];
  presets: readonly StylePresetEntity[];
  /** A style the creator made, so it has a tile even though it is not shipped. */
  customStyle?: Entity | null;
  styleEntityId: string | null;
  onStyleChange: (entityId: string) => void;
  /** The model the `Add your own style` descriptor call goes to. */
  designerModel: { provider: string; id: string } | null;
  image: GameModelRow;
  sfx: GameModelRow;
  music: GameModelRow;
  projectName: string;
  onProjectNameChange: (name: string) => void;
}

/** A model tile id, `${provider}:${id}`, split back into its two halves. */
export const splitTileId = (
  tileId: string | null
): { provider: string; id: string } | null => {
  if (tileId === null) {
    return null;
  }
  const index = tileId.indexOf(":");
  return index <= 0
    ? null
    : { provider: tileId.slice(0, index), id: tileId.slice(index + 1) };
};

export interface GameCostEstimate {
  /** Total in USD, or null when any chosen model has no published price. */
  total: number | null;
  imageCount: number;
  sfxCount: number;
  musicCount: number;
}

/**
 * What `Build your game` spends: one image per image slot at the image model's
 * unit price, plus one sound effect and one music loop per audio slot the
 * creator chose a model for.
 *
 * A model the catalog has no number for makes the whole line unknown rather
 * than a total that quietly leaves that model out — an estimate that is short
 * by an unknown amount is worse than no estimate.
 */
export const gameCostEstimate = (
  slots: readonly GameSlotSpec[],
  choices: {
    imageModel: string | null;
    sfxChosen: boolean;
    musicModel: string | null;
  }
): GameCostEstimate => {
  let imageCount = 0;
  let sfxCount = 0;
  let musicCount = 0;

  for (let i = 0; i < slots.length; i++) {
    const kind = slots[i].kind;
    if (kind === "spritesheet" || kind === "tileset" || kind === "image") {
      imageCount++;
    } else if (kind === "sfx" && choices.sfxChosen) {
      sfxCount++;
    } else if (kind === "music" && choices.musicModel !== null) {
      musicCount++;
    }
  }

  let total = 0;
  const priced = (tileId: string | null, quantity: number): boolean => {
    if (quantity === 0) {
      return true;
    }
    const model = splitTileId(tileId);
    if (!model) {
      return false;
    }
    const price = getModelUnitPrice({ id: model.id, provider: model.provider });
    if (!price || price.declined || !Number.isFinite(price.unit_price)) {
      return false;
    }
    total += price.unit_price * quantity;
    return true;
  };

  const known =
    priced(choices.imageModel, imageCount) &&
    priced(choices.musicModel, musicCount);
  // Sound effects are a node type, not a model tile, so the catalog has no unit
  // price to look them up by. The line says so rather than pricing them at zero.
  return {
    total: known && sfxCount === 0 ? total : null,
    imageCount,
    sfxCount,
    musicCount
  };
};

/** "Generates 5 images, 2 sound effects and 1 music loop, then exports the project". */
export const gameGenerationLine = (estimate: GameCostEstimate): string => {
  const parts = [
    `${estimate.imageCount} image${estimate.imageCount === 1 ? "" : "s"}`
  ];
  if (estimate.sfxCount > 0) {
    parts.push(
      `${estimate.sfxCount} sound effect${estimate.sfxCount === 1 ? "" : "s"}`
    );
  }
  if (estimate.musicCount > 0) {
    parts.push(
      estimate.musicCount === 1
        ? "a music loop"
        : `${estimate.musicCount} music loops`
    );
  }
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Generates ${list}, then exports the project`;
};

/** The cost beside the button, or the sentence that replaces it. */
export const gameCostLine = (estimate: GameCostEstimate): string =>
  estimate.total !== null && estimate.total > 0
    ? `About ${formatUsd(estimate.total)}`
    : "Cost unknown until the first asset returns";

/** One row of tiles, with the four states its source can be in. */
const ModelTileRow: React.FC<{ row: GameModelRow }> = ({ row }) => {
  const tiles = useMemo<OptionCardItem[]>(
    () =>
      row.placeholderLabel === undefined
        ? [...row.tiles]
        : [
            {
              id: GAME_PLACEHOLDER_TILE_ID,
              title: row.placeholderLabel,
              description: row.placeholderDescription
            },
            ...row.tiles
          ],
    [row.placeholderDescription, row.placeholderLabel, row.tiles]
  );
  const canOfferPlaceholder = row.placeholderLabel !== undefined;
  return (
    <FlexColumn gap={GAP.normal}>
      <Text size="normal" component="h3">
        {row.label}
      </Text>
      {row.status === "loading" ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {`Reading what your providers offer for ${row.label.toLowerCase()}…`}
          </Caption>
        </FlexRow>
      ) : row.status === "error" ? (
        <AlertBanner
          severity="error"
          action={
            <EditorButton variant="text" onClick={row.onRetry}>
              Try again
            </EditorButton>
          }
        >
          <Caption component="span">
            {row.errorMessage
              ? `${row.emptyMessage} ${row.errorMessage}`
              : row.emptyMessage}
          </Caption>
        </AlertBanner>
      ) : row.status === "empty" && !canOfferPlaceholder ? (
        <AlertBanner
          severity="warning"
          action={
            <EditorButton
              variant="text"
              onClick={() =>
                openProviderOnboarding({
                  capability: row.capability,
                  reason: row.emptyMessage
                })
              }
            >
              Connect a provider
            </EditorButton>
          }
        >
          <Caption component="span">{row.emptyMessage}</Caption>
        </AlertBanner>
      ) : (
        <OptionCardGrid
          label={row.label}
          options={tiles}
          selectedId={row.selectedId}
          onSelect={row.onSelect}
          minColumnWidth={220}
        />
      )}
    </FlexColumn>
  );
};

const LookStepInternal: React.FC<GameLookStepProps> = ({
  slots,
  presets,
  customStyle = null,
  styleEntityId,
  onStyleChange,
  designerModel,
  image,
  sfx,
  music,
  projectName,
  onProjectNameChange
}) => {
  const [addingStyle, setAddingStyle] = useState(false);

  const applyCustomStyle = useCallback(
    (entity: Entity) => onStyleChange(entity.id),
    [onStyleChange]
  );
  const customStyleState = useGameCustomStyle({
    model: designerModel,
    onApply: applyCustomStyle
  });

  const presetTiles = useMemo<PresetTile[]>(
    () =>
      presets.map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        description: preset.descriptor.trim(),
        image: preset.thumbnail
      })),
    [presets]
  );

  // A style the creator just made is a style entity like any other, but it is
  // not one of the shipped six — without its own tile the grid would show
  // nothing selected right after it was applied.
  const tiles = useMemo<PresetTile[]>(() => {
    if (
      customStyle === null ||
      presetTiles.some((tile) => tile.id === customStyle.id)
    ) {
      return presetTiles;
    }
    return [
      ...presetTiles,
      {
        id: customStyle.id,
        title: customStyle.name,
        description: customStyle.descriptor.trim(),
        image: customStyle.reference_images?.[0]
      }
    ];
  }, [customStyle, presetTiles]);

  // `PresetTileGrid` is memoized, so both handlers keep a stable identity.
  const openAddStyle = useCallback(() => setAddingStyle(true), []);
  const clearStyleError = customStyleState.clearError;
  const closeAddStyle = useCallback(() => {
    clearStyleError();
    setAddingStyle(false);
  }, [clearStyleError]);

  const estimate = useMemo(
    () =>
      gameCostEstimate(slots, {
        imageModel: image.selectedId,
        sfxChosen:
          sfx.selectedId !== null && sfx.selectedId !== GAME_PLACEHOLDER_TILE_ID,
        musicModel:
          music.selectedId === null ||
          music.selectedId === GAME_PLACEHOLDER_TILE_ID
            ? null
            : music.selectedId
      }),
    [image.selectedId, music.selectedId, sfx.selectedId, slots]
  );

  const slotCounts = useMemo(() => {
    let spritesheets = 0;
    let tilesets = 0;
    let images = 0;
    for (let i = 0; i < slots.length; i++) {
      const kind = slots[i].kind;
      if (kind === "spritesheet") {
        spritesheets++;
      } else if (kind === "tileset") {
        tilesets++;
      } else if (kind === "image") {
        images++;
      }
    }
    return { spritesheets, tilesets, images };
  }, [slots]);

  return (
    <FlexColumn gap={GAP.spacious}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose the look and the models
        </Text>
        <Text size="normal" color="secondary">
          One style and one image model for every sprite, tile and background,
          so the game reads as one game.
        </Text>
      </FlexColumn>

      <FlexColumn gap={GAP.normal}>
        <Text size="normal" component="h3">
          Style
        </Text>
        <Caption color="secondary" component="p">
          {`Every prompt carries it: ${slotCounts.spritesheets} sprite sheet${
            slotCounts.spritesheets === 1 ? "" : "s"
          }, ${slotCounts.tilesets} tile sheet${
            slotCounts.tilesets === 1 ? "" : "s"
          } and ${slotCounts.images} background${
            slotCounts.images === 1 ? "" : "s"
          }.`}
        </Caption>
        <PresetTileGrid
          label="Style"
          presets={tiles}
          selectedId={styleEntityId}
          onSelect={onStyleChange}
          onAddOwn={openAddStyle}
          addOwnLabel="Add your own style"
          addOwnDisabled={customStyleState.saving}
        />
      </FlexColumn>

      <ModelTileRow row={image} />
      <ModelTileRow row={sfx} />
      <ModelTileRow row={music} />

      <FormField
        label="Project name"
        helperText="The Godot project's name, and the folder it exports to."
        sx={{ maxWidth: SETUP_FIELD_WIDTH }}
      >
        <TextInput
          label="Project name"
          hideLabel
          value={projectName}
          placeholder="Ember Run"
          onChange={(event) => onProjectNameChange(event.target.value)}
        />
      </FormField>

      <BuildDisclosure estimate={estimate} />

      <AddStyleDialog
        open={addingStyle}
        saving={customStyleState.saving}
        error={customStyleState.error}
        model={designerModel}
        onClose={closeAddStyle}
        onSubmit={customStyleState.addStyle}
      />
    </FlexColumn>
  );
};

/**
 * What `Build your game` does, said before the click.
 *
 * The button is the flow's one spending action: it generates every image slot,
 * the audio slots the creator chose a model for, and then exports the project.
 * The counts are the manifest's own, so they cannot drift from what the graph
 * places, and the cost line says plainly when a chosen model has no published
 * price rather than reporting a total that is short by an unknown amount.
 */
const BuildDisclosure: React.FC<{ estimate: GameCostEstimate }> = ({
  estimate
}) => (
  <FlexColumn
    gap={GAP.tight}
    role="region"
    aria-label="Before you build"
    sx={{
      borderTop: "1px solid",
      borderColor: "divider",
      paddingTop: SPACING.lg
    }}
  >
    <Label>{gameGenerationLine(estimate)}</Label>
    <Text size="small" color="secondary">
      Every asset is checked against the slot it fills before the project is
      written. A slot you kept the placeholder for is not generated and keeps the
      template&apos;s own file.
    </Text>
    <Text size="small">{gameCostLine(estimate)}</Text>
  </FlexColumn>
);

export const GameLookStep = memo(LookStepInternal);
GameLookStep.displayName = "GameLookStep";

export default GameLookStep;
