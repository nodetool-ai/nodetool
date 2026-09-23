/**
 * The storyboard setup's consistency step. Entities are reusable reference
 * images plus canonical descriptions. The selection is stored on the board,
 * while every shot gets an explicit selection the creator can refine here.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import type { Entity } from "@nodetool-ai/protocol";

import { useEntities, useSaveEntity } from "../../../serverState/useEntities";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../../stores/storyboard/shotEntities";
import { rpcRequest } from "../../../lib/websocket/rpcRequest";
import { useDefaultStillModel } from "../../../hooks/storyboard/useDefaultStillModel";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import EntityEditorDialog from "../../entities/EntityEditorDialog";
import ImageModelSelect from "../../properties/ImageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
import {
  AlertBanner,
  BORDER_RADIUS,
  Caption,
  Checkbox,
  Dialog,
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
  SPACING,
  SPACING_PX,
  Text,
  ThinkingIndicator
} from "../../ui_primitives";
import {
  buildEntitySuggestionsPrompt,
  ENTITY_SUGGESTIONS_SCHEMA,
  ENTITY_SUGGESTIONS_SYSTEM_PROMPT,
  parseEntitySuggestions,
  type EntitySuggestion
} from "./entitySuggestions";
import {
  SETUP_FIELD_WIDTH,
  SETUP_MEDIA_WIDTH,
  SETUP_WIDE_CONTENT_WIDTH
} from "../layout";

interface EntitiesStepProps {
  boardId: string;
  readOnly?: boolean;
}

const EMPTY_ENTITY_IDS: string[] = [];
const ENTITY_PREVIEW_SIZE = SPACING_PX.xxxl * 4;
const ENTITY_GROUPS = [
  { kind: "character", label: "Characters" },
  { kind: "location", label: "Locations" },
  { kind: "prop", label: "Props" },
  { kind: "style", label: "Styles" }
] as const;

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
  readOnly = false
}: EntitiesStepProps) => {
  const theme = useTheme();
  const { data: entities, isLoading } = useEntities();
  const saveEntity = useSaveEntity();
  useDefaultStillModel(boardId, !readOnly);
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewEntity, setPreviewEntity] = useState<Entity | null>(null);
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [createdEntities, setCreatedEntities] = useState<Entity[]>([]);
  const [suggestions, setSuggestions] = useState<EntitySuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [creatingKeys, setCreatingKeys] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [assistError, setAssistError] = useState<string | null>(null);
  const mountedRef = useRef(true);

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

  const handleCreated = (entity: Entity | null): void => {
    if (entity) {
      setCreatedEntities((current) => [...current, entity]);
      setBoardEntity(entity, true);
    }
  };

  const suggestFromStory = async (): Promise<void> => {
    const current = useStoryboardStore.getState().getBoard(boardId);
    const screenplay = current?.screenplay;
    const model = current?.directorModel;
    if (!screenplay || !model?.id) {
      setAssistError(
        "The storyboard needs a screenplay and Director model first."
      );
      return;
    }
    setSuggesting(true);
    setAssistError(null);
    try {
      const answer = await rpcRequest("generate_text", {
        provider: model.provider,
        model: model.id,
        system: ENTITY_SUGGESTIONS_SYSTEM_PROMPT,
        prompt: buildEntitySuggestionsPrompt(screenplay),
        max_tokens: 2048,
        schema: ENTITY_SUGGESTIONS_SCHEMA,
        schema_name: "storyboard_entity_suggestions",
        schema_description:
          "Visually important reusable entities found in a storyboard screenplay."
      });
      if (!mountedRef.current) return;
      setSuggestions(parseEntitySuggestions(answer.data));
    } catch (error) {
      if (!mountedRef.current) return;
      setAssistError(
        error instanceof Error
          ? error.message
          : "Could not find entities in the story."
      );
    } finally {
      if (mountedRef.current) {
        setSuggesting(false);
      }
    }
  };

  const createSuggestion = async (
    suggestion: EntitySuggestion
  ): Promise<void> => {
    const key = `${suggestion.kind}:${suggestion.name}`;
    if (creatingKeys.has(key)) {
      return;
    }
    const existing = availableEntities.find(
      (entity) =>
        entity.kind === suggestion.kind &&
        entity.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase()
    );
    if (existing) {
      setBoardEntity(existing, true);
      setSuggestions((current) =>
        current.filter(
          (candidate) => `${candidate.kind}:${candidate.name}` !== key
        )
      );
      return;
    }
    const model =
      useStoryboardStore.getState().getBoard(boardId)?.imageModel ?? null;
    if (!model?.id) {
      setAssistError("Pick a reference image model first.");
      return;
    }
    setCreatingKeys((current) => new Set(current).add(key));
    setAssistError(null);
    try {
      const answer = await rpcRequest("generate_media", {
        mode: "image",
        provider: model.provider,
        model: model.id,
        prompt: suggestion.referencePrompt,
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
      const entity = await saveEntity.mutateAsync({
        assetId,
        createOnly: true,
        kind: suggestion.kind,
        name: suggestion.name,
        descriptor: suggestion.descriptor,
        reference_asset_id: assetId
      });
      if (!entity) {
        throw new Error("The entity could not be saved.");
      }
      if (!mountedRef.current) return;
      setCreatedEntities((current) => [...current, entity]);
      setBoardEntity(entity, true);
      setSuggestions((current) =>
        current.filter(
          (candidate) => `${candidate.kind}:${candidate.name}` !== key
        )
      );
    } catch (error) {
      if (!mountedRef.current) return;
      setAssistError(
        error instanceof Error ? error.message : "The entity could not be made."
      );
    } finally {
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
          Keep people and places consistent
        </Text>
        <Text color="secondary" sx={{ maxWidth: "65ch" }}>
          Choose the characters, places, and props that need to look consistent
          across shots.
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
            <Label component="h2">Suggested from your story</Label>
            <Caption>
              Find recurring references in your screenplay. Create only the ones
              you want to use.
            </Caption>
          </FlexColumn>
          <EditorButton
            variant="outlined"
            onClick={() => void suggestFromStory()}
            disabled={suggesting}
          >
            {suggesting
              ? "Finding entities"
              : suggestions.length > 0
                ? "Refresh suggestions"
                : "Find entities"}
          </EditorButton>
        </FlexRow>

        {assistError ? (
          <AlertBanner
            severity="error"
            title="Could not create entities"
            action={
              <ReportBugButton
                context={{
                  source: "provider-call",
                  summary: "Storyboard entity creation failed",
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
                label="Reference image model"
                helperText="Used only for missing entities you choose to create. The same model carries into the Look step."
                sx={{ maxWidth: SETUP_FIELD_WIDTH }}
              >
                <ImageModelSelect
                  value={board?.imageModel?.id ?? ""}
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
              {suggestions.map((suggestion) => {
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
                        <Caption>{suggestion.kind}</Caption>
                      </FlexRow>
                      <Text color="secondary">{suggestion.descriptor}</Text>
                    </FlexColumn>
                    <EditorButton
                      variant="contained"
                      disabled={
                        (!existing && !board?.imageModel?.id) || creating
                      }
                      onClick={() => void createSuggestion(suggestion)}
                    >
                      {creating ? (
                        <ThinkingIndicator
                          label={`Creating ${suggestion.name}`}
                        />
                      ) : existing ? (
                        `Use ${suggestion.name}`
                      ) : (
                        `Create ${suggestion.name}`
                      )}
                    </EditorButton>
                  </FlexRow>
                );
              })}
            </FlexColumn>
          </FlexColumn>
        ) : null}
      </FlexColumn>

      <FlexRow gap={SPACING.xl} wrap align="center">
        <FlexRow gap={SPACING.md} wrap align="baseline">
          <Label component="h2">Your entity library</Label>
          <Caption role="status">
            {selectedEntities.length} selected for this storyboard
          </Caption>
        </FlexRow>
        <EditorButton
          variant="outlined"
          startIcon={<AddPhotoAlternateOutlinedIcon />}
          onClick={() => setPickerOpen(true)}
        >
          Create entity from an image
        </EditorButton>
      </FlexRow>

      {isLoading ? (
        <LoadingSpinner text="Loading entities" />
      ) : !entities || entities.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="No entities yet"
          description="Create one from a generated or uploaded image, or skip this step."
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
                placeholder="Search entities"
                fullWidth
              />
            </FlexColumn>
            <EditorButton
              variant={onlySelected ? "outlined" : "text"}
              aria-pressed={onlySelected}
              onClick={() => setOnlySelected(!onlySelected)}
            >
              Selected only
            </EditorButton>
          </FlexRow>
          <ScrollArea maxHeight="min(48vh, 480px)">
            <FlexColumn gap={SPACING.xl}>
              {visibleEntities.length === 0 ? (
                <EmptyState
                  variant="no-data"
                  title={
                    onlySelected && !query
                      ? "No entities selected"
                      : "No matching entities"
                  }
                  description={
                    onlySelected && !query
                      ? "Browse your library to choose references for this storyboard."
                      : "Try another name or change the selected filter."
                  }
                  size="small"
                />
              ) : (
                ENTITY_GROUPS.map(({ kind, label }) => {
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
                        <Label component="h3">{label}</Label>
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
                                aria-label={`View ${entity.name} reference image`}
                                onClick={() => setPreviewEntity(entity)}
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
                              onChange={(_, checked) =>
                                setBoardEntity(entity, checked)
                              }
                              slotProps={{
                                input: {
                                  "aria-label": `${entity.name} · ${entity.kind}`
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
                                    {entity.descriptor || "No description"}
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
              Assign each shot
            </Text>
            <Text color="secondary">
              Remove an entity from shots where it should not appear.
            </Text>
          </FlexColumn>
          <FlexColumn
            gap={SPACING.lg}
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                md: "repeat(2, minmax(0, 1fr))"
              }
            }}
          >
            {(board?.shots ?? []).map((shot) => {
              const shotIds = new Set(shot.entity_ids ?? selectedIds);
              return (
                <FlexColumn
                  key={shot.id}
                  component="section"
                  aria-label={`Shot ${shot.index + 1}`}
                  gap={SPACING.xl}
                  justify="space-between"
                  sx={{
                    p: SPACING.xl,
                    minWidth: 0,
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: BORDER_RADIUS.md,
                    bgcolor: "background.paper"
                  }}
                >
                  <FlexColumn gap={SPACING.sm}>
                    <Label component="h3">Shot {shot.index + 1}</Label>
                    <Text>{shot.slug ?? shot.action}</Text>
                  </FlexColumn>
                  <FlexRow gap={SPACING.md} wrap>
                    {selectedEntities.map((entity) => (
                      <Checkbox
                        key={entity.id}
                        label={
                          <FlexRow gap={SPACING.sm} align="center">
                            {entity.kind === "character" &&
                            entity.reference_images?.[0] ? (
                              <ResponsiveImage
                                locator={entity.reference_images[0]}
                                preferThumbnail
                                loading="lazy"
                                alt=""
                                aspectRatio="1/1"
                                borderRadius={BORDER_RADIUS.sm}
                                sx={{
                                  width: SPACING_PX.xxxl,
                                  height: SPACING_PX.xxxl,
                                  flexShrink: 0
                                }}
                              />
                            ) : null}
                            <Text component="span">{entity.name}</Text>
                          </FlexRow>
                        }
                        checked={shotIds.has(entity.id)}
                        onChange={(_, checked) =>
                          toggleShot(shot.id, entity.id, checked)
                        }
                        labelProps={{
                          sx: {
                            m: SPACING.none,
                            pr: SPACING.md,
                            border: "1px solid",
                            borderColor: shotIds.has(entity.id)
                              ? "primary.main"
                              : "divider",
                            borderRadius: BORDER_RADIUS.sm,
                            bgcolor: shotIds.has(entity.id)
                              ? "action.selected"
                              : "transparent"
                          }
                        }}
                      />
                    ))}
                  </FlexRow>
                </FlexColumn>
              );
            })}
          </FlexColumn>
        </FlexColumn>
      ) : null}

      <Dialog
        open={previewEntity !== null}
        onClose={() => setPreviewEntity(null)}
        title={previewEntity?.name}
        maxWidth="md"
        fullWidth
      >
        {previewEntity?.reference_images?.[0] ? (
          <FlexColumn gap={SPACING.lg}>
            <ResponsiveImage
              locator={previewEntity.reference_images[0]}
              alt={`${previewEntity.name} reference image`}
              fit="contain"
              sx={{ height: "70vh", bgcolor: "background.default" }}
            />
            <Text color="secondary">{previewEntity.descriptor}</Text>
          </FlexColumn>
        ) : null}
      </Dialog>
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
