import { useCallback, useState } from "react";
import type { EntityKind } from "@nodetool-ai/protocol";
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
  Chip,
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
  readonly kind: EntityKind;
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

interface ReferencePromptOption {
  readonly id: string;
  readonly label: string;
  readonly instruction: string;
  readonly aspectRatio: "1:1" | "2:3" | "3:2";
}

const PROMPT_OPTIONS: Record<
  EntityKind,
  readonly [ReferencePromptOption, ...ReferencePromptOption[]]
> = {
  character: [
    {
      id: "full-body",
      label: "Full body",
      instruction:
        "Show one full-body, front-facing pose, head to toe. Center the character against a neutral background with even studio lighting. Make their face, clothing, and distinctive features clear.",
      aspectRatio: "1:1"
    },
    {
      id: "portrait",
      label: "Portrait",
      instruction:
        "Show a head-and-shoulders portrait with the face fully visible and a neutral expression. Use a simple background and even lighting so facial features and hair are easy to identify.",
      aspectRatio: "2:3"
    },
    {
      id: "character-sheet",
      label: "Character sheet",
      instruction:
        "Create a character sheet with front, side, and back views plus a close-up of the face. Keep proportions, clothing, colors, and distinctive features consistent across views. Use a clean background without text or labels.",
      aspectRatio: "3:2"
    }
  ],
  location: [
    {
      id: "establishing-view",
      label: "Establishing view",
      instruction:
        "Show a wide establishing view of the location. Make its layout, architecture, landmarks, and atmosphere clear in one coherent scene.",
      aspectRatio: "3:2"
    },
    {
      id: "detail-view",
      label: "Detail view",
      instruction:
        "Show a closer view of the location's defining materials, objects, and architectural details. Keep the setting and atmosphere recognizable.",
      aspectRatio: "1:1"
    },
    {
      id: "location-sheet",
      label: "Location sheet",
      instruction:
        "Create a location sheet with three views of the same place from different angles. Keep the architecture, landmarks, lighting, and color palette consistent. No text or labels.",
      aspectRatio: "3:2"
    }
  ],
  style: [
    {
      id: "style-sample",
      label: "Style sample",
      instruction:
        "Create one cohesive scene that clearly shows this visual style's palette, lighting, texture, and rendering treatment.",
      aspectRatio: "1:1"
    },
    {
      id: "style-sheet",
      label: "Style sheet",
      instruction:
        "Create a visual style sheet with three different subjects rendered in the same style. Keep the palette, lighting, texture, and rendering treatment consistent. No text or labels.",
      aspectRatio: "3:2"
    },
    {
      id: "texture-detail",
      label: "Texture detail",
      instruction:
        "Show a close-up sample of this style's defining textures, brushwork, materials, and color relationships, with enough detail to reuse the treatment.",
      aspectRatio: "1:1"
    }
  ],
  prop: [
    {
      id: "product-view",
      label: "Product view",
      instruction:
        "Show one clear three-quarter view of the object, fully visible and centered against a neutral background. Use even studio lighting to reveal its shape, materials, and colors.",
      aspectRatio: "1:1"
    },
    {
      id: "detail-view",
      label: "Detail view",
      instruction:
        "Show a close-up of the object's distinctive details, materials, markings, and construction. Keep the object recognizable against a simple background.",
      aspectRatio: "1:1"
    },
    {
      id: "turnaround-sheet",
      label: "Turnaround sheet",
      instruction:
        "Create an object turnaround sheet with front, side, and back views. Keep its shape, scale, materials, colors, and details consistent across views. Use a clean background without text or labels.",
      aspectRatio: "3:2"
    }
  ]
};

const referencePrompt = (
  name: string,
  kind: EntityKind,
  descriptor: string,
  option: ReferencePromptOption
): string =>
  `A reference image of ${name || `the ${kind}`}. ${descriptor.trim()} ${option.instruction}`;

interface GenerateReferenceDialogProps {
  readonly open: boolean;
  readonly name: string;
  readonly kind: EntityKind;
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
  const options = PROMPT_OPTIONS[kind];
  const [selectedOption, setSelectedOption] = useState(options[0].id);
  const [prompt, setPrompt] = useState(() =>
    referencePrompt(name, kind, descriptor, options[0])
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
        aspect_ratio:
          options.find((option) => option.id === selectedOption)?.aspectRatio ??
          "1:1",
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
  }, [model, onClose, onPick, options, prompt, provider, selectedOption]);

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
          Choose a view, then edit the prompt to refine the image.
        </Caption>
        <FlexRow gap={GAP.tight} wrap>
          {options.map((option) => (
            <Chip
              key={option.id}
              label={option.label}
              active={selectedOption === option.id}
              aria-pressed={selectedOption === option.id}
              onClick={() => {
                setSelectedOption(option.id);
                setPrompt(referencePrompt(name, kind, descriptor, option));
              }}
              disabled={generating}
            />
          ))}
        </FlexRow>
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
            provider={provider}
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
          // Stable hook for the reference slot. The rendered <img> is not one:
          // jsdom fetches a src but has no image codec, so it fires `error` for
          // even a valid data: URI and the error fallback replaces the <img>.
          data-testid="entity-reference-preview"
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
