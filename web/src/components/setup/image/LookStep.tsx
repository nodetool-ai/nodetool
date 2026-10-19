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
 * The model list is a query, so the step says which of its four answers it
 * got — loading, failed, no provider connected, nothing compatible — instead
 * of showing an empty grid and a dead button (F14). A remembered model that is
 * no longer offered is shown as the choice it is, and blocks the button until
 * it is replaced.
 */

import React, { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { STYLE_DESCRIPTIONS } from "../styleDescriptions";
import { formatUsd } from "@nodetool-ai/model-pricing";
import { composeImagePrompt } from "@nodetool-ai/protocol/api-schemas/sketch.js";

import {
  AlertBanner,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  LoadingSpinner,
  Text
} from "../../ui_primitives";
import { useSketchStore } from "../../sketch/state/useSketchStore";
import type { ImageModel, ImageModelValue } from "../../../stores/ApiTypes";
import { useEntities } from "../../../serverState/useEntities";
import {
  mergeStylePresetEntities,
  useStylePresets
} from "../../../serverState/useStylePresets";
import { useImageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useLastModelStore } from "../../../stores/lastModelStore";
import useModelPreferencesStore from "../../../stores/ModelPreferencesStore";
import { openProviderOnboarding } from "../../../stores/ProviderOnboardingStore";
import { estimateGenerationCost } from "../../../utils/generationCostEstimate";
import { useGenerateVariations } from "../../../hooks/sketch/useGenerateVariations";
import { OptionCardGrid, type OptionCardItem } from "../OptionCardGrid";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import ImageModelSelect from "../../properties/ImageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
import { SetupFooterField } from "../SetupFooterField";
import {
  sizePresetFor,
  sizePresetsForAspectRatios,
  type SizePreset
} from "./sizes";
import {
  NO_STYLE_ID,
  modelChoicePatch,
  readLookSelection,
  styleChoicePatch
} from "./lookSelection";

/** Which of the model list's answers the step got (F14). */
export type ModelAvailability =
  | "loading"
  | "error"
  | "no-provider"
  | "no-model"
  | "ready";

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
  /** What one more image costs: a contact sheet Regenerate. */
  perImageDetail: string | undefined;
  /** The model list's state, and what the body renders in its place. */
  availability: ModelAvailability;
  models: readonly ImageModel[];
  /** Guided canvas sizes the selected model accepts. */
  sizePresets: readonly SizePreset[];
  /** True while the chosen model is not one the providers offer. */
  modelMissing: boolean;
  refetchModels: () => void;
  /**
   * Write the terminal stage, then enqueue one layer per variation. Returns
   * the batch's layer ids, in contact-sheet order. `onCreated` receives the
   * same ids before any job is started.
   */
  generate: (
    onCreated?: (layerIds: readonly string[]) => void
  ) => Promise<string[]>;
}

/**
 * The generate action and its price. Separate from the body because the button
 * lives on the shell, and the host should not have to reassemble the batch
 * path to fill it in.
 */
