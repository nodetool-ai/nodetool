/**
 * GenerateReferenceDialog — draw an entity's reference image with AI. The
 * creator picks a view (a portrait, a character sheet, a turnaround…), edits
 * the prompt, and chooses how many takes to draw. With a current image, a
 * retake can keep its look: the current picture goes to an image-editing
 * model as the source, so the person or place stays recognizable.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import type { EntityKind, GenerateMediaRequest } from "@nodetool-ai/protocol";

import { rpcRequest } from "../../lib/websocket/rpcRequest";
import { estimateGenerationCost } from "../../utils/generationCostEstimate";
import {
  getRememberedModel,
  getRememberedModelForTask,
  useLastModelStore
} from "../../stores/lastModelStore";
import type { ImageModelValue } from "../../stores/ApiTypes";
import ImageModelSelect from "../properties/ImageModelSelect";
import ReportBugButton from "../support/ReportBugButton";
import {
  AlertBanner,
  AutoGrid,
  Box,
  Caption,
  Chip,
  Dialog,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  LabeledSwitch,
  LoadingSpinner,
  ResponsiveImage,
  SPACING,
  TextArea,
  ToggleGroup,
  ToggleOption,
  selectableTileStyles
} from "../ui_primitives";

type ReferenceAspectRatio = "1:1" | "2:3" | "3:2";

interface ReferenceView {
  readonly id: string;
  readonly label: string;
  readonly instruction: string;
  readonly aspectRatio: ReferenceAspectRatio;
}

/** The views each kind offers, the first being the default. */
export const REFERENCE_VIEW_IDS: Record<
  EntityKind,
  readonly [string, ...string[]]
> = {
  character: ["full-body", "portrait", "character-sheet"],
  location: ["establishing-view", "detail-view", "location-sheet"],
  style: ["style-sample", "style-sheet", "texture-detail"],
  prop: ["product-view", "detail-view", "turnaround-sheet"]
};

