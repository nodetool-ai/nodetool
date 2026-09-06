/**
 * Step 3 of the image flow — size, style and model (PRD § 10.3).
 *
 * The step body is three pickers; the generate button lives on the `SetupFlow`
 * shell, so `useLookStep` hands the flow config what that button needs. Three
 * rules shape the file:
 *
 * - D21 — the style tiles are the same twelve `style` entities the storyboard
 *   flow seeds, read through `useStylePresets`. One library, one meaning for
 *   "Noir", whichever flow applied it.
 * - D3 — the persisted stage is the only completion signal. `generate` writes
 *   `done` before it enqueues anything.
 * - F17 — style and model are persisted with the stage (`lookSelection.ts`),
 *   because both decide what the batch looks like and what it costs.
 *
 * Sample stills are fetched on first use, never shipped (R5) — the same probe
 * the video flow's model tiles use, see `../modelSamples.ts`. A model whose
 * sample has not been published falls back to its name set in the sample box,
 * which is what `PresetTileGrid` does when a preset has no picture.
 *
 * The model list is a query, so the step says which of its four answers it
 * got — loading, failed, no provider connected, nothing compatible — instead
 * of showing an empty grid and a dead button (F14). A remembered model that is
 * no longer offered is shown as the choice it is, and blocks the button until
 * it is replaced.
 */

import React, { Suspense, lazy, useCallback, useMemo, useState } from "react";
import { STYLE_DESCRIPTIONS } from "../styleDescriptions";
import { formatUsd } from "@nodetool-ai/model-pricing";
import { composeImagePrompt } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  Text
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import type { ImageModel } from "../../../stores/ApiTypes";
import { useEntities } from "../../../serverState/useEntities";
import { useStylePresets } from "../../../serverState/useStylePresets";
import { useImageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useLastModelStore } from "../../../stores/lastModelStore";
import { estimateGenerationCost } from "../../../utils/generationCostEstimate";
import { useGenerateVariations } from "../../../hooks/sketch/useGenerateVariations";
import { OptionCardGrid, type OptionCardItem } from "../OptionCardGrid";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { useModelSamples } from "../modelSamples";
import { SIZE_PRESETS, sizePresetFor } from "./sizes";
import {
  NO_STYLE_ID,
  modelChoicePatch,
  readLookSelection,
  styleChoicePatch
} from "./lookSelection";

const ImageModelMenuDialog = lazy(
  () => import("../../model_menu/ImageModelMenuDialog")
);

/** How many image models the grid offers before it becomes a wall of tiles. */
const MAX_MODEL_TILES = 12;

/** Which of the model list's answers the step got (F14). */
export type ModelAvailability =
  | "loading"
  | "error"
  | "no-provider"
  | "no-model"
  | "ready";

/** A tile id is `provider/model`; the model id itself may contain slashes. */
const tileId = (provider: string, model: string): string =>
  `${provider}/${model}`;

/** What the creator has picked, and what pressing the button will do with it. */
export interface LookStepControls {
  /** A style entity id, `NO_STYLE_ID`, or null when untouched. */
  styleChoice: string | null;
  provider: string;
  model: string;
  setStyleChoice: (choice: string) => void;
  setModel: (provider: string, model: string) => void;
  /** False until an available model is chosen. */
  canAdvance: boolean;
  /** Why the button is off, in the creator's words. */
  blockedReason: string;
  /** What the click spends, or undefined when nothing priced it. */
  primaryDetail: string | undefined;
  /** The model list's state, and what the body renders in its place. */
  availability: ModelAvailability;
  models: readonly ImageModel[];
  /** True while the chosen model is not one the providers offer. */
  modelMissing: boolean;
  refetchModels: () => void;
  /**
   * Write the terminal stage, then enqueue one layer per variation. Returns
   * the batch's layer ids, in contact-sheet order.
   */
  generate: () => Promise<string[]>;
}

/**
 * The generate action and its price. Separate from the body because the button
 * lives on the shell, and the host should not have to reassemble the batch
 * path to fill it in.
 */
