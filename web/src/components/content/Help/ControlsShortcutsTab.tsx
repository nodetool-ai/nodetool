import React, { useState } from "react";
import { Box, Typography, TextField } from "@mui/material";
import {
  NODE_EDITOR_SHORTCUTS,
  getShortcutTooltip
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

  const categories: Array<"panel" | "nodes"> = ["panel", "nodes"];

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
                {cat === "panel" ? "Panels" : "Nodes"}
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
        {/* Static instructional sections */}
        <Typography variant="h2" color="#999" sx={{ mb: 1 }}>
          Nodes – Create
        </Typography>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Open Node Menu</Typography>
          <Typography variant="body2">
            Double-click canvas or press Space
          </Typography>
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Search in Node Menu</Typography>
          <Typography variant="body2">
            Start typing while the menu is open
          </Typography>
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Connection Menu</Typography>
          <Typography variant="body2">
            Drop a connection on empty canvas
          </Typography>
        </Box>

        <Typography variant="h2" color="#999" sx={{ mt: 3, mb: 1 }}>
          Nodes – Parameters
        </Typography>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Drag Number</Typography>
          <Typography variant="body2">
            Click & drag horizontally (Shift = fine)
          </Typography>
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Edit Number</Typography>
          <Typography variant="body2">
            Click value and type new number
          </Typography>
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Set Default</Typography>
          <Typography variant="body2">Ctrl/⌘ + Right-Click</Typography>
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Confirm / Cancel</Typography>
          <Typography variant="body2">Enter / Esc</Typography>
        </Box>

        <Typography variant="h2" color="#999" sx={{ mt: 3, mb: 1 }}>
          Workflows
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          You can start and stop workflows with the top toolbar buttons or
          shortcuts. Stopping may take a few seconds depending on the task.
        </Typography>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Run Workflow</Typography>
          {
            getShortcutTooltip(
              "run-workflow",
              undefined,
              "combo"
            ) as unknown as string
          }
        </Box>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Cancel Workflow</Typography>
          {
            getShortcutTooltip(
              "stop-workflow",
              undefined,
              "combo"
            ) as unknown as string
          }
        </Box>

        <Typography variant="h2" color="#999" sx={{ mt: 3, mb: 1 }}>
          Command Menu
        </Typography>
        <Box className="help-item">
          <Typography sx={{ minWidth: 200 }}>Open Command Menu</Typography>
          <Typography variant="body2">Alt + K / ⌘ + K</Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default ControlsShortcutsTab;
