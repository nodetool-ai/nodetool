/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useCallback, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { useTheme, type Theme } from "@mui/material/styles";
import { serializeDragData, useDragDropStore } from "../../lib/dragdrop";
import CategorySearchBar from "../node_menu/CategorySearchBar";
import {
  AutoGrid,
  Caption,
  Chip,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ResponsiveImage,
  SPACING,
  SectionHeader,
  TYPOGRAPHY,
  TruncatedText,
  getSpacingPx,
  listPanelStyles,
  selectableTileStyles,
  selectedTileStyles,
  Tooltip
} from "../ui_primitives";
import {
  useExampleGroups,
  type ExampleEntry,
  type ExampleGroup,
  type ExampleKind
} from "./useExampleGroups";

type ExampleFilter = ExampleKind | "all";

const cardStyles = (theme: Theme) =>
  css({
    ".example-card": {
      ...selectableTileStyles(theme),
      display: "grid",
      gridTemplateRows: "auto 1fr",
      minWidth: 0,
      padding: 0,
      textAlign: "left",
      color: theme.vars.palette.text.primary,
      background: theme.vars.palette.c_node_bg,
      overflow: "hidden",
      cursor: "pointer",
      "&.active": { ...selectedTileStyles(theme), cursor: "wait" }
    },
    ".example-thumb": {
      position: "relative",
      display: "grid",
      placeItems: "center",
      width: "100%",
      aspectRatio: "16 / 9",
      background: theme.vars.palette.c_node_bg_group,
      color: theme.vars.palette.text.secondary,
      overflow: "hidden",
      // The card is the drag source, not the image inside it.
      img: { pointerEvents: "none" }
    },
    ".example-busy": {
      position: "absolute",
      inset: 0,
      display: "grid",
      placeItems: "center",
      background: theme.vars.palette.c_scrim_strong
    },
    ".example-body": {
      display: "grid",
      gap: getSpacingPx(SPACING.micro),
      padding: getSpacingPx(SPACING.sm)
    }
  });

interface ExampleCardProps {
  readonly entry: ExampleEntry;
  readonly icon: ExampleGroup["icon"];
  readonly opening: boolean;
  readonly onOpen: (key: string) => void;
}

const ExampleCard = memo(function ExampleCard({
  entry,
  icon: Icon,
  opening,
  onOpen
}: ExampleCardProps) {
  const { t } = useTranslation();
  const setActiveDrag = useDragDropStore((state) => state.setActiveDrag);
  const clearDrag = useDragDropStore((state) => state.clearDrag);
  const [thumbFailed, setThumbFailed] = useState(false);
  const { drag, thumbnail } = entry;
  const handleDragStart = useCallback(
    (event: DragEvent<HTMLButtonElement>) => {
      if (!drag) {
        return;
      }
      serializeDragData(drag, event.dataTransfer);
      event.dataTransfer.effectAllowed = "copy";
      setActiveDrag(drag);
    },
    [drag, setActiveDrag]
  );
  const handleOpen = useCallback(() => onOpen(entry.key), [entry.key, onOpen]);
  const handleThumbError = useCallback(() => setThumbFailed(true), []);

  return (
    <Tooltip
      title={entry.secondary ?? ""}
      disabled={!entry.secondary}
      describeChild
    >
      <button
        type="button"
        className={opening ? "example-card active" : "example-card"}
        aria-busy={opening}
        draggable={drag !== undefined}
        onDragStart={drag ? handleDragStart : undefined}
        onDragEnd={drag ? clearDrag : undefined}
        onClick={handleOpen}
      >
        <span className="example-thumb" aria-hidden>
          {thumbnail && !thumbFailed ? (
            <ResponsiveImage
              locator={thumbnail}
              alt=""
              aspectRatio="16 / 9"
              loading="lazy"
              preferThumbnail
              showErrorFallback={false}
              onError={handleThumbError}
            />
          ) : (
            <Icon />
          )}
          {opening && (
            <span className="example-busy">
              <LoadingSpinner size="small" />
            </span>
          )}
        </span>
        <span className="example-body">
          <TruncatedText sx={TYPOGRAPHY.sans.label}>
            {entry.name || t("pass3_40.examples.untitledExample")}
          </TruncatedText>
          <Caption color="secondary" noWrap>
            {opening ? t("pass3_40.examples.addingCopy") : entry.secondary}
          </Caption>
        </span>
      </button>
    </Tooltip>
  );
});

