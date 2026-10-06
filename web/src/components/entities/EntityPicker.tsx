/**
 * EntityPicker — search the entity library and pick from thumbnail cards.
 *
 * The one entity picker body: the composer's attach dialog shows it as a tab,
 * and {@link EntityPickerDialog} wraps it for every other surface that picks
 * entities (the new-project composer, entity node properties). A search box
 * matches name, kind and tags; a kind filter narrows to characters,
 * locations, styles or props. Each card shows the reference image, so a pick
 * is made by sight rather than by name.
 */
import React, { memo, useMemo, useState } from "react";
import type { Entity, EntityKind } from "@nodetool-ai/protocol";

import { useEntities } from "../../serverState/useEntities";
import ImageRefPreview from "../node/ImageRefPreview";
import { filterEntitiesForMention } from "../node_types/editing/promptComposer/useAssetMentionSearch";
import { ENTITY_KIND_ICON, getEntityKindChipSx } from "./entityKind";
import {
  AutoGrid,
  Box,
  Caption,
  Card,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SearchInput,
  SPACING,
  Text,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";

type KindFilter = "all" | EntityKind;

const KIND_FILTERS: { value: KindFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "character", label: "Characters" },
  { value: "location", label: "Locations" },
  { value: "style", label: "Styles" },
  { value: "prop", label: "Props" }
];

export interface EntityPickerProps {
  /** Called with the entity a card was clicked for. */
  onSelect: (entity: Entity) => void;
  /** Ids drawn as picked (a checked, outlined card). */
  selectedIds?: readonly string[];
  /** Offer only these entities. Defaults to the active project's library. */
  entities?: readonly Entity[];
  /** Height of the scrolling card grid. */
  height?: number | string;
  autoFocus?: boolean;
}

/** Filter by kind, then rank by the query as the `@` picker does. */
export const filterEntities = (
  entities: readonly Entity[],
  kind: KindFilter,
  query: string
): Entity[] =>
  filterEntitiesForMention(
    kind === "all"
      ? [...entities]
      : entities.filter((entity) => entity.kind === kind),
    query
  );

const EntityPickCard: React.FC<{
  entity: Entity;
  selected: boolean;
  onSelect: (entity: Entity) => void;
}> = memo(({ entity, selected, onSelect }) => {
  const Icon = ENTITY_KIND_ICON[entity.kind];
  const name = entity.name || "Untitled";
  return (
    <Card
      variant="outlined"
      padding="none"
      clickable
      aria-label={name}
      aria-pressed={selected}
      title={entity.descriptor || name}
      onClick={() => onSelect(entity)}
      sx={{
        overflow: "hidden",
        borderColor: selected ? "primary.main" : undefined,
        boxShadow: selected
          ? (theme) => `0 0 0 1px ${theme.vars.palette.primary.main}`
          : undefined
      }}
    >
      <Box
        sx={{
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "hidden",
          bgcolor: "background.default"
        }}
      >
        <ImageRefPreview
          value={entity.reference_images?.[0]}
          placeholder={
            <FlexRow
              align="center"
              justify="center"
              sx={{ width: "100%", height: "100%", color: "text.disabled" }}
            >
              <Icon fontSize="large" />
            </FlexRow>
          }
        />
      </Box>
      <FlexColumn gap={SPACING.micro} sx={{ p: SPACING.sm, minWidth: 0 }}>
        <Text
          size="small"
          sx={{
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap"
          }}
        >
          {name}
        </Text>
        <FlexRow>
          <Chip
            label={entity.kind}
            compact
            variant="outlined"
            sx={getEntityKindChipSx(entity.kind)}
          />
        </FlexRow>
      </FlexColumn>
    </Card>
  );
});
EntityPickCard.displayName = "EntityPickCard";

const EntityPickerInternal: React.FC<EntityPickerProps> = ({
  onSelect,
  selectedIds,
  entities: entitiesOverride,
  height = 360,
  autoFocus = false
}) => {
  const { data, isLoading } = useEntities();
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<KindFilter>("all");

  const library = entitiesOverride ?? data;
  const visible = useMemo(
    () => filterEntities(library ?? [], kind, query),
    [library, kind, query]
  );
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds]);

  const libraryEmpty = !isLoading && (library ?? []).length === 0;

  return (
    <FlexColumn gap={SPACING.md}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search entities by name, kind, or tag"
        ariaLabel="Search entities"
        size="small"
        autoFocus={autoFocus}
        fullWidth
      />
      <ToggleGroup
        value={kind}
        exclusive
        segmented
        size="small"
        aria-label="Entity kind"
        onChange={(_, value: KindFilter | null) => {
          if (value) {
            setKind(value);
          }
        }}
      >
        {KIND_FILTERS.map((filter) => (
          <ToggleOption key={filter.value} value={filter.value}>
            {filter.label}
          </ToggleOption>
        ))}
      </ToggleGroup>
      <Box sx={{ height, overflowY: "auto" }}>
        {!library && isLoading ? (
          <LoadingSpinner size="small" text="Loading entities" />
        ) : libraryEmpty ? (
          <EmptyState
            variant="empty"
            title="No entities yet"
            description="Characters, locations, styles, and props you create show up here."
            size="small"
          />
        ) : visible.length === 0 ? (
          <EmptyState
            variant="no-results"
            title="No entities match"
            description="Try another name, kind, or tag."
            size="small"
          />
        ) : (
          <AutoGrid minItemWidth={132} gap={SPACING.md} aria-label="Entities">
            {visible.map((entity) => (
              <EntityPickCard
                key={entity.id}
                entity={entity}
                selected={selected.has(entity.id)}
                onSelect={onSelect}
              />
            ))}
          </AutoGrid>
        )}
      </Box>
      {selected.size > 0 && (
        <Caption color="secondary">{selected.size} selected</Caption>
      )}
    </FlexColumn>
  );
};

export const EntityPicker = memo(EntityPickerInternal);
export default EntityPicker;