export function useLookStep(): LookStepControls {
  const setup = useSketchStore((state) => state.document.setup);
  const setSetup = useSketchStore((state) => state.setSetup);
  const remembered = useLastModelStore((state) => state.byKind.image);
  const remember = useLastModelStore((state) => state.remember);
  const { data: entities } = useEntities();
  const { generateVariations } = useGenerateVariations();
  const {
    models,
    providers,
    isLoading,
    error,
    refetch
  } = useImageModelsByProvider({ task: "text_to_image" });

  const variations = setup?.variations ?? 1;
  const canvas = useSketchStore((state) => state.document.canvas);

  const persisted = useMemo(() => readLookSelection(setup), [setup]);
  // The document wins over the remembered pick: it is what this image was set
  // up with, while `lastModelStore` is what the creator used somewhere else.
  const provider = persisted.provider || (remembered?.provider ?? "");
  const model = persisted.model || (remembered?.model ?? "");

  const setStyleChoice = useCallback(
    (choice: string) => setSetup(styleChoicePatch(choice)),
    [setSetup]
  );

  const setModel = useCallback(
    (nextProvider: string, nextModel: string) => {
      setSetup(modelChoicePatch(nextProvider, nextModel));
      remember("image", { provider: nextProvider, model: nextModel });
    },
    [remember, setSetup]
  );

  const styleDescriptor = useMemo(() => {
    const choice = persisted.styleChoice;
    if (choice === null || choice === NO_STYLE_ID) {
      return "";
    }
    return (
      (entities ?? []).find((entity) => entity.id === choice)?.descriptor ?? ""
    );
  }, [entities, persisted.styleChoice]);

  const availability: ModelAvailability = isLoading
    ? "loading"
    : error
      ? "error"
      : providers.length === 0
        ? "no-provider"
        : models.length === 0
          ? "no-model"
          : "ready";

  const modelMissing =
    availability === "ready" &&
    model.length > 0 &&
    !models.some(
      (entry) => entry.id === model && entry.provider === provider
    );

  const generate = useCallback(async (): Promise<string[]> => {
    const current = useSketchStore.getState().document.setup;
    const size = useSketchStore.getState().document.canvas;
    const created = await generateVariations({
      prompt: composeImagePrompt(current, styleDescriptor),
      provider,
      model,
      width: size.width,
      height: size.height,
      aspectRatio: sizePresetFor(size.width, size.height)?.aspectRatio,
      count: current?.variations ?? 1
    });
    return created.map((variation) => variation.layerId);
  }, [generateVariations, model, provider, styleDescriptor]);

  // The batch creates `variations` bindings with exactly these fields, so it
  // prices through the same estimator the layer inspector uses — `quantity`
  // is what makes the figure the whole batch rather than one image.
  const estimate = useMemo(
    () =>
      model
        ? estimateGenerationCost({
            kind: "image",
            provider: provider || null,
            model,
            aspectRatio:
              sizePresetFor(canvas.width, canvas.height)?.aspectRatio ?? null,
            width: canvas.width,
            height: canvas.height,
            quantity: variations
          })
        : null,
    [canvas.height, canvas.width, model, provider, variations]
  );

  // PRD § 6.2: nothing shows when nothing was measured.
  const primaryDetail =
    estimate && estimate.total > 0
      ? `${variations} image${variations === 1 ? "" : "s"} · about ${formatUsd(
          estimate.total
        )}`
      : undefined;

  const blockedReason =
    availability === "loading"
      ? "Loading the image models"
      : availability === "error"
        ? "The image models could not be loaded"
        : availability === "no-provider"
          ? "Connect an image provider first"
          : availability === "no-model"
            ? "No image model can render a picture yet"
            : modelMissing
              ? "That model is no longer offered — pick another"
              : "Pick an image model";

  return {
    styleChoice: persisted.styleChoice,
    setStyleChoice,
    provider,
    model,
    setModel,
    canAdvance:
      availability === "ready" && model.length > 0 && !modelMissing,
    blockedReason,
    primaryDetail,
    availability,
    models,
    modelMissing,
    refetchModels: () => void refetch(),
    generate
  };
}

/** What the grid shows in place of tiles when the query answered otherwise. */
const ModelListState: React.FC<{
  availability: ModelAvailability;
  onRetry: () => void;
}> = ({ availability, onRetry }) => {
  if (availability === "loading") {
    return (
      <FlexRow gap={GAP.normal} align="center">
        <LoadingSpinner size="small" inline />
        <Text size="small" color="secondary">
          Loading the image models…
        </Text>
      </FlexRow>
    );
  }
  if (availability === "error") {
    return (
      <AlertBanner
        severity="error"
        action={
          <EditorButton variant="text" onClick={onRetry}>
            Try again
          </EditorButton>
        }
      >
        The image models could not be loaded.
      </AlertBanner>
    );
  }
  if (availability === "no-provider") {
    return (
      <AlertBanner severity="warning">
        No image provider is connected. Add one in Settings, then try again —
        your brief and look are saved with the document.
      </AlertBanner>
    );
  }
  return (
    <AlertBanner
      severity="warning"
      action={
        <EditorButton variant="text" onClick={onRetry}>
          Try again
        </EditorButton>
      }
    >
      None of the connected providers offers a model that renders a picture
      from text.
    </AlertBanner>
  );
};

export interface LookStepProps {
  look: LookStepControls;
}