interface ExampleSectionProps {
  readonly group: ExampleGroup;
  readonly entries: readonly ExampleEntry[];
  readonly openingKey: string | null;
  readonly onOpen: (key: string) => void;
}

const ExampleSection = ({
  group,
  entries,
  openingKey,
  onOpen
}: ExampleSectionProps) => {
  const { t } = useTranslation();
  const label = t(`pass3_40.examples.categories.${group.kind}`);
  const dropHintKey =
    group.kind === "workflows"
      ? "pass3_40.examples.dropHints.workflows"
      : group.kind === "models"
        ? "pass3_40.examples.dropHints.models"
        : group.kind === "storyboards" ||
            group.kind === "timelines" ||
            group.kind === "sketches"
          ? "pass3_40.examples.dropHints.canvas"
          : null;

  return (
    <FlexColumn
      component="section"
      aria-label={t("pass3_40.examples.categoryRegion", { category: label })}
      gap={SPACING.xs}
    >
      <SectionHeader title={label} size="small" />
      {dropHintKey && (
        <Caption color="secondary" sx={{ px: SPACING.md, pb: SPACING.xs }}>
          {t(dropHintKey)}
        </Caption>
      )}
      {group.isLoading ? (
        <FlexRow justify="center" sx={{ py: SPACING.md }}>
          <LoadingSpinner
            size="small"
            text={t("pass3_40.examples.loadingCategory", { category: label })}
          />
        </FlexRow>
      ) : group.isError ? (
        <EmptyState
          variant="error"
          size="small"
          title={t("pass3_40.examples.loadError", { category: label })}
          actionText={t("pass3_40.examples.retry")}
          onAction={group.retry}
        />
      ) : (
        <AutoGrid minItemWidth={128} gap={SPACING.md}>
          {entries.map((entry) => (
            <ExampleCard
              key={entry.key}
              entry={entry}
              icon={group.icon}
              opening={entry.key === openingKey}
              onOpen={onOpen}
            />
          ))}
        </AutoGrid>
      )}
    </FlexColumn>
  );
};

/**
 * The left panel's Examples view: every kind of shipped example as a card
 * with the same preview image as the Examples page. A card opens the example
 * as an editable copy. Models, sketches and timelines also drag onto the
 * surfaces that take them.
 */
const ExamplesPanel = () => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { groups, openingKey, open } = useExampleGroups();
  const [filter, setFilter] = useState<ExampleFilter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return groups
      .filter((group) => filter === "all" || group.kind === filter)
      .map((group) => ({
        group,
        entries: needle
          ? group.entries.filter(
              (entry) =>
                entry.name.toLowerCase().includes(needle) ||
                entry.secondary.toLowerCase().includes(needle)
            )
          : group.entries
      }))
      .filter(
        ({ group, entries }) =>
          entries.length > 0 || (!needle && (group.isLoading || group.isError))
      );
  }, [groups, filter, query]);

  return (
    <FlexColumn
      fullHeight
      fullWidth
      gap={0}
      css={[listPanelStyles(theme), cardStyles(theme)]}
    >
      <div className="list-panel-search">
        <CategorySearchBar
          value={query}
          onChange={setQuery}
          placeholder={t("pass3_40.examples.searchPlaceholder")}
        />
      </div>
      <FlexRow
        role="group"
        aria-label={t("pass3_40.examples.typeFilters")}
        wrap
        gap={SPACING.xs}
        sx={{ pb: SPACING.md }}
      >
        <Chip
          compact
          label={t("pass3_40.examples.allCategories")}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {groups.map((group) => (
          <Chip
            key={group.kind}
            compact
            label={t(`pass3_40.examples.categories.${group.kind}`)}
            active={filter === group.kind}
            onClick={() => setFilter(group.kind)}
          />
        ))}
      </FlexRow>
      {visible.length === 0 ? (
        <FlexColumn
          justify="center"
          align="center"
          sx={{ flex: 1, px: SPACING.md }}
        >
          <EmptyState
            variant="no-results"
            title={t("pass3_40.examples.noMatchingExamples")}
            description={t("pass3_40.examples.tryDifferentSearch")}
            actionText={t("pass3_40.examples.clearSearch")}
            onAction={() => setQuery("")}
          />
        </FlexColumn>
      ) : (
        <FlexColumn className="list-panel-list" gap={SPACING.md}>
          {visible.map(({ group, entries }) => (
            <ExampleSection
              key={group.kind}
              group={group}
              entries={entries}
              openingKey={openingKey}
              onOpen={open}
            />
          ))}
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export default memo(ExamplesPanel);
