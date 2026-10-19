import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { EntityKind } from "@nodetool-ai/protocol";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { estimateGenerationCost } from "../../../utils/generationCostEstimate";
import {
  getRememberedModel,
  useLastModelStore
} from "../../../stores/lastModelStore";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import ImageModelSelect from "../../properties/ImageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
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
  TextArea
} from "../../ui_primitives";
import { SETUP_CONTENT_WIDTH, SETUP_MEDIA_WIDTH } from "../layout";
import { GalleryFrame } from "../MediaGallery";

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

const PROMPT_OPTION_KEYS: Record<EntityKind, readonly [string, ...string[]]> = {
  character: ["full-body", "portrait", "character-sheet"],
  location: ["establishing-view", "detail-view", "location-sheet"],
  style: ["style-sample", "style-sheet", "texture-detail"],
  prop: ["product-view", "detail-view", "turnaround-sheet"]
};

const aspectRatios: Record<string, ReferencePromptOption["aspectRatio"]> = {
  "full-body": "1:1",
  portrait: "2:3",
  "character-sheet": "3:2",
  "establishing-view": "3:2",
  "detail-view": "1:1",
  "location-sheet": "3:2",
  "style-sample": "1:1",
  "style-sheet": "3:2",
  "texture-detail": "1:1",
  "product-view": "1:1",
  "turnaround-sheet": "3:2"
};

const referencePrompt = (
  t: ReturnType<typeof useTranslation>["t"],
  name: string,
  kind: EntityKind,
  descriptor: string,
  option: ReferencePromptOption
): string =>
  t("i18n-cont-setup-05.entity.reference.prompt.template", {
    name: name || t(`i18n-cont-setup-05.entity.kinds.${kind}`),
    descriptor: descriptor.trim(),
    instruction: option.instruction
  });

