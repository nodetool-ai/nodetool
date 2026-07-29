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

import React, { memo, useCallback, useMemo } from "react";
import { useTheme } from "@mui/material/styles";
import TvIcon from "@mui/icons-material/Tv";
import TuneIcon from "@mui/icons-material/Tune";
import LayersIcon from "@mui/icons-material/Layers";
import type { Layer } from "../types";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import {
  Caption,
  FlexColumn,
  FlexRow,
  Panel,
  SelectField,
  Text,
  TextInput
} from "../../ui_primitives";
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
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";

// Defaults for image-to-image controls when the binding has no explicit
// value yet — same as the media chat composer's image_edit defaults.
const DEFAULT_STRENGTH = 0.65;
const DEFAULT_STEPS = 30;

export interface DirectGenLayerPanelProps {
  layer: Layer;
  binding: LayerWorkflowBinding;
}

const DirectGenLayerPanelInner: React.FC<DirectGenLayerPanelProps> = ({
  layer,
  binding
}) => {
  const theme = useTheme();
  const patchBinding = useSketchSessionStore((s) => s.patchBinding);
  const layers = useSketchStore((s) => s.document.layers);
  const { start, cancel } = useDirectGenJob();

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
      layers
        .filter((l) => l.id !== layer.id && l.type === "raster" && l.data !== null)
        .map((l) => ({ value: l.id, label: l.name })),
    [layers, layer.id]
  );

  const canGenerate =
    !!binding.provider &&
    !!binding.model &&
    (binding.prompt ?? "").trim().length > 0 &&
    (!isImageToImage || !!binding.sourceLayerId);

  return (
    <Panel
      sx={{
        width: "100%",
        overflow: "auto",
        backgroundColor: "transparent",
        border: "none",
        boxShadow: "none"
      }}
    >
      <FlexColumn gap={1.5} sx={{ px: 1, py: 1 }}>
        <ImageModelSelect
          value={binding.model ?? ""}
          task={isImageToImage ? "image_to_image" : "text_to_image"}
          onChange={handleModelChange}
        />

        <TextInput
          value={binding.prompt ?? ""}
          onChange={(e) => patchBinding(layer.id, { prompt: e.target.value })}
          placeholder="Describe the image…"
          multiline
          minRows={3}
          maxRows={8}
          compact
        />

        <FlexRow gap={0.5} align="center" sx={{ flexWrap: "wrap" }}>
          <MediaOptionChip
            icon={<TvIcon fontSize="small" />}
            header="Resolution"
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
                label={`Strength ${(binding.strength ?? DEFAULT_STRENGTH).toFixed(2)}`}
                header="Edit Strength"
                value={binding.strength ?? DEFAULT_STRENGTH}
                options={strengthOptions}
                onChange={(s) => patchBinding(layer.id, { strength: s })}
              />
              <MediaOptionChip
                icon={<LayersIcon fontSize="small" />}
                label={`${binding.numInferenceSteps ?? DEFAULT_STEPS} steps`}
                header="Inference Steps"
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
              No source layers available - paint something on a layer first.
            </Caption>
          ) : (
            <SelectField
              label="Source"
              value={binding.sourceLayerId ?? ""}
              onChange={(v) =>
                patchBinding(layer.id, { sourceLayerId: v ? v : null })
              }
              options={sourceLayerOptions}
              size="small"
            />
          ))}

        {isRunning ? (
          <EditorButton
            size="small"
            variant="outlined"
            color="warning"
            onClick={() => cancel(layer.id)}
          >
            Cancel
          </EditorButton>
        ) : (
          <EditorButton
            size="small"
            variant="contained"
            disabled={!canGenerate}
            onClick={() => void start(layer.id)}
            data-testid="direct-gen-generate"
          >
            {binding.currentAssetId ? "Regenerate" : "Generate"}
          </EditorButton>
        )}
        {binding.status === "failed" && (
          <Text size="small" sx={{ color: theme.vars.palette.error.main }}>
            Generation failed.
          </Text>
        )}
        {binding.status === "generated" && binding.currentAssetId && (
          <Caption color="secondary">
            Done. Asset {binding.currentAssetId.slice(0, 8)}.
          </Caption>
        )}
      </FlexColumn>
    </Panel>
  );
};

export const DirectGenLayerPanel = memo(DirectGenLayerPanelInner);
DirectGenLayerPanel.displayName = "DirectGenLayerPanel";
