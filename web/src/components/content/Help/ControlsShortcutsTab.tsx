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
              <Typography variant="h2" color="#999" sx={{ mb: 1 }}>
                {SHORTCUT_CATEGORIES[cat] ??
                  cat.charAt(0).toUpperCase() + cat.slice(1)}
              </Typography>
              {list.map((s) => (
                <Box key={s.slug} className="help-item">
                  <Typography sx={{ minWidth: 160 }}>{s.title}</Typography>
                  {
                    getShortcutTooltip(
                      s.slug,
                      undefined,
                      "combo"
                    ) as unknown as string
                  }
                  {s.description && (
                    <Typography variant="body2" sx={{ ml: 1 }}>
                      {s.description}
                    </Typography>
                  )}
                </Box>
              ))}
            </Box>
          );
        })}
        {(() => {
          interface StaticItem {
            section: string;
            title: string;
            desc: string;
          }
          const staticItems: StaticItem[] = [
            {
              section: "Nodes – Create",
              title: "Search in Node Menu",
              desc: "Start typing while the menu is open"
            },
            {
              section: "Nodes – Create",
              title: "Connection Menu",
              desc: "Drop a connection on empty canvas"
            },
            {
              section: "Nodes – Parameters",
              title: "Drag Number",
              desc: "Click & drag horizontally (Shift = fine)"
            },
            {
              section: "Nodes – Parameters",
              title: "Edit Number",
              desc: "Click value and type new number"
            },
            {
              section: "Nodes – Parameters",
              title: "Set Default",
              desc: "Ctrl/⌘ + Right-Click"
            },
            {
              section: "Nodes – Parameters",
              title: "Confirm / Cancel",
              desc: "Enter / Esc"
            }
          ];

          const filteredStatic = staticItems.filter((it) => {
            if (!lower) return true;
            return (
              it.title.toLowerCase().includes(lower) ||
              it.desc.toLowerCase().includes(lower) ||
              it.section.toLowerCase().includes(lower)
            );
          });

          const sectionOrder = [
            "Nodes – Create",
            "Nodes – Parameters",
            "Workflows",
            "Command Menu"
          ];

          return sectionOrder.map((sec) => {
            const items = filteredStatic.filter((i) => i.section === sec);
            if (!items.length) return null;
            return (
              <React.Fragment key={sec}>
                {items.map((it, idx) => (
                  <Box key={idx} className="help-item">
                    <Typography sx={{ minWidth: 160 }}>{it.title}</Typography>
                    <Typography variant="body2">{it.desc}</Typography>
                  </Box>
                ))}
              </React.Fragment>
            );
          });
        })()}
      </Box>
    </Box>
  );
};

export default ControlsShortcutsTab;