/** How long a reference render may take before the dialog gives up on it. */
const REFERENCE_TIMEOUT_MS = 5 * 60_000;

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
  const { t, i18n } = useTranslation();
  const rememberedModel = getRememberedModel("image");
  const options = PROMPT_OPTION_KEYS[kind].map((id) => ({
    id,
    label: t(`i18n-cont-setup-05.entity.reference.prompt.promptOptions.${id}.label`),
    instruction: t(
      `i18n-cont-setup-05.entity.reference.prompt.promptOptions.${id}.instruction`
    ),
    aspectRatio: aspectRatios[id] ?? "1:1"
  }));
  const [selectedOption, setSelectedOption] = useState(options[0].id);
  const [prompt, setPrompt] = useState(() =>
    referencePrompt(t, name, kind, descriptor, options[0])
  );
  const [model, setModel] = useState(rememberedModel?.model ?? "");
  const [provider, setProvider] = useState(rememberedModel?.provider ?? "");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aspectRatio =
    options.find((option) => option.id === selectedOption)?.aspectRatio ??
    "1:1";

  const handleModelChange = useCallback((value: ImageModelValue) => {
    setModel(value.id);
    setProvider(value.provider);
  }, []);

  // The request in flight. Closing the dialog or leaving the step aborts it,
  // so a late answer cannot replace a reference picked since (F11).
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleClose = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setGenerating(false);
    onClose();
  }, [onClose]);

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !model || !provider) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setGenerating(true);
    setError(null);
    try {
      const answer = await rpcRequest(
        "generate_media",
        {
          mode: "image",
          provider,
          model,
          prompt: trimmedPrompt,
          aspect_ratio: aspectRatio,
          resolution: "1K",
          variations: 1
        },
        REFERENCE_TIMEOUT_MS,
        controller.signal
      );
      if (controller.signal.aborted) {
        return;
      }
      const assetId = Array.isArray(answer.asset_ids)
        ? answer.asset_ids.find((id): id is string => typeof id === "string")
        : undefined;
      if (!assetId) {
        throw new Error(t("i18n-cont-setup-05.entity.reference.errors.noImage"));
      }
      useLastModelStore.getState().remember("image", { provider, model });
      onPick(assetId);
      onClose();
    } catch (cause) {
      if (controller.signal.aborted) {
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : t("i18n-cont-setup-05.entity.reference.errors.generationFailed")
      );
    } finally {
      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setGenerating(false);
      }
    }
  }, [aspectRatio, model, onClose, onPick, prompt, provider, t]);

  // The dialog's button spends money, so its price and its reason for being
  // off sit under the model it depends on.
  const estimate = model
    ? estimateGenerationCost({
        kind: "image",
        provider: provider || null,
        model,
        aspectRatio,
        resolution: "1K",
        quantity: 1
      })
    : null;
  const modelHelper = !model
    ? t("i18n-cont-setup-05.entity.reference.modelHelper.choose")
    : estimate
      ? t("i18n-cont-setup-05.entity.reference.modelHelper.estimated", {
          estimate: new Intl.NumberFormat(
            i18n.resolvedLanguage ?? i18n.language,
            { style: "currency", currency: "USD" }
          ).format(estimate.total)
        })
      : t("i18n-cont-setup-05.entity.reference.modelHelper.default");

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("i18n-cont-setup-05.entity.reference.generate.title")}
      maxWidth="sm"
      fullWidth
      onConfirm={() => void handleGenerate()}
      confirmText={
        generating
          ? t("i18n-cont-setup-05.entity.reference.generate.generating")
          : t("i18n-cont-setup-05.entity.reference.generate.confirm")
      }
      confirmDisabled={generating || !prompt.trim() || !model || !provider}
      isLoading={generating}
    >
      <FlexColumn gap={GAP.comfortable}>
        <Caption color="secondary">
          {t("i18n-cont-setup-05.entity.reference.generate.description")}
        </Caption>
        <FormField label={t("i18n-cont-setup-05.entity.reference.generate.viewLabel")}>
          <FlexRow
            gap={GAP.tight}
            wrap
            role="group"
            aria-label={t("i18n-cont-setup-05.entity.reference.generate.viewLabel")}
          >
            {options.map((option) => (
              <Chip
                key={option.id}
                label={option.label}
                active={selectedOption === option.id}
                aria-pressed={selectedOption === option.id}
                onClick={() => {
                  setSelectedOption(option.id);
                  setPrompt(referencePrompt(t, name, kind, descriptor, option));
                }}
                disabled={generating}
              />
            ))}
          </FlexRow>
        </FormField>
        <TextArea
          label={t("i18n-cont-setup-05.entity.reference.generate.promptLabel")}
          value={prompt}
          onChange={(value) => setPrompt(value)}
          rows={4}
          autoFocus
        />
        <FormField
          label={t("i18n-cont-setup-05.entity.reference.generate.modelLabel")}
          helperText={modelHelper}
        >
          <ImageModelSelect
            value={model}
            provider={provider}
            task="text_to_image"
            onChange={handleModelChange}
          />
        </FormField>
        {error ? (
          <AlertBanner
            severity="error"
            action={
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: t("i18n-cont-setup-05.entity.reference.errors.reportSummary"),
                  errorText: error
                }}
              />
            }
          >
            {error}
          </AlertBanner>
        ) : null}
        {generating ? (
          <FlexRow gap={GAP.tight} align="center">
            <LoadingSpinner inline size="small" />
            <Caption>{t("i18n-cont-setup-05.entity.reference.generate.progress")}</Caption>
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
  const { t } = useTranslation();
  const [generatorOpen, setGeneratorOpen] = useState(false);

  return (
    <FlexColumn gap={GAP.spacious} sx={{ maxWidth: SETUP_CONTENT_WIDTH }}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h1">
          {t("i18n-cont-setup-05.entity.reference.title")}
        </Text>
        <Text color="secondary">
          {t("i18n-cont-setup-05.entity.reference.description")}
        </Text>
      </FlexColumn>

      {assetId ? (
        <GalleryFrame
          locator={`asset://${assetId}`}
          kind="image"
          caption={
            name
              ? t("i18n-cont-setup-05.entity.reference.imageCaption", { name })
              : t("i18n-cont-setup-05.entity.reference.selectedCaption")
          }
        >
          <ResponsiveImage
            locator={`asset://${assetId}`}
            alt={t("i18n-cont-setup-05.entity.reference.selectedAlt")}
            // Stable hook for the reference slot. The rendered <img> is not one:
            // jsdom fetches a src but has no image codec, so it fires `error`
            // for even a valid data: URI and the error fallback replaces the
            // <img>.
            data-testid="entity-reference-preview"
            aspectRatio="1/1"
            fit="contain"
            borderRadius={BORDER_RADIUS.md}
            showErrorFallback
            sx={{
              width: SETUP_MEDIA_WIDTH,
              maxWidth: "100%",
              maxHeight: "48vh"
            }}
          />
        </GalleryFrame>
      ) : null}

      <FlexRow gap={GAP.normal} wrap>
        <EditorButton
          variant={assetId ? "outlined" : "contained"}
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={onOpenPicker}
          disabled={assetsLoading || assetsError}
        >
          {assetsError
            ? t("i18n-cont-setup-05.entity.reference.assets.unavailable")
            : assetsLoading
              ? t("i18n-cont-setup-05.entity.reference.assets.loading")
              : assetId
                ? t("i18n-cont-setup-05.entity.reference.assets.change")
                : t("i18n-cont-setup-05.entity.reference.assets.choose")}
        </EditorButton>
        <EditorButton
          variant="outlined"
          startIcon={<AutoAwesomeOutlinedIcon />}
          onClick={() => setGeneratorOpen(true)}
        >
          {t("i18n-cont-setup-05.entity.reference.generate.open")}
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
