/** @jsxImportSource @emotion/react */
/**
 * DirectGenLayerPanel
 *
 * Inspector for text-to-image / image-to-image layers. Reads the binding
 * from `useSketchSessionStore` — the same store that backs
 * workflow-bound generated layers. Volatile in-flight job state (jobId,
 * progress) lives in `useSketchGenerationStore`; persisted status / versions
 * live on the binding itself.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import TvIcon from "@mui/icons-material/Tv";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";
import type { Layer } from "../types";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Panel,
  SPACING,
  SelectField,
  TextArea
} from "../../ui_primitives";
import { sketchFieldSx } from "../sketchStyles";
import { EditorButton } from "../../editor_ui";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import {
  MediaAspectChip,
  MediaOptionChip
} from "../../chat/composer/MediaSettingChips";
import {
  buildImageEditOptions,
  buildImageModelOptions
} from "../../chat/composer/imageModelOptions";
import {
  deriveImageSizePreset,
  resolveImageSize,
  type ImageResolution
} from "../../../stores/MediaGenerationStore";
import { useMediaOptions } from "../../../hooks/useModelsByProvider";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../state/useSketchStore";
import {
  directGenFailure,
  useDirectGenJob
} from "../../../hooks/sketch/useDirectGenJob";
import { useLayerCostEstimate } from "../../../hooks/sketch/useLayerCostEstimate";
import CostEstimateLine from "../../costs/CostEstimateLine";
import { generationCostLine } from "../../costs/costLine";
import { directGenSourceLayers } from "./directGenSources";

// Defaults for image-to-image controls when the binding has no explicit
// value yet — same as the media chat composer's image_edit defaults.
const DEFAULT_STRENGTH = 0.65;
const DEFAULT_STEPS = 30;

interface DirectGenLayerPanelProps {
  layer: Layer;
  binding: LayerWorkflowBinding;
}

const DirectGenLayerPanelInner: React.FC<DirectGenLayerPanelProps> = ({
  layer,
  binding
}) => {
  const { t, i18n } = useTranslation();
  const patchBinding = useSketchSessionStore((s) => s.patchBinding);
  const layers = useSketchStore((s) => s.document.layers);
  const { start, cancel } = useDirectGenJob();
  // The inspector can put Generate below its fold, where the tool bar's own
  // Generate (a separate text-to-image form) is the one in sight.
  const generateRef = useRef<HTMLButtonElement>(null);
  const revealGenerate = useCallback(() => {
    generateRef.current?.scrollIntoView({ block: "nearest" });
  }, []);
  // A layer just made from "From image" or "From text" opens with its
  // Generate below the fold at 1440 × 900, so bring it into view once.
  const isFreshDraft =
    binding.status === "draft" &&
    !binding.prompt &&
    !binding.currentAssetId &&
    binding.versions.length === 0;
  const isFreshDraftRef = useRef(isFreshDraft);
  isFreshDraftRef.current = isFreshDraft;
  useEffect(() => {
    if (isFreshDraftRef.current) {
      revealGenerate();
    }
  }, [layer.id, revealGenerate]);
  // Written before the status flips to failed, so this render already has it.
  const failure =
    binding.status === "failed" ? directGenFailure(layer.id) : null;

  const handleModelChange = useCallback(
    (v: ImageModelValue) => {
      patchBinding(layer.id, { provider: v.provider, model: v.id });
    },
    [layer.id, patchBinding]
  );

  const isImageToImage = binding.kind === "image-to-image";
  const isRunning =
    binding.status === "queued" || binding.status === "generating";

  // Older bindings carry only width/height; derive the nearest preset so the
  // chips reflect the actual output size instead of a fixed default.
  const sizeSeed = useMemo(
    () => deriveImageSizePreset(binding.width ?? 1024, binding.height ?? 1024),
    [binding.width, binding.height]
  );
  const resolution =
    (binding.resolution as ImageResolution | undefined) ?? sizeSeed.resolution;
  const aspectRatio = binding.aspectRatio ?? sizeSeed.aspectRatio;

  // Option lists constrained by the selected model's manifest — same source
  // as the media chat composer, so both surfaces offer identical choices.
  const mediaOptions = useMediaOptions({
    provider: binding.provider,
    model: binding.model,
    task: "image"
  });
  const { aspectOptions, resolutionOptions } = useMemo(
    () =>
      buildImageModelOptions({
        aspectRatios: mediaOptions.data?.aspectRatios,
        resolutions: mediaOptions.data?.resolutions
      }),
    [mediaOptions.data]
  );
  const { strengthOptions, stepsOptions } = useMemo(buildImageEditOptions, []);

  const applySize = useCallback(
    (nextResolution: ImageResolution, nextAspect: string) => {
      const { width, height } = resolveImageSize(nextResolution, nextAspect);
      patchBinding(layer.id, {
        resolution: nextResolution,
        aspectRatio: nextAspect,
        width,
        height
      });
    },
    [layer.id, patchBinding]
  );

  const sourceLayerOptions = useMemo(
    () =>
      directGenSourceLayers(layers, layer.id).map((l) => ({
        value: l.id,
        label: l.name
      })),
    [layers, layer.id]
  );

  // What pressing Generate spends, at the model and size picked above.
  const costEstimate = useLayerCostEstimate(binding);

  const canGenerate =
    !!binding.provider &&
    !!binding.model &&
    (binding.prompt ?? "").trim().length > 0 &&
    (!isImageToImage || !!binding.sourceLayerId);
  // Tells the user what still blocks Generate, in the order they fill the panel.
  let generateBlocker: string | undefined;
  if (!binding.provider || !binding.model) {
    generateBlocker = t("screens4_25.sketch.directGen.pickModel");
  } else if ((binding.prompt ?? "").trim().length === 0) {
    generateBlocker = t("screens4_25.sketch.directGen.writePrompt");
  } else if (isImageToImage && !binding.sourceLayerId) {
    generateBlocker = t("screens4_25.sketch.directGen.pickSourceLayer");
  }
  const strengthLabel = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(binding.strength ?? DEFAULT_STRENGTH);
  const formattedSteps = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language).format(
    binding.numInferenceSteps ?? DEFAULT_STEPS
  );
  const failureRemedy = failure
    ? (() => {
        switch (failure.kind) {
          case "no-model":
            return t("screens4_25.sketch.directGen.failureNoModel");
          case "no-prompt":
            return t("screens4_25.sketch.directGen.failureNoPrompt");
          case "no-source":
            return t("screens4_25.sketch.directGen.failureNoSource");
          case "auth":
            return t("screens4_25.sketch.directGen.failureAuth");
          case "quota":
            return t("screens4_25.sketch.directGen.failureQuota");
          case "refused":
            return t("screens4_25.sketch.directGen.failureRefused");
          case "timeout":
            return t("screens4_25.sketch.directGen.failureTimeout");
          case "network":
            return t("screens4_25.sketch.directGen.failureNetwork");
          case "provider":
            return t("screens4_25.sketch.directGen.failureProvider");
          case "unknown":
            return t("screens4_25.sketch.directGen.failureUnknown");
        }
      })()
    : undefined;
  const failureDescription = failureRemedy
    ? failure?.detail
      ? t("screens4_25.sketch.directGen.failureWithDetail", {
          message: failureRemedy,
          detail: failure.detail
        })
      : failureRemedy
    : t("screens4_25.sketch.directGen.generationFailed");

  return (
    <Panel
      padding="none"
      sx={{
        width: "100%",
        overflow: "auto",
        backgroundColor: "transparent",
        border: "none",
        boxShadow: "none"
      }}
    >
      <FlexColumn gap={SPACING.md} sx={{ px: SPACING.lg, pb: SPACING.lg }}>
        <ImageModelSelect
          value={binding.model ?? ""}
          provider={binding.provider}
          task={isImageToImage ? "image_to_image" : "text_to_image"}
          onChange={handleModelChange}
        />

        <TextArea
          value={binding.prompt ?? ""}
          onChange={(value) => patchBinding(layer.id, { prompt: value })}
          onFocus={revealGenerate}
          placeholder={t("screens4_25.sketch.directGen.promptPlaceholder")}
          aria-label={t("screens4_25.sketch.directGen.promptLabel")}
          sx={{ "& .MuiOutlinedInput-root": sketchFieldSx }}
          minRows={3}
          maxRows={8}
          compact
        />

        <FlexRow gap={SPACING.micro} align="center" sx={{ flexWrap: "wrap" }}>
          <MediaOptionChip
            icon={<TvIcon fontSize="small" />}
            header={t("screens4_25.sketch.directGen.resolution")}
            value={resolution}
            options={resolutionOptions}
            onChange={(r) => applySize(r, aspectRatio)}
          />
          <MediaAspectChip
            value={aspectRatio}
            options={aspectOptions}
            onChange={(a) => applySize(resolution, a)}
          />
          {isImageToImage && (
            <>
              <MediaOptionChip
                icon={<TuneIcon fontSize="small" />}
                label={t("screens4_25.sketch.directGen.strengthLabel", { strength: strengthLabel })}
                header={t("screens4_25.sketch.directGen.editStrength")}
                value={binding.strength ?? DEFAULT_STRENGTH}
                options={strengthOptions}
                onChange={(s) => patchBinding(layer.id, { strength: s })}
              />
              <MediaOptionChip
                icon={<LayersIcon fontSize="small" />}
                label={t("screens4_25.sketch.directGen.inferenceStepsLabel", {
                  count: binding.numInferenceSteps ?? DEFAULT_STEPS,
                  formattedCount: formattedSteps
                })}
                header={t("screens4_25.sketch.directGen.inferenceSteps")}
                value={binding.numInferenceSteps ?? DEFAULT_STEPS}
                options={stepsOptions}
                onChange={(n) =>
                  patchBinding(layer.id, { numInferenceSteps: n })
                }
              />
            </>
          )}
        </FlexRow>

        {isImageToImage &&
          (sourceLayerOptions.length === 0 ? (
            <Caption color="secondary">
              {t("screens4_25.sketch.directGen.noSourceLayers")}
            </Caption>
          ) : (
            <SelectField
              label={t("screens4_25.sketch.directGen.source")}
              value={binding.sourceLayerId ?? ""}
              onChange={(v) =>
                patchBinding(layer.id, { sourceLayerId: v ? v : null })
              }
              options={sourceLayerOptions}
              size="small"
            />
          ))}

        <FlexRow justify="flex-end" fullWidth>
          <CostEstimateLine
            estimate={generationCostLine(costEstimate)}
            title={t("screens4_25.sketch.directGen.estimatedCost")}
          />
        </FlexRow>

        {isRunning ? (
          <EditorButton
            size="small"
            variant="text"
            color="inherit"
            onClick={() => cancel(layer.id)}
          >
            {t("screens4_25.sketch.directGen.cancel")}
          </EditorButton>
        ) : (
          <EditorButton
            size="small"
            variant="contained"
            ref={generateRef}
            disabled={!canGenerate}
            disabledReason={generateBlocker}
            onClick={() => void start(layer.id)}
            data-testid="direct-gen-generate"
          >
            {binding.currentAssetId
              ? t("screens4_25.sketch.directGen.regenerate")
              : t("screens4_25.sketch.directGen.generate")}
          </EditorButton>
        )}
        {binding.status === "failed" && (
          <ErrorBanner
            report={{
              source: "job-failure",
              summary: t("screens4_25.sketch.directGen.failureSummary"),
              errorText: failure ? failureDescription : undefined
            }}
          >
            {failureDescription}
          </ErrorBanner>
        )}
        {binding.status === "generated" && binding.currentAssetId && (
          <Caption color="secondary">
            {t("screens4_25.sketch.directGen.assetCreated", { assetId: binding.currentAssetId.slice(0, 8) })}
          </Caption>
        )}
      </FlexColumn>
    </Panel>
  );
};

export const DirectGenLayerPanel = memo(DirectGenLayerPanelInner);
DirectGenLayerPanel.displayName = "DirectGenLayerPanel";
