/**
 * The storyboard setup's consistency step. Entities are reusable reference
 * images plus canonical descriptions. The selection is stored on the board,
 * while every shot gets an explicit selection the creator can refine here.
 */

import {
  Suspense,
  lazy,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState
} from "react";
import { useTheme } from "@mui/material/styles";
import { useTranslation } from "react-i18next";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { Entity } from "@nodetool-ai/protocol";

import { useEntities, useSaveEntity } from "../../../serverState/useEntities";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../../stores/storyboard/shotEntities";
import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { useDefaultStillModel } from "../../../hooks/storyboard/useDefaultStillModel";
import { useDefaultDirectorModel } from "../../../hooks/storyboard/useDefaultDirectorModel";
import { useInStudio } from "../../../studio/StudioContext";
import { useImageModelsByProvider } from "../../../hooks/useModelsByProvider";
import { priceRenderStep } from "../../../hooks/storyboard/shotCostPricing";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import EntityEditorDialog from "../../entities/EntityEditorDialog";
import ImageModelSelect from "../../properties/ImageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
import { GallerySource, useMediaGallery } from "../MediaGallery";
import {
  AlertBanner,
  BORDER_RADIUS,
  Caption,
  Card,
  Checkbox,
  Chip,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  FormField,
  LoadingSpinner,
  Label,
  ResponsiveImage,
  ScrollArea,
  SearchInput,
  SectionHeader,
  SPACING,
  SPACING_PX,
  Text,
  ThinkingIndicator,
  TYPOGRAPHY
} from "../../ui_primitives";
import { ENTITY_KIND_ICON } from "../../entities/entityKind";
import {
  buildEntitySuggestionsPrompt,
  ENTITY_SUGGESTIONS_SCHEMA,
  ENTITY_SUGGESTIONS_SYSTEM_PROMPT,
  parseEntitySuggestions,
  type EntitySuggestion
} from "./entitySuggestions";
import {
  referenceImageModel,
  type ReferenceImageModel
} from "./referenceImageModel";
import {
  boardScreenplaySnapshot,
  cancelEntityFind,
  finishEntityFind,
  getEntitySuggestions,
  setEntitySuggestions,
  startEntityFind,
  useEntityFindEmpty,
  useEntityFindRunning,
  useEntitySuggestions
} from "./setupChoices";
import {
  SETUP_FIELD_WIDTH,
  SETUP_MEDIA_WIDTH,
  SETUP_WIDE_CONTENT_WIDTH
} from "../layout";

// The estimate pulls in the provider price tables, as on the review step.
const GenerationEstimateLine = lazy(() =>
  import("../GenerationSummary").then((module) => ({
    default: module.GenerationEstimateLine
  }))
);

/** What `Find entities` lets the screenplay model answer with. */
const SUGGESTIONS_MAX_OUTPUT_TOKENS = 2048;
/** The size a suggested entity's reference is drawn at. */
const REFERENCE_RESOLUTION = "1K";

/** One entity creation, as the flow tracks it. */
export interface EntityCreation {
  /** Aborted when the creator cancels the step's pending work. */
  signal: AbortSignal;
  /** Call once the creation settles, however it ended. */
  done: () => void;
}

interface EntitiesStepProps {
  boardId: string;
  readOnly?: boolean;
  /**
   * Report a creation to the flow, so the shell holds Continue and Skip until
   * it lands and its Cancel can stop it (F9).
   */
  onCreationStart?: () => EntityCreation;
}

const EMPTY_ENTITY_IDS: string[] = [];
const ENTITY_PREVIEW_SIZE = SPACING_PX.xxxl * 4;
const ENTITY_GROUPS = [
  { kind: "character", labelKey: "characters" },
  { kind: "location", labelKey: "locations" },
  { kind: "prop", labelKey: "props" },
  { kind: "style", labelKey: "styles" }
] as const;

/**
 * A shot's title without the number its card already shows. Director slugs
 * often lead with it ("01 — Opening"), which read twice beside the badge.
 */
export const shotTitle = (title: string, number: number): string => {
  const match = /^0*(\d+)\s*[—–\-.:]\s*(.+)$/u.exec(title.trim());
  return match && Number(match[1]) === number ? match[2] : title;
};

