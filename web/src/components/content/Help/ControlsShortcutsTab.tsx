import React, { useState } from "react";
import { Box } from "@mui/material";
import { Text, TextInput } from "../../ui_primitives";
import {
  NODE_EDITOR_SHORTCUTS,
  getShortcutTooltip,
  SHORTCUT_CATEGORIES
} from "../../../config/shortcuts";

const ControlsShortcutsTab: React.FC = () => {
  const [search, setSearch] = useState("");
  const lower = search.toLowerCase();

  // dynamic filter
  const filteredShortcuts = NODE_EDITOR_SHORTCUTS.filter((s) => {
    if (!lower) {return true;}
    return (
      s.title.toLowerCase().includes(lower) ||
      (s.description && s.description.toLowerCase().includes(lower))
    );
  });

  // List of category keys derived from the exported mapping
  const categories = Object.keys(SHORTCUT_CATEGORIES) as Array<
    keyof typeof SHORTCUT_CATEGORIES
  >;

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <TextInput
        variant="outlined"
        size="small"
        placeholder="Search shortcuts"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          mb: 2,
          backgroundColor: "background.paper"
        }}
      />
      <Box sx={{ overflowY: "auto", pr: 1 }}>
        {categories.map((cat) => {
          const list = filteredShortcuts.filter((s) => s.category === cat);
          if (!list.length) {return null;}
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
                  {/* Title */}
                  <Text sx={{ minWidth: 160 }}>{s.title}</Text>
                  <Box sx={{ minWidth: 200 }}>
                    {getShortcutTooltip(s.slug, undefined, "combo")}
                  </Box>
                  {/* Description */}
                  {s.description && (
                    <Text
                      size="small"
                      sx={{
                        color: "var(--palette-grey-200)",
                        fontWeight: 300
                      }}
                    >
                      {s.description}
                    </Text>
                  )}
                </Box>
              ))}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

export default ControlsShortcutsTab;
