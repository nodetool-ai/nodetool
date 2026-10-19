import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SxProps, Theme } from "@mui/material/styles";
import {
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  SectionHeader,
  Text,
  TextInput,
  Box,
  Z_INDEX
} from "../../ui_primitives";
import {
  getShortcutTooltip,
  SHORTCUT_CATEGORIES,
  type Shortcut
} from "../../../config/shortcuts";

const categories = Object.keys(SHORTCUT_CATEGORIES) as Array<
  keyof typeof SHORTCUT_CATEGORIES
>;

interface ShortcutsSearchableListProps {
  shortcuts: readonly Shortcut[];
  /** Catalog for resolving shortcut slugs in combo tooltips (defaults to `shortcuts`). */
  tooltipCatalog?: readonly Shortcut[];
  /** Extra styles on the outer column wrapper. */
  rootSx?: SxProps<Theme>;
  /** Styles on the scrollable list region (e.g. maxHeight in compact layouts). */
  scrollSx?: SxProps<Theme>;
  /** Search field placeholder override. */
  searchPlaceholder?: string;
}

/**
 * Search + grouped shortcut rows (same grouping as Help ▸ Shortcuts tab).
 */
export const ShortcutsSearchableList: React.FC<ShortcutsSearchableListProps> = ({
  shortcuts,
  tooltipCatalog,
  rootSx,
  scrollSx,
  searchPlaceholder
}) => {
  const { t } = useTranslation();
  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("i18n-next35.help.searchShortcuts");
  const catalog = tooltipCatalog ?? shortcuts;
  const [search, setSearch] = useState("");

  const groupedShortcuts = useMemo(() => {
    const lower = search.toLowerCase();
    const groups = new Map<keyof typeof SHORTCUT_CATEGORIES, Shortcut[]>();
    for (const cat of categories) {
      groups.set(cat, []);
    }
    for (const s of shortcuts) {
      if (
        lower &&
        !s.title.toLowerCase().includes(lower) &&
        !(s.description && s.description.toLowerCase().includes(lower))
      ) {
        continue;
      }
      groups.get(s.category)?.push(s);
    }
    return groups;
  }, [search, shortcuts]);

  const hasResults = useMemo(
    () => Array.from(groupedShortcuts.values()).some((list) => list.length > 0),
    [groupedShortcuts]
  );

  return (
    <FlexColumn
      sx={{
        minHeight: 0,
        ...rootSx
      }}
    >
      <TextInput
        variant="outlined"
        size="small"
        placeholder={resolvedSearchPlaceholder}
        slotProps={{ htmlInput: { "aria-label": resolvedSearchPlaceholder } }}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: Z_INDEX.dropdown,
          mb: 2,
          backgroundColor: "background.paper",
          flexShrink: 0
        }}
      />
      <Box
        sx={{
          overflowY: "auto",
          pr: 1,
          flex: 1,
          minHeight: 0,
          ...scrollSx
        }}
      >
        {!hasResults && (
          <EmptyState
            variant="no-results"
            size="small"
            title={t("i18n-next35.help.noMatchingShortcuts")}
            description={t("i18n-next35.help.tryDifferentSearchTerm")}
          />
        )}
        {categories.map((cat) => {
          const list = groupedShortcuts.get(cat);
          if (!list || !list.length) {
            return null;
          }
          return (
            <Box key={cat} sx={{ mb: 3 }}>
              <SectionHeader
                size="small"
                title={
                  t(
                    `i18n-next35.help.categories.${cat === "image-editor" ? "imageEditor" : cat}`
                  )
                }
              />
              {list.map((s) => (
                <FlexRow
                  key={s.slug}
                  className="help-item"
                  align="center"
                >
                  <Text sx={{ minWidth: 200 }}>{s.title}</Text>
                  <Box sx={{ minWidth: 200 }}>
                    {getShortcutTooltip(s.slug, undefined, "combo", false, catalog)}
                  </Box>
                  {s.description ? (
                    <Caption color="secondary">{s.description}</Caption>
                  ) : null}
                </FlexRow>
              ))}
            </Box>
          );
        })}
      </Box>
    </FlexColumn>
  );
};
