import React, { useState } from "react";
import { Box, Typography, TextField } from "@mui/material";
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
    if (!lower) return true;
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
      <TextField
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
          if (!list.length) return null;
          return (
            <Box key={cat} sx={{ mb: 3 }}>
              <Typography variant="h2" color="#999" sx={{ mb: 4 }}>
                {SHORTCUT_CATEGORIES[cat] ??
                  cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Typography>
              {list.map((s) => (
                <Box
                  key={s.slug}
                  className="help-item"
                  sx={{ display: "flex", alignItems: "center" }}
                >
                  {/* Title */}
                  <Typography sx={{ minWidth: 160 }}>{s.title}</Typography>
                  <Box sx={{ minWidth: 200 }}>
                    {getShortcutTooltip(s.slug, undefined, "combo")}
                  </Box>
                  {/* Description */}
                  {s.description && (
                    <Typography
                      variant="body2"
                      sx={{
                        color: "var(--palette-grey-200)",
                        fontWeight: 300
                      }}
                    >
                      {s.description}
                    </Typography>
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