const setIdSelected = (
  ids: readonly string[],
  entityId: string,
  selected: boolean
): string[] =>
  selected
    ? ids.includes(entityId)
      ? [...ids]
      : [...ids, entityId]
    : ids.filter((id) => id !== entityId);

export const EntitiesStep = ({
  boardId,
  readOnly = false,
  onCreationStart
}: EntitiesStepProps) => {
  const { t } = useTranslation();
  const editOnlyMessage = (name: string): string =>
    t("pass3_10.storyboard.entities.editOnlyModel", { model: name });
  const referenceModelHelperText = (
    model: ReferenceImageModel | null
  ): string => {
    if (model?.kind === "edit_only") {
      return editOnlyMessage(model.name);
    }
    if (model?.substituteFor) {
      return t("pass3_10.storyboard.entities.substituteModelHelper", {
        originalModel: model.substituteFor,
        referenceModel: model.model.name
      });
    }
    return t("pass3_10.storyboard.entities.referenceModelHelper");
  };
  const theme = useTheme();
  const {
    data: entities,
    isLoading,
    isError: entitiesFailed,
    error: entitiesError,
    refetch: refetchEntities
  } = useEntities();
  const saveEntity = useSaveEntity();
  useDefaultStillModel(boardId, !readOnly);
  // `Find entities` asks the screenplay model. A shotlist import skips the
  // genre step that fills it in, so this step fills it in too. Studio pins
  // its own.
  const inStudio = useInStudio();
  useDefaultDirectorModel(boardId, !readOnly && !inStudio);
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const { models: imageModels } = useImageModelsByProvider();
  const referenceModel = board?.imageModel
    ? referenceImageModel(board.imageModel, imageModels)
    : null;
  const [pickerOpen, setPickerOpen] = useState(false);
  const openGallery = useMediaGallery();
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [createdEntities, setCreatedEntities] = useState<Entity[]>([]);
  const suggestions = useEntitySuggestions(boardId);
  const dropSuggestion = (key: string): void =>
    setEntitySuggestions(
      boardId,
      getEntitySuggestions(boardId).filter(
        (candidate) => `${candidate.kind}:${candidate.name}` !== key
      )
    );
  // Held per board, so a step remounted mid-call shows it running (B1).
  const suggesting = useEntityFindRunning(boardId);
  const foundNone = useEntityFindEmpty(boardId);
  const [creatingKeys, setCreatingKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [assistError, setAssistError] = useState<string | null>(null);
  // Which action failed, so the banner names it: finding entities or
  // creating one.
  const [assistFailure, setAssistFailure] = useState<"find" | "create">(
    "create"
  );
  const mountedRef = useRef(true);
  const priceIdBase = useId();
  const findButtonRef = useRef<HTMLButtonElement>(null);
  const [findEnded, setFindEnded] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const availableEntities = useMemo(() => {
    const byId = new Map((entities ?? []).map((entity) => [entity.id, entity]));
    for (const entity of createdEntities) {
      byId.set(entity.id, entity);
    }
    return [...byId.values()];
  }, [createdEntities, entities]);

  const selectedIds = board?.entityIds ?? EMPTY_ENTITY_IDS;
  const selectedSet = new Set(selectedIds);

  const setBoardEntity = (entity: Entity, selected: boolean): void => {
    const currentBoard = useStoryboardStore.getState().getBoard(boardId);
    const currentSelectedIds = currentBoard?.entityIds ?? EMPTY_ENTITY_IDS;
    const nextBoardIds = setIdSelected(currentSelectedIds, entity.id, selected);
    setEntityIds(boardId, nextBoardIds);
    for (const shot of currentBoard?.shots ?? []) {
      const current = shot.entity_ids ?? currentSelectedIds;
      const belongsOnShot =
        entitiesForShot({ ...shot, entity_ids: undefined }, [entity]).length >
        0;
      const next = setIdSelected(current, entity.id, selected && belongsOnShot);
      updateShot(boardId, shot.id, { entity_ids: next });
    }
  };

  // The Find button is disabled while it runs and Cancel leaves with the run,
  // so focus that fell to the page goes back to Find when the run ends.
  useEffect(() => {
    if (!findEnded || suggesting) {
      return;
    }
    setFindEnded(false);
    const active = document.activeElement;
    if (active === null || active === document.body) {
      findButtonRef.current?.focus();
    }
  }, [findEnded, suggesting]);

  // The screenplay `Find entities` sends, for the call and its estimate.
  const suggestionsPrompt = useMemo(() => {
    const screenplay = boardScreenplaySnapshot(board);
    return screenplay ? buildEntitySuggestionsPrompt(screenplay) : "";
  }, [board]);

  // What one `Create <name>` costs: one reference image at 1K from the model
  // that will draw it, which may be the text-to-image variant of the still
  // model.
  const createPrice = useMemo(() => {
    if (referenceModel?.kind !== "ready") {
      return null;
    }
    return priceRenderStep(
      "Reference",
      referenceModel.model,
      "reference image model",
      REFERENCE_RESOLUTION,
      undefined,
      []
    );
  }, [referenceModel]);
  const createPriceText =
    createPrice === null
      ? null
      : createPrice.cost === null
        ? t("pass3_10.storyboard.entities.priceUnknown")
        : t("pass3_10.storyboard.entities.aboutPrice", {
            price: formatUsd(createPrice.cost)
          });

  const handleCreated = (entity: Entity | null): void => {
    if (entity) {
      setCreatedEntities((current) => [...current, entity]);
      setBoardEntity(entity, true);
    }
  };

  const suggestFromStory = async (): Promise<void> => {
    if (readOnly) {
      return;
    }
    const current = useStoryboardStore.getState().getBoard(boardId);
    // The reviewed board, not `board.screenplay`: review edits land on the
    // board's own shots and title, and the envelope keeps the first draft (F11).
    const screenplay = boardScreenplaySnapshot(current);
    const model = current?.directorModel;
    if (!screenplay || !model?.id) {
      setAssistFailure("find");
      setAssistError(
        t("pass3_10.storyboard.entities.missingScreenplayOrModel")
      );
      return;
    }
    const controller = startEntityFind(boardId);
    setAssistError(null);
    let found: EntitySuggestion[] | null = null;
    try {
      const answer = await rpcRequest(
        "generate_text",
        {
          provider: model.provider,
          model: model.id,
          system: ENTITY_SUGGESTIONS_SYSTEM_PROMPT,
          prompt: buildEntitySuggestionsPrompt(screenplay),
          max_tokens: SUGGESTIONS_MAX_OUTPUT_TOKENS,
          schema: ENTITY_SUGGESTIONS_SCHEMA,
          schema_name: "storyboard_entity_suggestions",
          schema_description:
            "Visually important reusable entities found in a storyboard screenplay."
        },
        undefined,
        controller.signal
      );
      // Kept per board, so an answer paid for after the creator moved on
      // (Continue, Back) is waiting when they return.
      found = parseEntitySuggestions(answer.data);
    } catch (error) {
      if (!mountedRef.current || controller.signal.aborted) return;
      setAssistFailure("find");
      setAssistError(
        error instanceof Error
          ? error.message
          : t("pass3_10.storyboard.entities.findFailedFallback")
      );
    } finally {
      if (finishEntityFind(boardId, controller, found) && mountedRef.current) {
        setFindEnded(true);
      }
    }
  };

  const cancelFind = (): void => {
    cancelEntityFind(boardId);
    setFindEnded(true);
  };

  const createSuggestion = async (
    suggestion: EntitySuggestion
  ): Promise<void> => {
    const key = `${suggestion.kind}:${suggestion.name}`;
    if (readOnly || creatingKeys.has(key)) {
      return;
    }
    const existing = availableEntities.find(
      (entity) =>
        entity.kind === suggestion.kind &&
        entity.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase()
    );
    if (existing) {
      setBoardEntity(existing, true);
      dropSuggestion(key);
      return;
    }
    const selected =
      useStoryboardStore.getState().getBoard(boardId)?.imageModel ?? null;
    if (!selected?.id) {
      setAssistFailure("create");
      setAssistError(t("pass3_10.storyboard.entities.pickReferenceModelFirst"));
      return;
    }
    const resolved = referenceImageModel(selected, imageModels);
    if (resolved.kind === "edit_only") {
      setAssistFailure("create");
      setAssistError(editOnlyMessage(resolved.name));
      return;
    }
    const { model } = resolved;
    const creation = onCreationStart?.();
    const signal = creation?.signal;
    setCreatingKeys((current) => new Set(current).add(key));
    setAssistError(null);
    try {
      const answer = await rpcRequest(
        "generate_media",
        {
          mode: "image",
          provider: model.provider,
          model: model.id,
          prompt: suggestion.referencePrompt,
          aspect_ratio: "1:1",
          resolution: "1K",
          variations: 1
        },
        undefined,
        signal
      );
      if (signal?.aborted) {
        return;
      }
      const assetId = Array.isArray(answer.asset_ids)
        ? answer.asset_ids.find((id): id is string => typeof id === "string")
        : undefined;
      if (!assetId) {
        throw new Error(t("pass3_10.storyboard.entities.noReferenceImageReturned"));
      }
      const entity = await saveEntity.mutateAsync({
        assetId,
        createOnly: true,
        kind: suggestion.kind,
        name: suggestion.name,
        descriptor: suggestion.descriptor,
        reference_asset_id: assetId
      });
      if (!entity) {
        throw new Error(t("pass3_10.storyboard.entities.entitySaveFailed"));
      }
      // A creation canceled while it was being saved stays off the board: the
      // creator asked for it to stop (F10).
      if (signal?.aborted) {
        return;
      }
      // The entity is saved and paid for, so it joins the board even when the
      // step has unmounted: the board is a store write, not component state.
      setBoardEntity(entity, true);
      dropSuggestion(key);
      if (!mountedRef.current) return;
      setCreatedEntities((current) => [...current, entity]);
    } catch (error) {
      if (!mountedRef.current || signal?.aborted) return;
      setAssistFailure("create");
      setAssistError(
        error instanceof Error
          ? error.message
          : t("pass3_10.storyboard.entities.entityCreateFailedFallback")
      );
    } finally {
      creation?.done();
      if (mountedRef.current) {
        setCreatingKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
      }
    }
  };

  const toggleShot = (
    shotId: string,
    entityId: string,
    checked: boolean
  ): void => {
    const shot = board?.shots.find((candidate) => candidate.id === shotId);
    if (!shot) {
      return;
    }
    const current = shot.entity_ids ?? selectedIds;
    updateShot(boardId, shotId, {
      entity_ids: setIdSelected(current, entityId, checked)
    });
  };

  const selectedEntities = availableEntities.filter((entity) =>
    selectedSet.has(entity.id)
  );
  const query = search.trim().toLocaleLowerCase();
  const visibleEntities = availableEntities.filter(
    (entity) =>
      (!onlySelected || selectedSet.has(entity.id)) &&
      `${entity.name} ${entity.kind} ${entity.descriptor}`
        .toLocaleLowerCase()
        .includes(query)
  );

  return (
    <FlexColumn
      gap={SPACING.xxl}
      sx={{ maxWidth: 1040, width: "100%", minWidth: 0 }}
    >
      <FlexColumn gap={SPACING.xs}>
        <Text size="big" component="h1">
          {t("pass3_10.storyboard.entities.title")}
        </Text>
        <Text color="secondary" sx={{ maxWidth: "65ch" }}>
          {t("pass3_10.storyboard.entities.description")}
        </Text>
      </FlexColumn>

      <FlexColumn gap={SPACING.lg}>
        <FlexRow
          gap={SPACING.xxl}
          wrap
          align="center"
          sx={{ maxWidth: SETUP_WIDE_CONTENT_WIDTH }}
        >
          <FlexColumn
            gap={SPACING.xs}
            sx={{ flexGrow: 1, flexShrink: 1, flexBasis: SETUP_MEDIA_WIDTH }}
          >
            <SectionHeader
              size="small"
              title={t("pass3_10.storyboard.entities.suggestedFromStory")}
              role="heading"
              aria-level={2}
            />
            <Caption>
              {t("pass3_10.storyboard.entities.suggestionsDescription")}
            </Caption>
          </FlexColumn>
          <FlexColumn gap={SPACING.xs} align="flex-end">
            <FlexRow gap={SPACING.sm} align="center">
              <EditorButton
                ref={findButtonRef}
                variant="outlined"
                onClick={() => void suggestFromStory()}
                disabled={readOnly || suggesting}
              >
                {suggesting
                  ? t("pass3_10.storyboard.entities.findingEntities")
                  : suggestions.length > 0
                    ? t("pass3_10.storyboard.entities.refreshSuggestions")
                    : t("pass3_10.storyboard.entities.findEntities")}
              </EditorButton>
              {suggesting ? (
                // Named apart from the footer's Cancel, which stops entity
                // creations: both can be on screen at once.
                <EditorButton
                  variant="text"
                  onClick={cancelFind}
                  aria-label={t("pass3_10.storyboard.entities.cancelFinding")}
                >
                  {t("pass3_10.storyboard.entities.cancel")}
                </EditorButton>
              ) : null}
            </FlexRow>
            {foundNone && !suggesting ? (
              <Caption role="status">
                {t("pass3_10.storyboard.entities.noSuggestionsFound")}
              </Caption>
            ) : null}
            {readOnly ? null : (
              <Suspense
                fallback={
                  <Caption color="secondary">
                    {t("pass3_10.storyboard.entities.loadingEstimate")}
                  </Caption>
                }
              >
                <GenerationEstimateLine
                  result={t("pass3_10.storyboard.entities.findEstimateResult")}
                  next={t("pass3_10.storyboard.entities.findEstimateNext")}
                  model={board?.directorModel ?? null}
                  brief={`${ENTITY_SUGGESTIONS_SYSTEM_PROMPT}\n${suggestionsPrompt}`}
                  maxOutputTokens={SUGGESTIONS_MAX_OUTPUT_TOKENS}
                />
              </Suspense>
            )}
          </FlexColumn>
        </FlexRow>

        {assistError ? (
          <AlertBanner
            severity="error"
            title={
              assistFailure === "find"
                ? t("pass3_10.storyboard.entities.findFailureTitle")
                : t("pass3_10.storyboard.entities.createFailureTitle")
            }
            action={
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary:
                    assistFailure === "find"
                      ? t("pass3_10.storyboard.entities.findFailureSummary")
                      : t("pass3_10.storyboard.entities.createFailureSummary"),
                  errorText: assistError
                }}
              />
            }
          >
            {assistError}
          </AlertBanner>
        ) : null}

        {suggestions.length > 0 ? (
          <FlexColumn gap={SPACING.lg}>
            {suggestions.some(
              (suggestion) =>
                !availableEntities.some(
                  (entity) =>
                    entity.kind === suggestion.kind &&
                    entity.name.toLocaleLowerCase() ===
                      suggestion.name.toLocaleLowerCase()
                )
            ) ? (
              <FormField
                label={t("pass3_10.storyboard.entities.referenceImageModel")}
                helperText={referenceModelHelperText(referenceModel)}
                sx={{ maxWidth: SETUP_FIELD_WIDTH }}
              >
                <ImageModelSelect
                  value={board?.imageModel?.id ?? ""}
                  provider={board?.imageModel?.provider}
                  task="text_to_image"
                  onChange={(model) => {
                    if (!readOnly) {
                      setImageModel(boardId, model);
                    }
                  }}
                  disabled={readOnly}
                />
              </FormField>
            ) : null}
            <FlexColumn gap={SPACING.md}>
              {suggestions.map((suggestion, suggestionIndex) => {
                const creating = creatingKeys.has(
                  `${suggestion.kind}:${suggestion.name}`
                );
                const existing = availableEntities.some(
                  (entity) =>
                    entity.kind === suggestion.kind &&
                    entity.name.toLocaleLowerCase() ===
                      suggestion.name.toLocaleLowerCase()
                );
                return (
                  <FlexRow
                    key={`${suggestion.kind}:${suggestion.name}`}
                    gap={SPACING.lg}
                    align="center"
                    justify="space-between"
                    wrap
                    sx={{
                      p: SPACING.lg,
                      border: "1px solid",
                      borderColor: "divider",
                      borderRadius: BORDER_RADIUS.md
                    }}
                  >
                    <FlexColumn gap={SPACING.xs} sx={{ flex: "1 1 320px" }}>
                      <FlexRow gap={SPACING.sm} align="baseline">
                        <Label component="h3">{suggestion.name}</Label>
                        <Caption>
                          {t(`pass3_10.storyboard.entities.kinds.${suggestion.kind}`)}
                        </Caption>
                      </FlexRow>
                      <Text color="secondary">{suggestion.descriptor}</Text>
                    </FlexColumn>
                    <FlexRow gap={SPACING.sm} align="center">
                      {!existing && createPriceText ? (
                        <Caption id={`${priceIdBase}-${suggestionIndex}`}>
                          {createPriceText}
                        </Caption>
                      ) : null}
                      <EditorButton
                        variant="contained"
                        aria-describedby={
                          !existing && createPriceText
                            ? `${priceIdBase}-${suggestionIndex}`
                            : undefined
                        }
                        disabled={
                          readOnly ||
                          (!existing && !board?.imageModel?.id) ||
                          creating
                        }
                        onClick={() => void createSuggestion(suggestion)}
                      >
                        {creating ? (
                          <ThinkingIndicator
                            label={t("pass3_10.storyboard.entities.creatingEntity", {
                              name: suggestion.name
                            })}
                          />
                        ) : existing ? (
                          t("pass3_10.storyboard.entities.useEntity", {
                            name: suggestion.name
                          })
                        ) : (
                          t("pass3_10.storyboard.entities.createEntity", {
                            name: suggestion.name
                          })
                        )}
                      </EditorButton>
                    </FlexRow>
                  </FlexRow>
                );
              })}
            </FlexColumn>
          </FlexColumn>
        ) : null}
      </FlexColumn>

      <FlexRow gap={SPACING.xl} wrap align="center">
        <FlexRow gap={SPACING.md} wrap align="baseline">
          <SectionHeader
            size="small"
            title={t("pass3_10.storyboard.entities.libraryTitle")}
            role="heading"
            aria-level={2}
          />
          <Caption role="status">
            {t("pass3_10.storyboard.entities.selectedCount", {
              count: selectedEntities.length
            })}
          </Caption>
        </FlexRow>
        <EditorButton
          variant="outlined"
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={() => setPickerOpen(true)}
          disabled={readOnly}
        >
          {t("pass3_10.storyboard.entities.createFromImage")}
        </EditorButton>
      </FlexRow>

      {isLoading ? (
        <LoadingSpinner text={t("pass3_10.storyboard.entities.loadingEntities")} />
      ) : entitiesFailed && !entities ? (
        // A failed load is not an empty library: saying "No entities yet"
        // would send the creator to make again what they already have.
        <AlertBanner
          severity="error"
          title={t("pass3_10.storyboard.entities.loadFailedTitle")}
          action={
            <FlexRow gap={SPACING.sm}>
              <EditorButton
                variant="text"
                size="small"
                onClick={() => void refetchEntities()}
              >
                {t("pass3_10.storyboard.entities.tryAgain")}
              </EditorButton>
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: t("pass3_10.storyboard.entities.loadFailureSummary"),
                  errorText: entitiesError?.message
                }}
              />
            </FlexRow>
          }
        >
          {entitiesError?.message ??
            t("pass3_10.storyboard.entities.loadFailedFallback")}
        </AlertBanner>
      ) : !entities || entities.length === 0 ? (
        <EmptyState
          variant="no-data"
          title={t("pass3_10.storyboard.entities.emptyTitle")}
          description={t("pass3_10.storyboard.entities.emptyDescription")}
          size="small"
        />
      ) : (
        <FlexColumn gap={SPACING.xl}>
          <FlexRow
            gap={SPACING.md}
            wrap
            align="center"
            sx={{ maxWidth: SETUP_WIDE_CONTENT_WIDTH }}
          >
            <FlexColumn
              sx={{
                flexGrow: 1,
                flexShrink: 1,
                flexBasis: SETUP_FIELD_WIDTH,
                maxWidth: SETUP_MEDIA_WIDTH
              }}
            >
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("pass3_10.storyboard.entities.searchPlaceholder")}
                fullWidth
              />
            </FlexColumn>
            <EditorButton
              variant={onlySelected ? "outlined" : "text"}
              aria-pressed={onlySelected}
              onClick={() => setOnlySelected(!onlySelected)}
            >
              {t("pass3_10.storyboard.entities.selectedOnly")}
            </EditorButton>
          </FlexRow>
          <ScrollArea maxHeight="min(48vh, 480px)">
            <FlexColumn gap={SPACING.xl}>
              {visibleEntities.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  title={
                    onlySelected && !query
                      ? t("pass3_10.storyboard.entities.noEntitiesSelected")
                      : t("pass3_10.storyboard.entities.noMatchingEntities")
                  }
                  description={
                    onlySelected && !query
                      ? t("pass3_10.storyboard.entities.noSelectedDescription")
                      : t("pass3_10.storyboard.entities.noMatchingDescription")
                  }
                  size="small"
                />
              ) : (
                ENTITY_GROUPS.map(({ kind, labelKey }) => {
                  const label = t(`pass3_10.storyboard.entities.groups.${labelKey}`);
                  const group = visibleEntities.filter(
                    (entity) => entity.kind === kind
                  );
                  if (group.length === 0) return null;
                  return (
                    <FlexColumn
                      key={kind}
                      gap={SPACING.md}
                      component="section"
                      aria-label={label}
                    >
                      <FlexRow gap={SPACING.md} align="baseline">
                        <SectionHeader
                          size="small"
                          title={label}
                          role="heading"
                          aria-level={3}
                        />
                        <Caption>{group.length}</Caption>
                      </FlexRow>
                      <FlexColumn
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "minmax(0, 1fr)",
                            md: "repeat(2, minmax(0, 1fr))"
                          },
                          columnGap: SPACING.xl
                        }}
                      >
                        {group.map((entity) => (
                          <FlexRow
                            key={entity.id}
                            gap={SPACING.lg}
                            align="center"
                            sx={{
                              p: SPACING.md,
                              minWidth: 0,
                              borderBottom: "1px solid",
                              borderColor: "divider",
                              borderRadius: BORDER_RADIUS.sm,
                              backgroundColor: selectedSet.has(entity.id)
                                ? theme.vars.palette.action.selected
                                : "transparent",
                              "&:hover": {
                                backgroundColor: theme.vars.palette.action.hover
                              },
                              "&:focus-within": {
                                outline: `2px solid ${theme.vars.palette.primary.main}`,
                                outlineOffset: -2
                              }
                            }}
                          >
                            {entity.reference_images?.[0] ? (
                              <EditorButton
                                variant="text"
                                aria-label={t(
                                  "pass3_10.storyboard.entities.viewReferenceImage",
                                  { name: entity.name }
                                )}
                                onClick={() =>
                                  openGallery?.(entity.reference_images?.[0])
                                }
                                sx={{
                                  p: SPACING.none,
                                  width: ENTITY_PREVIEW_SIZE,
                                  height: ENTITY_PREVIEW_SIZE,
                                  flexShrink: 0,
                                  overflow: "hidden"
                                }}
                              >
                                <ResponsiveImage
                                  locator={entity.reference_images[0]}
                                  preferThumbnail
                                  loading="lazy"
                                  alt=""
                                  aspectRatio="1/1"
                                  borderRadius={BORDER_RADIUS.sm}
                                />
                                <GallerySource
                                  locator={entity.reference_images[0]}
                                  kind="image"
                                  caption={
                                    entity.descriptor
                                      ? `${entity.name}: ${entity.descriptor}`
                                      : entity.name
                                  }
                                />
                              </EditorButton>
                            ) : (
                              <FlexRow
                                aria-hidden
                                justify="center"
                                align="center"
                                sx={{
                                  width: ENTITY_PREVIEW_SIZE,
                                  height: ENTITY_PREVIEW_SIZE,
                                  flexShrink: 0,
                                  borderRadius: BORDER_RADIUS.sm,
                                  bgcolor: "action.hover",
                                  color: "text.secondary"
                                }}
                              >
                                <AddPhotoAlternateOutlinedIcon fontSize="small" />
                              </FlexRow>
                            )}
                            <Checkbox
                              size="small"
                              checked={selectedSet.has(entity.id)}
                              disabled={readOnly}
                              onChange={(_, checked) => {
                                if (!readOnly) {
                                  setBoardEntity(entity, checked);
                                }
                              }}
                              slotProps={{
                                input: {
                                  "aria-label": t(
                                    "pass3_10.storyboard.entities.selectEntity",
                                    {
                                      name: entity.name,
                                      kind: t(
                                        `pass3_10.storyboard.entities.kinds.${entity.kind}`
                                      )
                                    }
                                  )
                                }
                              }}
                              labelProps={{
                                sx: {
                                  m: SPACING.none,
                                  flex: 1,
                                  minWidth: 0,
                                  "& .MuiFormControlLabel-label": {
                                    flex: 1,
                                    minWidth: 0
                                  }
                                }
                              }}
                              label={
                                <FlexColumn
                                  gap={SPACING.xs}
                                  sx={{ minWidth: 0 }}
                                >
                                  <Label
                                    component="span"
                                    sx={{
                                      m: SPACING.none,
                                      color: "text.primary",
                                      overflowWrap: "anywhere"
                                    }}
                                  >
                                    {entity.name}
                                  </Label>
                                  <Caption
                                    sx={{
                                      display: "-webkit-box",
                                      WebkitLineClamp: 2,
                                      WebkitBoxOrient: "vertical",
                                      overflow: "hidden",
                                      overflowWrap: "anywhere"
                                    }}
                                  >
                                    {entity.descriptor ||
                                      t("pass3_10.storyboard.entities.noDescription")}
                                  </Caption>
                                </FlexColumn>
                              }
                            />
                          </FlexRow>
                        ))}
                      </FlexColumn>
                    </FlexColumn>
                  );
                })
              )}
            </FlexColumn>
          </ScrollArea>
        </FlexColumn>
      )}

      {selectedEntities.length > 0 ? (
        <FlexColumn gap={SPACING.xl}>
          <FlexColumn gap={SPACING.xs}>
            <Text size="big" component="h2">
              {t("pass3_10.storyboard.entities.assignEachShot")}
            </Text>
            <Text color="secondary">
              {t("pass3_10.storyboard.entities.assignDescription")}
            </Text>
          </FlexColumn>
          {/* One framed list, a row per shot: the shots read as a sequence
              and the chips line up, where a grid of cards wrapped them. */}
          <Card variant="outlined" padding="none" sx={{ overflow: "hidden" }}>
            {(board?.shots ?? []).map((shot) => {
              const shotIds = new Set(shot.entity_ids ?? selectedIds);
              const number = shot.index + 1;
              const title = shot.slug ?? shot.action;
              return (
                <FlexRow
                  key={shot.id}
                  component="section"
                  aria-label={t("pass3_10.storyboard.entities.shotNumber", {
                    number
                  })}
                  gap={SPACING.lg}
                  align="center"
                  sx={{
                    px: SPACING.lg,
                    py: SPACING.md,
                    flexDirection: { xs: "column", md: "row" },
                    alignItems: { xs: "stretch", md: "center" },
                    "& + &": { borderTop: 1, borderColor: "divider" }
                  }}
                >
                  {/* The number once, beside the shot's own title. */}
                  <FlexRow
                    gap={SPACING.sm}
                    align="baseline"
                    sx={{ flex: { md: "0 0 34%" }, minWidth: 0 }}
                  >
                    <Caption
                      aria-hidden
                      sx={{ ...TYPOGRAPHY.mono.caption, flexShrink: 0 }}
                    >
                      {String(number).padStart(2, "0")}
                    </Caption>
                    <Text
                      component="h3"
                      size="small"
                      weight={500}
                      truncate
                      title={title}
                      sx={{ m: SPACING.none, minWidth: 0 }}
                    >
                      {shotTitle(title, number)}
                    </Text>
                  </FlexRow>
                  <FlexRow gap={SPACING.sm} wrap sx={{ flex: 1, minWidth: 0 }}>
                    {selectedEntities.map((entity) => {
                      const included = shotIds.has(entity.id);
                      const KindIcon = ENTITY_KIND_ICON[entity.kind];
                      const thumbnail =
                        entity.kind === "character"
                          ? entity.reference_images?.[0]
                          : undefined;
                      return (
                        <Chip
                          key={entity.id}
                          label={entity.name}
                          active={included}
                          disabled={readOnly}
                          onClick={() =>
                            toggleShot(shot.id, entity.id, !included)
                          }
                          avatar={
                            thumbnail ? (
                              <ResponsiveImage
                                locator={thumbnail}
                                preferThumbnail
                                loading="lazy"
                                alt=""
                                aspectRatio="1/1"
                                borderRadius={BORDER_RADIUS.circle}
                                sx={{ opacity: included ? 1 : 0.5 }}
                              />
                            ) : undefined
                          }
                          icon={thumbnail ? undefined : <KindIcon />}
                        />
                      );
                    })}
                  </FlexRow>
                </FlexRow>
              );
            })}
          </Card>
        </FlexColumn>
      ) : null}

      <EntityAssetPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(assetId) => {
          setPickerOpen(false);
          setNewAssetId(assetId);
        }}
      />
      {newAssetId ? (
        <EntityEditorDialog
          open
          assetId={newAssetId}
          onSaved={handleCreated}
          onClose={() => setNewAssetId(null)}
        />
      ) : null}
    </FlexColumn>
  );
};

export default EntitiesStep;
