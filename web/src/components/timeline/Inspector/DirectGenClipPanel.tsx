/** @jsxImportSource @emotion/react */
/**
 * DirectGenClipPanel
 *
 * Inspector panel for a direct-generation clip (text-to-image /
 * image-to-image). Mirrors the sketch editor's `DirectGenLayerPanel`:
 * prompt + model + (optional) source-clip picker, with Generate/Cancel
 * driven by the same `useGenerateClip` API used elsewhere in the timeline.
 *
 * Workflow-bound clips render `GeneratedClipPanel` instead — dispatch
 * happens in `TimelineInspector`.
 */

import React, { memo, useCallback, useMemo } from "react";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useGenerateClip } from "../../../hooks/timeline/useGenerateClip";
import ImageModelSelect from "../../properties/ImageModelSelect";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  FlexColumn,
  FlexRow,
  Panel,
  SelectField,
  Text,
  TextInput
} from "../../ui_primitives";
import { GeneratedClipHeader } from "./GeneratedClipHeader";
import { ClipActions } from "./ClipActions";

export interface DirectGenClipPanelProps {
  clipId: string;
}

const sectionStyles = (theme: Theme) =>
  css({
    padding: theme.spacing(1)
  });

const DirectGenClipPanelInner: React.FC<DirectGenClipPanelProps> = ({
  clipId
}) => {
  const theme = useTheme();

  const clip = useTimelineStore((s) => s.clips.find((c) => c.id === clipId));
  const clips = useTimelineStore((s) => s.clips);
  const setClipPrompt = useTimelineStore((s) => s.setClipPrompt);
  const setClipDirectGenModel = useTimelineStore(
    (s) => s.setClipDirectGenModel
  );
  const patchClipBinding = useTimelineStore((s) => s.patchClipBinding);

  const {
    generateClip,
    cancelClipGeneration,
    isActive,
    isFailed
  } = useGenerateClip(clipId);

  const isImageToImage = clip?.bindingKind === "image-to-image";

  // Eligible image-to-image source clips: any other image/overlay clip with
  // a rendered asset in the sequence.
  const sourceOptions = useMemo(() => {
    if (!clip) return [];
    return clips
      .filter(
        (c) =>
          c.id !== clip.id &&
          (c.mediaType === "image" || c.mediaType === "overlay") &&
          !!c.currentAssetId
      )
      .map((c) => ({
        value: c.id,
        label: c.name || c.id.slice(0, 8)
      }));
  }, [clips, clip]);

  const handleModelChange = useCallback(
    (v: ImageModelValue) => {
      setClipDirectGenModel(clipId, v.provider, v.id);
    },
    [clipId, setClipDirectGenModel]
  );

  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setClipPrompt(clipId, e.target.value);
    },
    [clipId, setClipPrompt]
  );

  const handleSourceChange = useCallback(
    (value: string) => {
      patchClipBinding(clipId, { sourceClipId: value || null });
    },
    [clipId, patchClipBinding]
  );

  const handleKindToggle = useCallback(
    (target: "text-to-image" | "image-to-image") => {
      if (!clip || clip.bindingKind === target) return;
      patchClipBinding(clipId, { bindingKind: target });
    },
    [clip, clipId, patchClipBinding]
  );

  const handleGenerateClick = useCallback(() => {
    if (isActive) {
      void cancelClipGeneration();
    } else {
      void generateClip();
    }
  }, [isActive, cancelClipGeneration, generateClip]);

  if (!clip) {
    return null;
  }

  const canGenerate =
    !!clip.provider &&
    !!clip.model &&
    (clip.prompt ?? "").trim().length > 0 &&
    (!isImageToImage || !!clip.sourceClipId);

  return (
    <Panel sx={{ width: "100%", overflow: "auto" }}>
      <FlexColumn gap={0}>
        <GeneratedClipHeader clip={clip} />

        <CollapsibleSection title="Prompt" defaultOpen>
          <FlexColumn gap={1} css={sectionStyles(theme)}>
            <FlexRow gap={0.5}>
              <EditorButton
                size="small"
                variant={
                  clip.bindingKind === "text-to-image"
                    ? "contained"
                    : "outlined"
                }
                onClick={() => handleKindToggle("text-to-image")}
                data-testid="direct-gen-mode-t2i"
              >
                Text → Image
              </EditorButton>
              <EditorButton
                size="small"
                variant={isImageToImage ? "contained" : "outlined"}
                onClick={() => handleKindToggle("image-to-image")}
                data-testid="direct-gen-mode-i2i"
              >
                Image → Image
              </EditorButton>
            </FlexRow>

            <ImageModelSelect
              value={clip.model ?? ""}
              task={isImageToImage ? "image_to_image" : "text_to_image"}
              onChange={handleModelChange}
            />

            <TextInput
              value={clip.prompt ?? ""}
              onChange={handlePromptChange}
              placeholder="Describe the image…"
              multiline
              minRows={3}
              maxRows={10}
              compact
              fullWidth
              inputProps={{
                "aria-label": "Prompt",
                "data-testid": "direct-gen-prompt"
              }}
            />

            {isImageToImage && (
              sourceOptions.length === 0 ? (
                <Caption color="secondary">
                  No source clips with a rendered asset are available.
                </Caption>
              ) : (
                <SelectField
                  label="Source clip"
                  value={clip.sourceClipId ?? ""}
                  onChange={handleSourceChange}
                  options={sourceOptions}
                  size="small"
                />
              )
            )}

            <FlexRow gap={1} align="center" justify="space-between">
              <EditorButton
                size="small"
                variant={isActive ? "outlined" : "contained"}
                color={isActive ? "warning" : "primary"}
                disabled={!isActive && !canGenerate}
                onClick={handleGenerateClick}
                data-testid="direct-gen-generate"
              >
                {isActive ? "Cancel" : "Generate"}
              </EditorButton>
              {isFailed && (
                <Text
                  size="small"
                  sx={{ color: theme.vars.palette.error.main }}
                >
                  Generation failed.
                </Text>
              )}
            </FlexRow>
          </FlexColumn>
        </CollapsibleSection>

        <CollapsibleSection title="Actions" defaultOpen>
          <ClipActions clipId={clipId} />
        </CollapsibleSection>
      </FlexColumn>
    </Panel>
  );
};

export const DirectGenClipPanel = memo(DirectGenClipPanelInner);
DirectGenClipPanel.displayName = "DirectGenClipPanel";
