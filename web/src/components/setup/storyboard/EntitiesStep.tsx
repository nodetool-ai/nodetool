/**
 * The storyboard setup's consistency step. Entities are reusable reference
 * images plus canonical descriptions. The selection is stored on the board,
 * while every shot gets an explicit selection the creator can refine here.
 */

import { useCallback, useState } from "react";
import { useTheme } from "@mui/material/styles";
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import type { Entity } from "@nodetool-ai/protocol";

import { useEntities } from "../../../serverState/useEntities";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { entitiesForShot } from "../../../stores/storyboard/shotEntities";
import EntityAssetPickerDialog from "../../entities/EntityAssetPickerDialog";
import EntityEditorDialog from "../../entities/EntityEditorDialog";
import {
  BORDER_RADIUS,
  Caption,
  Checkbox,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  Label,
  ResponsiveImage,
  ScrollArea,
  SearchInput,
  SPACING,
  Text
} from "../../ui_primitives";

interface EntitiesStepProps {
  boardId: string;
}

const EMPTY_ENTITY_IDS: string[] = [];
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

export const EntitiesStep = ({ boardId }: EntitiesStepProps) => {
  const theme = useTheme();
  const { data: entities, isLoading } = useEntities();
  const board = useStoryboardStore((state) => state.boards[boardId]);
  const setEntityIds = useStoryboardStore((state) => state.setEntityIds);
  const updateShot = useStoryboardStore((state) => state.updateShot);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newAssetId, setNewAssetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);

  const selectedIds = board?.entityIds ?? EMPTY_ENTITY_IDS;
  const selectedSet = new Set(selectedIds);

  const setBoardEntity = useCallback(
    (entity: Entity, selected: boolean) => {
      const nextBoardIds = setIdSelected(selectedIds, entity.id, selected);
      setEntityIds(boardId, nextBoardIds);
      for (const shot of board?.shots ?? []) {
        const current = shot.entity_ids ?? selectedIds;
        const belongsOnShot =
          entitiesForShot({ ...shot, entity_ids: undefined }, [entity]).length >
          0;
        const next = setIdSelected(
          current,
          entity.id,
          selected && belongsOnShot
        );
        updateShot(boardId, shot.id, { entity_ids: next });
      }
    },
    [board?.shots, boardId, selectedIds, setEntityIds, updateShot]
  );

  const handleCreated = useCallback(
    (entity: Entity | null) => {
      if (entity) {
        setBoardEntity(entity, true);
      }
    },
    [setBoardEntity]
  );

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

  const selectedEntities = (entities ?? []).filter((entity) =>
    selectedSet.has(entity.id)
  );
  const query = search.trim().toLocaleLowerCase();
  const visibleEntities = (entities ?? []).filter(
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
          Choose reusable references for your shots. Each entity carries an
          image and description to keep its appearance consistent.
        </Text>
      </FlexColumn>

      <FlexRow gap={SPACING.lg} wrap align="center" justify="space-between">
        <FlexColumn gap={SPACING.xs}>
          <Label component="h2">Your entity library</Label>
          <Caption role="status">
            {selectedEntities.length} selected for this storyboard
          </Caption>
        </FlexColumn>
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
          <FlexRow gap={SPACING.lg} wrap align="center">
            <FlexColumn sx={{ flex: "1 1 240px" }}>
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
              Selected ({selectedEntities.length})
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
                          <Checkbox
                            key={entity.id}
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
                                p: SPACING.md,
                                gap: SPACING.md,
                                minWidth: 0,
                                borderBottom: "1px solid",
                                borderColor: "divider",
                                borderRadius: BORDER_RADIUS.sm,
                                backgroundColor: selectedSet.has(entity.id)
                                  ? theme.vars.palette.action.selected
                                  : "transparent",
                                "&:hover": {
                                  backgroundColor:
                                    theme.vars.palette.action.hover
                                },
                                "&:focus-within": {
                                  outline: `2px solid ${theme.vars.palette.primary.main}`,
                                  outlineOffset: -2
                                },
                                "& .MuiFormControlLabel-label": {
                                  flex: 1,
                                  minWidth: 0
                                }
                              }
                            }}
                            label={
                              <FlexRow gap={SPACING.lg} align="center">
                              {entity.reference_images?.[0] ? (
                                  <ResponsiveImage
                                    locator={entity.reference_images[0]}
                                    alt=""
                                    aspectRatio="1/1"
                                    borderRadius={BORDER_RADIUS.sm}
                                    sx={{
                                      width: 56,
                                      height: 56,
                                      flexShrink: 0
                                    }}
                                  />
                                ) : (
                                  <FlexRow
                                    aria-hidden
                                    justify="center"
                                    align="center"
                                    sx={{
                                      width: 56,
                                      height: 56,
                                      flexShrink: 0,
                                      borderRadius: BORDER_RADIUS.sm,
                                      bgcolor: "action.hover",
                                      color: "text.secondary"
                                    }}
                                  >
                                    <AddPhotoAlternateOutlinedIcon fontSize="small" />
                                  </FlexRow>
                                )}
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
                              </FlexRow>
                            }
                          />
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
        <FlexColumn gap={SPACING.md}>
          <Text size="big" component="h2">
            Assign each shot
          </Text>
          <Text color="secondary">
            Remove an entity from shots where it should not appear.
          </Text>
          {(board?.shots ?? []).map((shot) => {
            const shotIds = new Set(shot.entity_ids ?? selectedIds);
            return (
              <FlexColumn
                key={shot.id}
                sx={{
                  py: SPACING.lg,
                  borderBottom: "1px solid",
                  borderColor: "divider"
                }}
              >
                <FlexColumn gap={SPACING.sm}>
                  <Text>{`${shot.index + 1}. ${shot.slug ?? shot.action}`}</Text>
                  <FlexRow gap={SPACING.lg} wrap>
                    {selectedEntities.map((entity) => (
                      <Checkbox
                        key={entity.id}
                        label={entity.name}
                        checked={shotIds.has(entity.id)}
                        onChange={(_, checked) =>
                          toggleShot(shot.id, entity.id, checked)
                        }
                      />
                    ))}
                  </FlexRow>
                </FlexColumn>
              </FlexColumn>
            );
          })}
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