export const LookStep: React.FC<LookStepProps> = ({ look }) => {
  const canvas = useSketchStore((state) => state.document.canvas);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);
  const { data: presets } = useStylePresets();
  const [browsing, setBrowsing] = useState(false);
  const { availability, models, modelMissing, setModel, setStyleChoice } = look;

  const sizeOptions = useMemo<OptionCardItem[]>(
    () =>
      SIZE_PRESETS.map((preset) => ({
        id: preset.id,
        title: preset.label,
        description: `${preset.width} × ${preset.height}`
      })),
    []
  );

  const selectedSizeId = sizePresetFor(canvas.width, canvas.height)?.id ?? null;

  const handleSize = useCallback(
    (id: string) => {
      const preset = SIZE_PRESETS.find((entry) => entry.id === id);
      if (preset) {
        resizeCanvas(preset.width, preset.height);
      }
    },
    [resizeCanvas]
  );

  const styleTiles = useMemo<PresetTile[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        description:
          STYLE_DESCRIPTIONS[preset.presetId] ?? preset.descriptor.trim(),
        image: preset.thumbnail
      })),
    [presets]
  );

  const offered = useMemo(() => models.slice(0, MAX_MODEL_TILES), [models]);
  const selectedTileId = look.model ? tileId(look.provider, look.model) : null;

  const sampleIds = useMemo(
    () => offered.map((entry) => entry.id),
    [offered]
  );
  const samples = useModelSamples(sampleIds, "image");

  const modelTiles = useMemo<PresetTile[]>(() => {
    const tiles: PresetTile[] = offered.map((entry) => ({
      id: tileId(entry.provider, entry.id),
      title: entry.name || entry.id,
      image: samples[entry.id]
    }));
    // A choice made before this grid was cut to twelve — or made against a
    // provider that has since gone — is still the creator's choice, so it is
    // on the grid where its selected state can be seen (F14).
    if (
      selectedTileId !== null &&
      !tiles.some((tile) => tile.id === selectedTileId)
    ) {
      const outside = models.find(
        (entry) =>
          entry.id === look.model && entry.provider === look.provider
      );
      const tile: (typeof tiles)[number] = {
        id: selectedTileId,
        title: outside?.name || look.model,
        image: samples[look.model]
      };
      if (modelMissing) {
        tile.disabled = true;
        tile.disabledReason =
          "This model is not offered by any connected provider.";
      }
      tiles.push(tile);
    }
    return tiles;
  }, [
    look.model,
    look.provider,
    modelMissing,
    models,
    offered,
    samples,
    selectedTileId
  ]);

  const handleStyle = useCallback(
    (id: string) => setStyleChoice(id),
    [setStyleChoice]
  );
  const handleModel = useCallback(
    (id: string) => {
      const separator = id.indexOf("/");
      setModel(id.slice(0, separator), id.slice(separator + 1));
    },
    [setModel]
  );
  const handleBrowsedModel = useCallback(
    (chosen: ImageModel) => {
      setModel(chosen.provider, chosen.id);
      setBrowsing(false);
    },
    [setModel]
  );
  const openBrowser = useCallback(() => setBrowsing(true), []);
  const closeBrowser = useCallback(() => setBrowsing(false), []);
  // The style grid's trailing tile is a real choice, so nothing adds anything.
  const noop = useCallback(() => undefined, []);

  return (
    <FlexColumn gap={GAP.spacious}>
      <Text size="big" component="h2">
        Choose the look
      </Text>

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Size
        </Text>
        <OptionCardGrid
          label="Size"
          options={sizeOptions}
          selectedId={selectedSizeId}
          onSelect={handleSize}
          minColumnWidth={160}
        />
      </FlexColumn>

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Style
        </Text>
        <PresetTileGrid
          label="Style"
          presets={styleTiles}
          selectedId={look.styleChoice}
          onSelect={handleStyle}
          onAddOwn={noop}
          addOwnOptionId={NO_STYLE_ID}
          addOwnLabel="No style"
          addOwnDescription="Render exactly what the brief says"
        />
      </FlexColumn>

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Image model
        </Text>
        {availability === "ready" ? (
          <>
            {modelMissing ? (
              <AlertBanner severity="warning">
                {`${look.model} is not offered by any connected provider. Pick another model, or browse all of them.`}
              </AlertBanner>
            ) : null}
            <PresetTileGrid
              label="Image model"
              presets={modelTiles}
              selectedId={selectedTileId}
              onSelect={handleModel}
              onAddOwn={openBrowser}
              addOwnLabel="All image models"
              aspectRatio="1/1"
              reservePreview
            />
          </>
        ) : (
          <ModelListState
            availability={availability}
            onRetry={look.refetchModels}
          />
        )}
      </FlexColumn>

      {/* Every configured provider's models, for the choice the twelve tiles
          do not cover. Loaded when it is asked for, so the step itself stays
          three pickers (F14). */}
      {browsing ? (
        <Suspense fallback={null}>
          <ImageModelMenuDialog
            open
            onClose={closeBrowser}
            onModelChange={handleBrowsedModel}
            task="text_to_image"
          />
        </Suspense>
      ) : null}
    </FlexColumn>
  );
};

export default LookStep;