const VIEW_ASPECT_RATIOS: Record<string, ReferenceAspectRatio> = {
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

/** How many pictures one request may draw to choose from. */
const TAKE_COUNTS = [1, 2, 4] as const;

/** How long a reference render may take before the dialog gives up on it. */
const REFERENCE_TIMEOUT_MS = 5 * 60_000;

const TAKE_TILE_WIDTH = 160;
const CURRENT_THUMB_SIZE = 48;

interface PickedModel {
  readonly id: string;
  readonly provider: string;
}

/** The model last used to draw (or, with `editing`, to edit) a picture. */
const rememberedModel = (editing: boolean): PickedModel | null => {
  const remembered = editing
    ? getRememberedModelForTask("image", "image_edit")
    : getRememberedModel("image");
  return remembered?.model && remembered.provider
    ? { id: remembered.model, provider: remembered.provider }
    : null;
};

export interface GenerateReferenceDialogProps {
  readonly open: boolean;
  readonly name: string;
  readonly kind: EntityKind;
  readonly descriptor: string;
  /**
   * The entity's current picture. When given, a retake can keep its look by
   * editing it instead of drawing from text alone.
   */
  readonly currentAssetId?: string | null;
  readonly onClose: () => void;
  readonly onPick: (assetId: string) => void;
}

export const GenerateReferenceDialog = ({
  open,
  name,
  kind,
  descriptor,
  currentAssetId,
  onClose,
  onPick
}: GenerateReferenceDialogProps) => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const views: ReferenceView[] = REFERENCE_VIEW_IDS[kind].map((id) => ({
    id,
    label: t(
      `i18n-cont-setup-05.entity.reference.prompt.promptOptions.${id}.label`
    ),
    instruction: t(
      `i18n-cont-setup-05.entity.reference.prompt.promptOptions.${id}.instruction`
    ),
    aspectRatio: VIEW_ASPECT_RATIOS[id] ?? "1:1"
  }));
  const promptFor = (view: ReferenceView): string =>
    t("i18n-cont-setup-05.entity.reference.prompt.template", {
      name: name || t(`i18n-cont-setup-05.entity.kinds.${kind}`),
      descriptor: descriptor.trim(),
      instruction: view.instruction
    });
  const [viewId, setViewId] = useState(views[0].id);
  const [prompt, setPrompt] = useState(() => promptFor(views[0]));
  const [keepLook, setKeepLook] = useState(Boolean(currentAssetId));
  const keepLookId = useId();
  const editing = keepLook && Boolean(currentAssetId);
  const task = editing ? "image_edit" : "text_to_image";
  const [model, setModel] = useState<PickedModel | null>(() =>
    rememberedModel(Boolean(currentAssetId))
  );
  const handleKeepLookChange = useCallback((value: boolean) => {
    setKeepLook(value);
    // Editing and drawing want different models, so each keeps its own.
    setModel(rememberedModel(value));
  }, []);
  const [takeCount, setTakeCount] = useState<number>(1);
  const [takes, setTakes] = useState<string[]>([]);
  const [chosenTake, setChosenTake] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const aspectRatio =
    views.find((view) => view.id === viewId)?.aspectRatio ?? "1:1";

  // The request in flight. Closing the dialog aborts it, so a late answer
  // cannot replace a reference picked since (F11).
  const controllerRef = useRef<AbortController | null>(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleClose = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setGenerating(false);
    setTakes([]);
    setChosenTake(null);
    onClose();
  }, [onClose]);

  const pick = useCallback(
    (assetId: string) => {
      onPick(assetId);
      handleClose();
    },
    [handleClose, onPick]
  );

  const handleGenerate = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || !model?.id || !model.provider) {
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setGenerating(true);
    setError(null);
    const request: GenerateMediaRequest = {
      mode: editing ? "image_edit" : "image",
      provider: model.provider,
      model: model.id,
      prompt: trimmedPrompt,
      aspect_ratio: aspectRatio,
      resolution: "1K",
      variations: takeCount
    };
    if (editing && currentAssetId) {
      request.source_asset_id = currentAssetId;
    }
    try {
      const answer = await rpcRequest(
        "generate_media",
        request,
        REFERENCE_TIMEOUT_MS,
        controller.signal
      );
      if (controller.signal.aborted) {
        return;
      }
      const assetIds = Array.isArray(answer.asset_ids)
        ? answer.asset_ids.filter((id): id is string => typeof id === "string")
        : [];
      if (assetIds.length === 0) {
        throw new Error(
          t("i18n-cont-setup-05.entity.reference.errors.noImage")
        );
      }
      const store = useLastModelStore.getState();
      const remembered = { provider: model.provider, model: model.id };
      if (editing) {
        store.rememberForTask("image", "image_edit", remembered);
      } else {
        store.remember("image", remembered);
      }
      // One take is the answer. Several are a choice the creator makes here.
      if (assetIds.length === 1) {
        pick(assetIds[0]);
        return;
      }
      setTakes(assetIds);
      setChosenTake(assetIds[0]);
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
  }, [aspectRatio, currentAssetId, editing, model, pick, prompt, t, takeCount]);

  // The dialog's button spends money, so its price and its reason for being
  // off sit under the model it depends on.
  const estimate = model?.id
    ? estimateGenerationCost({
        kind: "image",
        provider: model.provider || null,
        model: model.id,
        aspectRatio,
        resolution: "1K",
        quantity: takeCount
      })
    : null;
  const modelHelper = !model?.id
    ? t("i18n-cont-setup-05.entity.reference.modelHelper.choose")
    : estimate
      ? t("i18n-cont-setup-05.entity.reference.modelHelper.estimated", {
          estimate: new Intl.NumberFormat(
            i18n.resolvedLanguage ?? i18n.language,
            { style: "currency", currency: "USD" }
          ).format(estimate.total)
        })
      : t("i18n-cont-setup-05.entity.reference.modelHelper.default");

  const choosing = takes.length > 0;
  const generateText = generating
    ? t("i18n-cont-setup-05.entity.reference.generate.generating")
    : t("i18n-cont-setup-05.entity.reference.generate.confirm");

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={
        currentAssetId
          ? t("i18n-cont-setup-05.entity.reference.generate.retakeTitle", {
              name
            })
          : t("i18n-cont-setup-05.entity.reference.generate.title")
      }
      maxWidth="sm"
      fullWidth
      onConfirm={() => {
        if (choosing) {
          if (chosenTake) {
            pick(chosenTake);
          }
          return;
        }
        void handleGenerate();
      }}
      confirmText={
        choosing
          ? t("i18n-cont-setup-05.entity.reference.generate.useTake")
          : generateText
      }
      confirmDisabled={
        choosing
          ? !chosenTake
          : generating || !prompt.trim() || !model?.id || !model.provider
      }
      isLoading={generating}
    >
      <FlexColumn gap={GAP.comfortable}>
        {choosing ? (
          <FlexColumn gap={GAP.normal}>
            <Caption color="secondary">
              {t("i18n-cont-setup-05.entity.reference.generate.chooseTake")}
            </Caption>
            <AutoGrid
              minItemWidth={TAKE_TILE_WIDTH}
              gap={GAP.normal}
              role="group"
              aria-label={t(
                "i18n-cont-setup-05.entity.reference.generate.takesLabel"
              )}
            >
              {takes.map((assetId, index) => (
                <Box
                  key={assetId}
                  component="button"
                  type="button"
                  aria-pressed={chosenTake === assetId}
                  aria-label={t(
                    "i18n-cont-setup-05.entity.reference.generate.takeLabel",
                    { number: index + 1 }
                  )}
                  onClick={() => setChosenTake(assetId)}
                  onDoubleClick={() => pick(assetId)}
                  sx={{
                    ...selectableTileStyles(theme, {
                      selected: chosenTake === assetId
                    }),
                    p: SPACING.none,
                    overflow: "hidden",
                    cursor: "pointer",
                    bgcolor: "background.default"
                  }}
                >
                  <ResponsiveImage
                    locator={`asset://${assetId}`}
                    alt=""
                    aspectRatio={aspectRatio.replace(":", "/")}
                    fit="contain"
                  />
                </Box>
              ))}
            </AutoGrid>
          </FlexColumn>
        ) : (
          <>
            <Caption color="secondary">
              {t("i18n-cont-setup-05.entity.reference.generate.description")}
            </Caption>
            <FormField
              label={t(
                "i18n-cont-setup-05.entity.reference.generate.viewLabel"
              )}
            >
              <FlexRow
                gap={GAP.tight}
                wrap
                role="group"
                aria-label={t(
                  "i18n-cont-setup-05.entity.reference.generate.viewLabel"
                )}
              >
                {views.map((view) => (
                  <Chip
                    key={view.id}
                    label={view.label}
                    active={viewId === view.id}
                    onClick={() => {
                      setViewId(view.id);
                      setPrompt(promptFor(view));
                    }}
                    disabled={generating}
                  />
                ))}
              </FlexRow>
            </FormField>
            <TextArea
              label={t(
                "i18n-cont-setup-05.entity.reference.generate.promptLabel"
              )}
              value={prompt}
              onChange={(value) => setPrompt(value)}
              rows={4}
              autoFocus
            />
            {currentAssetId ? (
              <FlexRow gap={GAP.normal} align="center">
                <ResponsiveImage
                  locator={`asset://${currentAssetId}`}
                  preferThumbnail
                  alt=""
                  aspectRatio="1/1"
                  sx={{ width: CURRENT_THUMB_SIZE, flexShrink: 0 }}
                />
                <LabeledSwitch
                  label={t(
                    "i18n-cont-setup-05.entity.reference.generate.keepLook"
                  )}
                  description={t(
                    "i18n-cont-setup-05.entity.reference.generate.keepLookDescription"
                  )}
                  id={keepLookId}
                  checked={keepLook}
                  onChange={handleKeepLookChange}
                  disabled={generating}
                />
              </FlexRow>
            ) : null}
            <FormField
              label={t(
                "i18n-cont-setup-05.entity.reference.generate.modelLabel"
              )}
              helperText={modelHelper}
            >
              <ImageModelSelect
                value={model?.id ?? ""}
                provider={model?.provider ?? ""}
                task={task}
                onChange={(value: ImageModelValue) =>
                  setModel({ id: value.id, provider: value.provider })
                }
              />
            </FormField>
            <FormField
              label={t(
                "i18n-cont-setup-05.entity.reference.generate.takesLabel"
              )}
            >
              <ToggleGroup
                value={takeCount}
                exclusive
                segmented
                size="small"
                onChange={(_event, value: number | null) => {
                  if (value) {
                    setTakeCount(value);
                  }
                }}
                aria-label={t(
                  "i18n-cont-setup-05.entity.reference.generate.takesLabel"
                )}
              >
                {TAKE_COUNTS.map((count) => (
                  <ToggleOption key={count} value={count}>
                    {count}
                  </ToggleOption>
                ))}
              </ToggleGroup>
            </FormField>
          </>
        )}
        {error ? (
          <AlertBanner
            severity="error"
            action={
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: t(
                    "i18n-cont-setup-05.entity.reference.errors.reportSummary"
                  ),
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
            <Caption>
              {t("i18n-cont-setup-05.entity.reference.generate.progress")}
            </Caption>
          </FlexRow>
        ) : null}
      </FlexColumn>
    </Dialog>
  );
};

export default GenerateReferenceDialog;
