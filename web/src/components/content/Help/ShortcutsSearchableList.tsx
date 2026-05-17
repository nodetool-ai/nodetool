import React, { useMemo, useState } from "react";
import type { SxProps, Theme } from "@mui/material/styles";
import { Box } from "@mui/material";
import { Text, TextInput } from "../../ui_primitives";
import {
  getShortcutTooltip,
  SHORTCUT_CATEGORIES,
  type Shortcut
} from "../../../config/shortcuts";

const categories = Object.keys(SHORTCUT_CATEGORIES) as Array<
  keyof typeof SHORTCUT_CATEGORIES
>;

export interface ShortcutsSearchableListProps {
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
  searchPlaceholder = "Search shortcuts"
}) => {
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

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        ...rootSx
      }}
    >
      <TextInput
        variant="outlined"
        size="small"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
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
        {categories.map((cat) => {
          const list = groupedShortcuts.get(cat);
          if (!list || !list.length) {
            return null;
          }
          return (
            <Box key={cat} sx={{ mb: 3 }}>
              <Text size="bigger" color="secondary" sx={{ mb: 4 }}>
                {SHORTCUT_CATEGORIES[cat] ??
                  cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Text>
              {list.map((s) => (
                <Box
                  key={s.slug}
                  className="help-item"
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  <Text sx={{ minWidth: 200 }}>{s.title}</Text>
                  <Box sx={{ minWidth: 200 }}>
                    {getShortcutTooltip(s.slug, undefined, "combo", false, catalog)}
                  </Box>
                  {s.description ? (
                    <Text
                      size="small"
                      sx={{
                        color: "var(--palette-grey-200)",
                        fontWeight: 300
                      }}
                    >
                      {s.description}
                    </Text>
                  ) : null}
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
