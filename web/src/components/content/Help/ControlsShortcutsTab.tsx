import React from "react";
import { Box } from "@mui/material";
import { NODE_EDITOR_SHORTCUTS } from "../../../config/shortcuts";
import { ShortcutsSearchableList } from "./ShortcutsSearchableList";

const ControlsShortcutsTab: React.FC = () => {
  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        minHeight: 0
      }}
    >
      <ShortcutsSearchableList
        shortcuts={NODE_EDITOR_SHORTCUTS}
        rootSx={{ flex: 1, minHeight: 0 }}
        scrollSx={{ flex: 1, minHeight: 0 }}
      />
    </Box>
  );
};

export default ControlsShortcutsTab;
