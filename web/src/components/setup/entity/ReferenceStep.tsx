import { useCallback, useState } from "react";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { getRememberedModel, useLastModelStore } from "../../../stores/lastModelStore";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import ImageModelSelect from "../../properties/ImageModelSelect";
import {
  AlertBanner,
  BORDER_RADIUS,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  LoadingSpinner,
  ResponsiveImage,
  Text,
  TextInput
} from "../../ui_primitives";
import { SETUP_CONTENT_WIDTH, SETUP_MEDIA_WIDTH } from "../layout";

interface ReferenceStepProps {
  readonly name: string;
  readonly kind: string;
  readonly descriptor: string;
  readonly assetId: string | null;
  readonly excludedAssetIds: readonly string[];
  readonly assetsLoading: boolean;
  readonly assetsError: boolean;
  readonly pickerOpen: boolean;
  readonly onOpenPicker: () => void;
  readonly onClosePicker: () => void;
  readonly onPick: (assetId: string) => void;
}

const referencePrompt = (
  name: string,
  kind: string,
  descriptor: string
): string =>
  `A clear reference image of ${name || `the ${kind}`}. ${descriptor} Centered,
  full subject visible, neutral background, consistent studio lighting.`;

interface GenerateReferenceDialogProps {
  readonly open: boolean;
  readonly name: string;
  readonly kind: string;
  readonly descriptor: string;
  readonly onClose: () => void;
  readonly onPick: (assetId: string) => void;
}

const GenerateReferenceDialog = ({
  open,
  name,
  kind,
  descriptor,
  onClose,
  onPick
}: GenerateReferenceDialogProps) => {
  const rememberedModel = getRememberedModel("image");
  const [prompt, setPrompt] = useState(() =>
    referencePrompt(name, kind, descriptor)
  );
  const [model, setModel] = useState(rememberedModel?.model ?? "");
  const [provider, setProvider] = useState(rememberedModel?.provider ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleModelChange = useCallback((value: ImageModelValue) => {
    setModel(value.id);
    setProvider(value.provider);
  }, []);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !model || !provider) {
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const answer = await rpcRequest("generate_media", {
        mode: "image",
        provider,
        model,
        prompt: trimmedPrompt,
        aspect_ratio: "1:1",
        resolution: "1K",
        variations: 1
      });
      const assetId = Array.isArray(answer.asset_ids)
        ? answer.asset_ids.find((id): id is string => typeof id === "string")
        : undefined;
      if (!assetId) {
        throw new Error("The image model returned no reference image.");
      }
      useLastModelStore.getState().remember("image", { provider, model });
      onPick(assetId);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The reference image could not be generated."
      );
    } finally {
      setGenerating(false);
    }
  }, [model, onClose, onPick, prompt, provider]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Generate a reference image"
      showActions
      onConfirm={() => void handleGenerate()}
      confirmText={generating ? "Generating" : "Generate reference"}
      confirmDisabled={generating || !prompt.trim() || !model || !provider}
      cancelDisabled={generating}
      isLoading={generating}
    >
      <FlexColumn gap={GAP.comfortable} sx={{ minWidth: 360 }}>
        <Caption color="secondary">
          Start with the entity description, then adjust the prompt if you
          want a different visual interpretation.
        </Caption>
        <TextInput
          label="Prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          multiline
          rows={4}
          autoFocus
        />
        <FormField
          label="Image model"
          helperText="Used to create the reference image."
        >
          <ImageModelSelect
            value={model}
            task="text_to_image"
            onChange={handleModelChange}
          />
        </FormField>
        {error ? <AlertBanner severity="error">{error}</AlertBanner> : null}
        {generating ? (
          <FlexRow gap={GAP.tight} align="center">
            <LoadingSpinner inline size={14} />
            <Caption>Creating your reference image…</Caption>
          </FlexRow>
        ) : null}
      </FlexColumn>
    </Dialog>
  );
};

export const ReferenceStep = ({
  name,
  kind,
  descriptor,
  assetId,
  excludedAssetIds,
  assetsLoading,
  assetsError,
  pickerOpen,
  onOpenPicker,
  onClosePicker,
  onPick
}: ReferenceStepProps) => {
  const [generatorOpen, setGeneratorOpen] = useState(false);

  return (
    <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h1">
          Choose a reference image
        </Text>
        <Text color="secondary">
          Pick the clearest image of the traits you want future generations to
          preserve, or create one with AI.
        </Text>
      </FlexColumn>

      {assetId ? (
        <ResponsiveImage
          locator={`asset://${assetId}`}
          alt="Selected entity reference"
          aspectRatio="1/1"
          fit="contain"
          borderRadius={BORDER_RADIUS.md}
          showErrorFallback
          sx={{ width: SETUP_MEDIA_WIDTH, maxWidth: "100%", maxHeight: "48vh" }}
        />
      ) : null}

      <FlexRow gap={GAP.normal} wrap>
        <EditorButton
          variant={assetId ? "outlined" : "contained"}
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={onOpenPicker}
          disabled={assetsLoading || assetsError}
        >
          {assetsError
            ? "Assets unavailable"
            : assetsLoading
              ? "Loading assets"
              : assetId
                ? "Change reference"
                : "Choose from assets"}
        </EditorButton>
        <EditorButton
          variant="outlined"
          startIcon={<AutoAwesomeOutlinedIcon />}
          onClick={() => setGeneratorOpen(true)}
        >
          Generate with AI
        </EditorButton>
      </FlexRow>

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={onClosePicker}
        onPick={onPick}
        excludedAssetIds={excludedAssetIds}
      />
      <GenerateReferenceDialog
        open={generatorOpen}
        name={name}
        kind={kind}
        descriptor={descriptor}
        onClose={() => setGeneratorOpen(false)}
        onPick={onPick}
      />
    </FlexColumn>
  );
};

export default ReferenceStep;
