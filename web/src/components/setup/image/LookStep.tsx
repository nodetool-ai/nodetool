/**
 * Step 3 of the image flow — size, style and model (PRD § 10.3).
 *
 * The step body is three pickers; the generate button lives on the `SetupFlow`
 * shell, so `useLookStep` hands the flow config what that button needs. Two
 * rules shape the file:
 *
 * - D21 — the style tiles are the same twelve `style` entities the storyboard
 *   flow seeds, read through `useStylePresets`. One library, one meaning for
 *   "Noir", whichever flow applied it.
 * - D3 — the persisted stage is the only completion signal. `generate` writes
 *   `done` before it enqueues anything.
 *
 * Sample stills are fetched on first use, never shipped (R5) — the same probe
 * the video flow's model tiles use, see `../modelSamples.ts`. A model whose
 * sample has not been published falls back to its name set in the sample box,
 * which is what `PresetTileGrid` does when a preset has no picture.
 */

import React, { useCallback, useMemo, useState } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import { composeImagePrompt } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import { FlexColumn, GAP, Text } from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
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

/** How many image models the grid offers before it becomes a wall of tiles. */
const MAX_MODEL_TILES = 12;

/** What the creator has picked, and what pressing the button will do with it. */
export interface LookStepControls {
  styleEntityId: string | null;
  provider: string;
  model: string;
  setStyleEntityId: (entityId: string | null) => void;
  setModel: (provider: string, model: string) => void;
  /** False until a model is chosen — nothing can be rendered without one. */
  canAdvance: boolean;
  /** What the click spends, or undefined when nothing priced it. */
  primaryDetail: string | undefined;
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
  const [styleEntityId, setStyleEntityId] = useState<string | null>(null);
  const remembered = useLastModelStore((state) => state.byKind.image);
  const remember = useLastModelStore((state) => state.remember);
  const [picked, setPicked] = useState<{ provider: string; model: string } | null>(
    null
  );
  const { data: entities } = useEntities();
  const { generateVariations } = useGenerateVariations();

  const variations = useSketchStore(
    (state) => state.document.setup?.variations ?? 1
  );
  const canvas = useSketchStore((state) => state.document.canvas);

  const provider = picked?.provider ?? remembered?.provider ?? "";
  const model = picked?.model ?? remembered?.model ?? "";

  const setModel = useCallback(
    (nextProvider: string, nextModel: string) => {
      setPicked({ provider: nextProvider, model: nextModel });
      remember("image", { provider: nextProvider, model: nextModel });
    },
    [remember]
  );

  const styleDescriptor = useMemo(
    () =>
      (entities ?? []).find((entity) => entity.id === styleEntityId)
        ?.descriptor ?? "",
    [entities, styleEntityId]
  );

  const generate = useCallback(async (): Promise<string[]> => {
    const setup = useSketchStore.getState().document.setup;
    const size = useSketchStore.getState().document.canvas;
    const created = await generateVariations({
      prompt: composeImagePrompt(setup, styleDescriptor),
      provider,
      model,
      width: size.width,
      height: size.height,
      aspectRatio: sizePresetFor(size.width, size.height)?.aspectRatio,
      count: variations
    });
    return created.map((variation) => variation.layerId);
  }, [generateVariations, model, provider, styleDescriptor, variations]);

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

  return {
    styleEntityId,
    setStyleEntityId,
    provider,
    model,
    setModel,
    canAdvance: model.length > 0,
    primaryDetail,
    generate
  };
}

export interface LookStepProps {
  look: LookStepControls;
}

export const LookStep: React.FC<LookStepProps> = ({ look }) => {
  const canvas = useSketchStore((state) => state.document.canvas);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);
  const { data: presets } = useStylePresets();
  const { models } = useImageModelsByProvider({ task: "text_to_image" });

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
        image: preset.thumbnail
      })),
    [presets]
  );

  const sampleIds = useMemo(
    () => models.slice(0, MAX_MODEL_TILES).map((entry) => entry.id),
    [models]
  );
  const samples = useModelSamples(sampleIds, "image");

  const modelTiles = useMemo<PresetTile[]>(
    () =>
      models.slice(0, MAX_MODEL_TILES).map((entry) => ({
        id: `${entry.provider}/${entry.id}`,
        title: entry.name || entry.id,
        image: samples[entry.id]
      })),
    [models, samples]
  );

  const { setStyleEntityId, setModel } = look;
  const handleStyle = useCallback(
    (entityId: string) => setStyleEntityId(entityId),
    [setStyleEntityId]
  );
  const clearStyle = useCallback(() => setStyleEntityId(null), [setStyleEntityId]);
  const handleModel = useCallback(
    (id: string) => {
      const separator = id.indexOf("/");
      setModel(id.slice(0, separator), id.slice(separator + 1));
    },
    [setModel]
  );
  // Nothing to add here: the model list is what the configured providers
  // report, so the trailing tile clears the style instead.
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
          selectedId={look.styleEntityId}
          onSelect={handleStyle}
          onAddOwn={clearStyle}
          addOwnLabel="No style"
        />
      </FlexColumn>

      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Image model
        </Text>
        <PresetTileGrid
          label="Image model"
          presets={modelTiles}
          selectedId={look.model ? `${look.provider}/${look.model}` : null}
          onSelect={handleModel}
          onAddOwn={noop}
          addOwnLabel="More models in the editor"
          addOwnDisabled
          addOwnDisabledReason="Pick any other model from the layer inspector once the editor is open."
          aspectRatio="1/1"
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default LookStep;
