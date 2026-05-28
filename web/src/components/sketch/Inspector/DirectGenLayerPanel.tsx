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

import React, { memo, useCallback } from "react";
import { useTheme } from "@mui/material/styles";
import type { Layer } from "../types";
import type { LayerWorkflowBinding } from "@nodetool-ai/image-editor";
import {
  Caption,
  FlexColumn,
  Panel,
  SelectField,
  Text,
  TextInput
} from "../../ui_primitives";
import { EditorButton } from "../../editor_ui";
import {
  SketchModeToggle,
  SketchModeOption
} from "../tool-settings-panels/SketchModeToggle";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import { useSketchStore } from "../state/useSketchStore";
import { useDirectGenJob } from "../../../hooks/sketch/useDirectGenJob";

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

  // Output size — width/height are sent through to generate_media (honored by
  // the text-to-image and image-to-image paths). Only the square presets are
  // surfaced here; an unset size falls back to the model default.
  const SIZE_PRESETS = [512, 1024, 1536, 2048] as const;
  const currentSize =
    binding.width && binding.width === binding.height ? binding.width : null;

  const sourceLayerOptions = layers
    .filter((l) => l.id !== layer.id && l.type === "raster" && l.data !== null)
    .map((l) => ({ value: l.id, label: l.name }));

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
      <FlexColumn gap={1.25} sx={{ px: 1, py: 1 }}>
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

        <FlexColumn gap={0.5}>
          <Caption color="secondary">Size</Caption>
          <SketchModeToggle
            value={currentSize}
            exclusive
            onChange={(_e, v: number | null) => {
              if (v != null) {
                patchBinding(layer.id, { width: v, height: v });
              }
            }}
            sx={{ flexWrap: "wrap" }}
            aria-label="Output size"
          >
            {SIZE_PRESETS.map((s) => (
              <SketchModeOption
                key={s}
                value={s}
                data-testid={`direct-gen-size-${s}`}
              >
                {s}²
              </SketchModeOption>
            ))}
          </SketchModeToggle>
        </FlexColumn>

        {isImageToImage &&
          (sourceLayerOptions.length === 0 ? (
            <Caption color="secondary">
              No source layers available — paint something on a layer first.
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
            Generate
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