export function useLookStep(): LookStepControls {
  const { t } = useTranslation();
  const setup = useSketchStore((state) => state.document.setup);
  const setSetup = useSketchStore((state) => state.setSetup);
  const remembered = useLastModelStore((state) => state.byKind.image);
  const remember = useLastModelStore((state) => state.remember);
  const imageDefault = useModelPreferencesStore(
    (state) => state.defaults["image_model"]
  );
  // The tiles are shipped presets filed under project "default", so the
  // active project's entities alone would never find the chosen one.
  const { data: projectEntities, isLoading: entitiesLoading } = useEntities();
  const { data: presets, isLoading: presetsLoading } = useStylePresets();
  const entities = useMemo(
    () => mergeStylePresetEntities(projectEntities, presets),
    [presets, projectEntities]
  );
  const { generateVariations } = useGenerateVariations();
  const { models, providers, isLoading, error, refetch } =
    useImageModelsByProvider({ task: "text_to_image" });

  const variations = setup?.variations ?? 1;
  const canvas = useSketchStore((state) => state.document.canvas);

  const persisted = useMemo(() => readLookSelection(setup), [setup]);
  // The document wins over the remembered pick: it is what this image was set
  // up with, while `lastModelStore` is what the creator used somewhere else.
  // With neither, the Settings default image model applies, which connecting
  // a provider fills in.
  const provider =
    persisted.provider || remembered?.provider || imageDefault?.provider || "";
  const model = persisted.model || remembered?.model || imageDefault?.id || "";

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

  const choice = persisted.styleChoice;
  const styleChosen = choice !== null && choice !== NO_STYLE_ID;
  const styleEntity = useMemo(
    () =>
      styleChosen ? entities.find((entity) => entity.id === choice) : undefined,
    [choice, entities, styleChosen]
  );
  const styleDescriptor = styleEntity?.descriptor ?? "";
  // A batch started before the style is read would render without it.
  const styleLoading =
    styleChosen && !styleEntity && (entitiesLoading || presetsLoading);

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
    !models.some((entry) => entry.id === model && entry.provider === provider);

  const selectedModel = useMemo(
    () =>
      models.find((entry) => entry.id === model && entry.provider === provider),
    [model, models, provider]
  );
  const sizePresets = useMemo(
    () => sizePresetsForAspectRatios(selectedModel?.aspect_ratios),
    [selectedModel?.aspect_ratios]
  );
  const selectedSize = sizePresetFor(canvas.width, canvas.height);
  const sizeUnsupported =
    selectedModel?.aspect_ratios != null &&
    selectedModel.aspect_ratios.length > 0 &&
    (!selectedSize ||
      !selectedModel.aspect_ratios.includes(selectedSize.aspectRatio));

  const generate = useCallback(
    async (
      onCreated?: (layerIds: readonly string[]) => void
    ): Promise<string[]> => {
      const current = useSketchStore.getState().document.setup;
      const size = useSketchStore.getState().document.canvas;
      const created = await generateVariations(
        {
          prompt: composeImagePrompt(current, styleDescriptor),
          provider,
          model,
          width: size.width,
          height: size.height,
          aspectRatio: sizePresetFor(size.width, size.height)?.aspectRatio,
          count: current?.variations ?? 1
        },
        { onCreated }
      );
      return created.map((variation) => variation.layerId);
    },
    [generateVariations, model, provider, styleDescriptor]
  );

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
      ? t("pass3_8.image.look.cost.total", {
          count: variations,
          cost: formatUsd(estimate.total)
        })
      : undefined;
  const perImageDetail =
    estimate && estimate.total > 0
      ? t("pass3_8.image.look.cost.perImage", {
          cost: formatUsd(estimate.total / variations)
        })
      : undefined;

  const blockedReason =
    availability === "loading"
      ? t("pass3_8.image.look.blocked.loading")
      : availability === "error"
        ? t("pass3_8.image.look.blocked.loadError")
        : availability === "no-provider"
          ? t("pass3_8.image.look.blocked.noProvider")
          : availability === "no-model"
            ? t("pass3_8.image.look.blocked.noModel")
            : modelMissing
              ? t("pass3_8.image.look.blocked.modelUnavailable")
              : sizePresets.length === 0
                ? t("pass3_8.image.look.blocked.noSupportedSize")
                : sizeUnsupported
                  ? t("pass3_8.image.look.blocked.unsupportedSize")
                  : styleLoading
                    ? t("pass3_8.image.look.blocked.styleLoading")
                    : t("pass3_8.image.look.blocked.chooseModel");

  return {
    styleChoice: persisted.styleChoice,
    setStyleChoice,
    provider,
    model,
    setModel,
    canAdvance:
      availability === "ready" &&
      model.length > 0 &&
      !modelMissing &&
      sizePresets.length > 0 &&
      !sizeUnsupported &&
      !styleLoading,
    blockedReason,
    primaryDetail,
    perImageDetail,
    availability,
    models,
    sizePresets,
    modelMissing,
    refetchModels: () => void refetch(),
    generate
  };
}

/** Open the provider dialog filtered to providers that make images. */
const connectImageProvider = (reason: string): void => {
  openProviderOnboarding({
    capability: "text_to_image",
    reason
  });
};

/** What the grid shows in place of tiles when the query answered otherwise. */
const ModelListState: React.FC<{
  availability: ModelAvailability;
  onRetry: () => void;
}> = ({ availability, onRetry }) => {
  const { t } = useTranslation();
  if (availability === "loading") {
    return (
      <FlexRow gap={GAP.normal} align="center">
        <LoadingSpinner size="small" inline />
        <Text size="small" color="secondary">
          {t("pass3_8.image.look.models.loading")}
        </Text>
      </FlexRow>
    );
  }
  if (availability === "error") {
    return (
      <AlertBanner
        severity="error"
        action={
          <FlexRow gap={GAP.tight} align="center">
            <EditorButton variant="text" onClick={onRetry}>
              {t("pass3_8.common.tryAgain")}
            </EditorButton>
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t("pass3_8.image.look.models.failureSummary")
              }}
            />
          </FlexRow>
        }
      >
        {t("pass3_8.image.look.models.loadError")}
      </AlertBanner>
    );
  }
  if (availability === "no-provider") {
    return (
      <AlertBanner
        severity="warning"
        action={
          <EditorButton
            variant="text"
            onClick={() =>
              connectImageProvider(t("pass3_8.image.look.models.connectReason"))
            }
          >
            {t("pass3_8.image.look.models.connectProvider")}
          </EditorButton>
        }
      >
        {t("pass3_8.image.look.models.noProvider")}
      </AlertBanner>
    );
  }
  return (
    <AlertBanner
      severity="warning"
      action={
        <EditorButton variant="text" onClick={onRetry}>
          {t("pass3_8.common.tryAgain")}
        </EditorButton>
      }
    >
      {t("pass3_8.image.look.models.noCompatibleModel")}
    </AlertBanner>
  );
};

export interface LookStepProps {
  look: LookStepControls;
}

/**
 * The image model, for the shell's footer, once the list is ready. Picking a
 * model that cannot draw the current size moves the canvas to one it can.
 */
export const ImageModelFooterField: React.FC<{
  look: LookStepControls;
  readOnly?: boolean;
}> = ({ look, readOnly = false }) => {
  const { t } = useTranslation();
  const canvas = useSketchStore((state) => state.document.canvas);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);
  const { setModel } = look;
  const handleModel = useCallback(
    (chosen: ImageModelValue) => {
      setModel(chosen.provider, chosen.id);
      const selected = look.models.find(
        (entry) => entry.id === chosen.id && entry.provider === chosen.provider
      );
      const supported = sizePresetsForAspectRatios(selected?.aspect_ratios);
      const current = sizePresetFor(canvas.width, canvas.height);
      if (
        supported.length > 0 &&
        (!current ||
          !supported.some(
            (preset) => preset.aspectRatio === current.aspectRatio
          ))
      ) {
        resizeCanvas(supported[0].width, supported[0].height);
      }
    },
    [canvas.height, canvas.width, look.models, resizeCanvas, setModel]
  );
  if (look.availability !== "ready") {
    return null;
  }
  return (
    <SetupFooterField label={t("pass3_8.image.look.modelLabel")}>
      <ImageModelSelect
        value={look.model}
        provider={look.provider}
        onChange={handleModel}
        task="text_to_image"
        disabled={readOnly}
      />
    </SetupFooterField>
  );
};

export const LookStep: React.FC<LookStepProps> = ({ look }) => {
  const { t } = useTranslation();
  const canvas = useSketchStore((state) => state.document.canvas);
  const resizeCanvas = useSketchStore((state) => state.resizeCanvas);
  const { data: presets } = useStylePresets();
  const { availability, modelMissing, setStyleChoice } = look;

  const sizeOptions = useMemo<OptionCardItem[]>(
    () =>
      look.sizePresets.map((preset) => ({
        id: preset.id,
        title: t(`pass3_8.image.look.sizes.${preset.id}`),
        description: `${preset.width} × ${preset.height}`
      })),
    [look.sizePresets, t]
  );

  const selectedSizeId = sizePresetFor(canvas.width, canvas.height)?.id ?? null;

  const handleSize = useCallback(
    (id: string) => {
      const preset = look.sizePresets.find((entry) => entry.id === id);
      if (preset) {
        resizeCanvas(preset.width, preset.height);
      }
    },
    [look.sizePresets, resizeCanvas]
  );

  const styleTiles = useMemo<PresetTile[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        description:
          t(`pass3_8.image.look.styles.${preset.presetId}`, {
            defaultValue:
              STYLE_DESCRIPTIONS[preset.presetId] ?? preset.descriptor.trim()
          }),
        image: preset.thumbnail
      })),
    [presets, t]
  );

  const handleStyle = useCallback(
    (id: string) => setStyleChoice(id),
    [setStyleChoice]
  );
  // The style grid's trailing tile is a real choice, so nothing adds anything.
  const noop = useCallback(() => undefined, []);

  return (
    <FlexColumn gap={GAP.spacious}>
      <Text size="big" component="h2">
        {t("pass3_8.image.look.heading")}
      </Text>

      <FormField label={t("pass3_8.image.look.sizeLabel")}>
        <OptionCardGrid
          label={t("pass3_8.image.look.sizeLabel")}
          options={sizeOptions}
          selectedId={selectedSizeId}
          onSelect={handleSize}
          minColumnWidth={160}
        />
      </FormField>

      <FormField label={t("pass3_8.image.look.styleLabel")}>
        <PresetTileGrid
          label={t("pass3_8.image.look.styleLabel")}
          presets={styleTiles}
          selectedId={look.styleChoice}
          onSelect={handleStyle}
          onAddOwn={noop}
          addOwnOptionId={NO_STYLE_ID}
          addOwnLabel={t("pass3_8.image.look.noStyle")}
          addOwnDescription={t("pass3_8.image.look.noStyleDescription")}
        />
      </FormField>

      {/* A ready list is picked from the shell's footer; what is wrong with
          the list or the pick is said here, where there is room for it. */}
      {availability === "ready" ? (
        modelMissing ? (
          <AlertBanner severity="warning">
            {t("pass3_8.image.look.modelUnavailable", { model: look.model })}
          </AlertBanner>
        ) : null
      ) : (
        <FormField label={t("pass3_8.image.look.modelLabel")}>
          <ModelListState
            availability={availability}
            onRetry={look.refetchModels}
          />
        </FormField>
      )}
    </FlexColumn>
  );
};

export default LookStep;
